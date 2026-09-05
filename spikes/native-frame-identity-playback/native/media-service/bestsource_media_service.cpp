#include "prepared_video_session.hpp"
#include "preview_size.hpp"
#include "protocol.hpp"

#include <bestsource/bsshared.h>
#include <bestsource/videosource.h>

extern "C" {
#include <libavutil/frame.h>
#include <libavutil/pixfmt.h>
#include <libswscale/swscale.h>
}

#include <chrono>
#include <cstdint>
#include <fcntl.h>
#include <filesystem>
#include <iomanip>
#include <io.h>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using Clock = std::chrono::steady_clock;

struct SwsDeleter {
    void operator()(SwsContext* value) const { sws_freeContext(value); }
};

struct ConvertedFrame {
    std::vector<std::uint8_t> pixels;
    int width;
    int height;
    int stride;
};

double elapsed_ms(Clock::time_point started) {
    return std::chrono::duration<double, std::milli>(Clock::now() - started).count();
}

double duration_ms(Clock::time_point started, Clock::time_point ended) {
    return std::chrono::duration<double, std::milli>(ended - started).count();
}

std::string frame_hash(const std::array<std::uint8_t, HashSize>& hash) {
    std::ostringstream output;
    for (const auto byte : hash) {
        output << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
    }
    return output.str();
}

ConvertedFrame convert_rgba(const BestVideoFrame& frame, unsigned maximum_width,
                            unsigned maximum_height) {
    const auto* source = frame.GetAVFrame();
    if (!source || source->width <= 0 || source->height <= 0) {
        throw std::runtime_error("BestSource returned an invalid decoded frame");
    }
    const auto preview = frame_bridge::fit_preview_size(
        static_cast<unsigned>(source->width), static_cast<unsigned>(source->height),
        maximum_width, maximum_height);
    const auto stride = static_cast<int>(preview.width * 4);
    const auto bytes = static_cast<std::size_t>(stride) * preview.height;
    if (bytes > frame_bridge::maximum_payload_bytes) {
        throw std::runtime_error("decoded frame exceeds the bridge payload limit");
    }
    ConvertedFrame converted{std::vector<std::uint8_t>(bytes),
                             static_cast<int>(preview.width), static_cast<int>(preview.height), stride};
    std::unique_ptr<SwsContext, SwsDeleter> scaler(sws_getContext(
        source->width, source->height, static_cast<AVPixelFormat>(source->format),
        converted.width, converted.height, AV_PIX_FMT_RGBA, SWS_BILINEAR, nullptr, nullptr, nullptr));
    if (!scaler) throw std::runtime_error("sws_getContext failed");
    std::uint8_t* destinations[4]{converted.pixels.data(), nullptr, nullptr, nullptr};
    int strides[4]{converted.stride, 0, 0, 0};
    if (sws_scale(scaler.get(), source->data, source->linesize, 0, source->height,
                  destinations, strides) != converted.height) {
        throw std::runtime_error("frame conversion returned an incomplete image");
    }
    return converted;
}

class MediaService {
public:
    bool Handle(const frame_bridge::Message& request) {
        const auto request_id = required<std::string>(request.metadata, "requestId");
        const auto command = required<std::string>(request.metadata, "command");
        if (!request.payload.empty()) throw std::invalid_argument("commands cannot contain binary payloads");
        try {
            if (command == "open") Open(request_id, request.metadata);
            else if (command == "close") Close(request_id);
            else if (command == "exact" || command == "scrub") Frame(request_id, command,
                required<std::int64_t>(request.metadata, "frameIndex"), 0);
            else if (command == "time") Frame(request_id, command,
                FrameAtTime(required<std::string>(request.metadata, "timeUs")), 0);
            else if (command == "step") Frame(request_id, command, 0,
                required<int>(request.metadata, "direction"));
            else if (command == "status") Status(request_id);
            else if (command == "shutdown") {
                session_.reset();
                identity_source_.reset();
                source_.reset();
                ++source_generation_;
                frame_generation_ = 0;
                WriteStatus(request_id, "shutdown", "closed");
                return false;
            } else if (command == "play" || command == "pause" || command == "stop" || command == "rate") {
                WriteError(request_id, "unsupported-command",
                           "BestSource exact-frame service does not own clocked playback");
            } else {
                WriteError(request_id, "invalid-request", "unknown media-service command");
            }
        } catch (const nlohmann::json::exception& error) {
            WriteError(request_id, "invalid-request", error.what());
        } catch (const std::out_of_range& error) {
            WriteError(request_id, "frame-boundary", error.what());
        } catch (const std::invalid_argument& error) {
            WriteError(request_id, "invalid-request", error.what());
        } catch (const std::logic_error& error) {
            WriteError(request_id, "invalid-state", error.what());
        } catch (const std::exception& error) {
            WriteError(request_id, "backend-failure", error.what());
        }
        return true;
    }

private:
    template <typename Value>
    static Value required(const nlohmann::json& value, const char* field) {
        if (!value.contains(field)) throw std::invalid_argument(std::string("missing field: ") + field);
        return value.at(field).get<Value>();
    }

    void Open(const std::string& request_id, const nlohmann::json& request) {
        const auto source_path = required<std::string>(request, "sourcePath");
        const auto index_path = required<std::string>(request, "indexPath");
        const auto requested_generation = required<std::uint64_t>(request, "sourceGeneration");
        const auto requested_width = request.value("maxPreviewWidth", 8192U);
        const auto requested_height = request.value("maxPreviewHeight", 8192U);
        if (requested_width == 0 || requested_width > 16384 ||
            requested_height == 0 || requested_height > 16384 ||
            static_cast<std::uint64_t>(requested_width) * requested_height * 4 >
                frame_bridge::maximum_payload_bytes) {
            throw std::invalid_argument("preview bounds must be between 1 and 16384 pixels");
        }
        const auto started = Clock::now();
        std::map<std::string, std::string> lavf_options;
        auto source = std::make_unique<BestVideoSource>(
            std::filesystem::u8path(source_path), "", 0, -1, 0, 0, bcmAlwaysAbsolutePath,
            std::filesystem::u8path(index_path), &lavf_options,
            [](int, std::int64_t, std::int64_t) { return true; });
        source->SetMaxCacheSize(256ull * 1024 * 1024);
        source->SetSeekPreRoll(20);
        const auto decoder_instances = source->SetMaxDecoderInstances(2);
        std::unique_ptr<BestVideoSource> identity_source;
        const auto has_identity_source = request.contains("identitySourcePath") || request.contains("identityIndexPath");
        if (has_identity_source) {
            if (!request.contains("identitySourcePath") || !request.contains("identityIndexPath")) {
                throw std::invalid_argument("identity source path and index must be supplied together");
            }
            identity_source = std::make_unique<BestVideoSource>(
                std::filesystem::u8path(required<std::string>(request, "identitySourcePath")), "", 0, -1, 0, 0,
                bcmAlwaysAbsolutePath, std::filesystem::u8path(required<std::string>(request, "identityIndexPath")),
                &lavf_options, [](int, std::int64_t, std::int64_t) { return true; });
            if (identity_source->GetVideoProperties().NumFrames != source->GetVideoProperties().NumFrames) {
                throw std::invalid_argument("display proxy and identity source frame counts differ");
            }
        }
        auto session = std::make_unique<PreparedVideoSession>(*source);
        source_ = std::move(source);
        identity_source_ = std::move(identity_source);
        session_ = std::move(session);
        source_generation_ = requested_generation;
        maximum_preview_width_ = requested_width;
        maximum_preview_height_ = requested_height;
        frame_generation_ = 0;
        const auto& properties = source_->GetVideoProperties();
        frame_bridge::write_message(std::cout, {
            {"type", "status"}, {"requestId", request_id}, {"command", "open"},
            {"state", "exact-ready"}, {"sourceGeneration", source_generation_},
            {"numFrames", properties.NumFrames}, {"duration", std::to_string(properties.Duration)},
            {"timebase", {{"numerator", properties.TimeBase.Num}, {"denominator", properties.TimeBase.Den}}},
            {"decoderInstances", decoder_instances}, {"identityMapped", identity_source_ != nullptr},
            {"constructorMs", elapsed_ms(started)},
        });
    }

    void Close(const std::string& request_id) {
        session_.reset();
        identity_source_.reset();
        source_.reset();
        ++source_generation_;
        frame_generation_ = 0;
        WriteStatus(request_id, "close", "closed");
    }

    void Status(const std::string& request_id) {
        WriteStatus(request_id, "status", source_ ? "exact-ready" : "closed");
    }

    void Frame(const std::string& request_id, const std::string& command,
               std::int64_t frame_index, int direction) {
        if (!source_ || !session_) throw std::logic_error("no prepared source is open");
        const auto started = Clock::now();
        const auto access = command == "step" ? session_->StepAdjacent(direction) : session_->GetExact(frame_index);
        const auto decoded = Clock::now();
        if (!access.frame) throw std::runtime_error("BestSource returned no frame");
        const auto* source_frame = access.frame->GetAVFrame();
        if (!source_frame) throw std::runtime_error("BestSource returned an invalid decoded frame");
        auto converted = convert_rgba(*access.frame, maximum_preview_width_, maximum_preview_height_);
        const auto converted_at = Clock::now();
        const auto& identity_source = IdentitySource();
        const auto& properties = identity_source.GetVideoProperties();
        const auto& info = identity_source.GetFrameInfo(access.frame_index);
        const auto& review_properties = source_->GetVideoProperties();
        const auto& review_info = source_->GetFrameInfo(access.frame_index);
        ++frame_generation_;
        nlohmann::json metadata{
            {"type", "frame"}, {"requestId", request_id}, {"command", command},
            {"sourceGeneration", source_generation_}, {"frameGeneration", frame_generation_},
            {"width", converted.width}, {"height", converted.height}, {"stride", converted.stride},
            {"sourceWidth", source_frame->width}, {"sourceHeight", source_frame->height},
            {"pixelFormat", "RGBA8888"}, {"payloadBytes", converted.pixels.size()},
            {"identity", {
                {"frameIndex", access.frame_index},
                {"originalFrameIndex", identity_source.GetOriginalFrameNumber(access.frame_index)},
                {"pts", std::to_string(info.PTS)},
                {"duration", std::to_string(FrameDuration(identity_source, access.frame_index))},
                {"timebaseNumerator", std::to_string(properties.TimeBase.Num)},
                {"timebaseDenominator", std::to_string(properties.TimeBase.Den)},
                {"frameInfoPts", std::to_string(info.PTS)},
                {"frameInfoHash", frame_hash(info.Hash)},
            }},
            {"reviewTime", {
                {"pts", std::to_string(review_info.PTS)},
                {"duration", std::to_string(FrameDuration(*source_, access.frame_index))},
                {"timebaseNumerator", std::to_string(review_properties.TimeBase.Num)},
                {"timebaseDenominator", std::to_string(review_properties.TimeBase.Den)},
            }},
            {"access", {
                {"path", access.access_path}, {"cacheHit", access.cache_hit},
                {"cachedFrames", session_->CachedFrameCount()}, {"cachedBytes", session_->CachedBytes()},
            }},
            {"timings", {
                {"decodeMs", duration_ms(started, decoded)},
                {"conversionMs", duration_ms(decoded, converted_at)},
                {"serviceBeforeWriteMs", duration_ms(started, converted_at)},
            }},
        };
        frame_bridge::write_message(std::cout, metadata, converted.pixels.data(), converted.pixels.size());
    }

    std::int64_t FrameAtTime(const std::string& value) const {
        if (!source_) throw std::logic_error("no prepared source is open");
        std::size_t consumed = 0;
        const auto time_us = std::stoll(value, &consumed);
        if (consumed != value.size() || time_us < 0) throw std::invalid_argument("invalid frame lookup time");
        const auto& properties = source_->GetVideoProperties();
        if (properties.NumFrames <= 1) return 0;
        const long double target_pts = static_cast<long double>(time_us) * properties.TimeBase.Den /
            (static_cast<long double>(properties.TimeBase.Num) * 1'000'000.0L);
        std::int64_t lower = 0;
        std::int64_t upper = properties.NumFrames;
        while (lower < upper) {
            const auto middle = lower + (upper - lower) / 2;
            if (static_cast<long double>(source_->GetFrameInfo(middle).PTS) < target_pts) lower = middle + 1;
            else upper = middle;
        }
        if (lower <= 0) return 0;
        if (lower >= properties.NumFrames) return properties.NumFrames - 1;
        const auto before = lower - 1;
        const auto before_distance = std::abs(
            static_cast<long double>(source_->GetFrameInfo(before).PTS) - target_pts);
        const auto after_distance = std::abs(
            static_cast<long double>(source_->GetFrameInfo(lower).PTS) - target_pts);
        return after_distance < before_distance ? lower : before;
    }

    const BestVideoSource& IdentitySource() const {
        if (!source_) throw std::logic_error("no prepared source is open");
        return identity_source_ ? *identity_source_ : *source_;
    }

    static std::int64_t FrameDuration(const BestVideoSource& source, std::int64_t frame_index) {
        const auto& properties = source.GetVideoProperties();
        const auto pts = source.GetFrameInfo(frame_index).PTS;
        if (frame_index + 1 < properties.NumFrames) {
            const auto duration = source.GetFrameInfo(frame_index + 1).PTS - pts;
            if (duration > 0) return duration;
        }
        const auto remaining = properties.Duration - pts;
        return remaining > 0 ? remaining : 0;
    }

    void WriteStatus(const std::string& request_id, const std::string& command,
                     const std::string& state) const {
        frame_bridge::write_message(std::cout, {
            {"type", "status"}, {"requestId", request_id}, {"command", command},
            {"state", state}, {"sourceGeneration", source_generation_},
            {"frameGeneration", frame_generation_},
        });
    }

    void WriteError(const std::string& request_id, const std::string& category,
                    const std::string& message) const {
        frame_bridge::write_message(std::cout, {
            {"type", "error"}, {"requestId", request_id},
            {"sourceGeneration", source_generation_},
            {"error", {{"category", category}, {"message", message}, {"recoverable", true}}},
        });
    }

    std::unique_ptr<BestVideoSource> source_;
    std::unique_ptr<BestVideoSource> identity_source_;
    std::unique_ptr<PreparedVideoSession> session_;
    std::uint64_t source_generation_ = 0;
    std::uint64_t frame_generation_ = 0;
    unsigned maximum_preview_width_ = 8192;
    unsigned maximum_preview_height_ = 8192;
};

}  // namespace

int main() {
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    try {
        MediaService service;
        frame_bridge::Message request;
        while (frame_bridge::read_message(std::cin, request)) {
            if (!service.Handle(request)) break;
        }
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "media service terminated: " << error.what() << '\n';
        return 1;
    }
}
