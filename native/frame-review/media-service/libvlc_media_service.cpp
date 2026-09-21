#include "libvlc_api.hpp"
#include "preview_size.hpp"
#include "protocol.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <deque>
#include <fcntl.h>
#include <filesystem>
#include <io.h>
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {

class ProtocolWriter {
public:
    void Write(const nlohmann::json& metadata, const std::uint8_t* payload = nullptr,
               std::size_t payload_size = 0) {
        std::lock_guard<std::mutex> lock(mutex_);
        frame_bridge::write_message(std::cout, metadata, payload, payload_size);
    }

private:
    std::mutex mutex_;
};

class PlaybackFrames {
public:
    PlaybackFrames(ProtocolWriter& writer, std::uint64_t source_generation,
                   unsigned maximum_width, unsigned maximum_height)
        : writer_(writer), source_generation_(source_generation),
          maximum_width_(maximum_width), maximum_height_(maximum_height),
          worker_([this] { OutputLoop(); }) {}

    ~PlaybackFrames() {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            stopping_ = true;
            if (pending_) {
                pending_->in_use = false;
                pending_ = nullptr;
            }
        }
        condition_.notify_all();
        worker_.join();
    }

    static unsigned Format(void** opaque, char* chroma, unsigned* width, unsigned* height,
                           unsigned* pitches, unsigned* lines) {
        auto& state = *static_cast<PlaybackFrames*>(*opaque);
        std::unique_lock<std::mutex> lock(state.mutex_);
        state.condition_.wait(lock, [&] {
            return std::all_of(state.buffers_.begin(), state.buffers_.end(),
                               [](const auto& slot) { return !slot->in_use; });
        });
        std::memcpy(chroma, "RGBA", 4);
        // LibVLC may renegotiate using the preview dimensions returned by an earlier
        // callback. Preserve the largest coded buffer extent seen for display projection.
        if (*width > state.source_buffer_width_) state.source_buffer_width_ = *width;
        if (*height > state.source_buffer_height_) state.source_buffer_height_ = *height;
        const auto preview = frame_bridge::fit_preview_size(
            *width, *height, state.maximum_width_, state.maximum_height_);
        *width = preview.width;
        *height = preview.height;
        state.width_ = preview.width;
        state.height_ = preview.height;
        state.stride_ = preview.width * 4;
        pitches[0] = state.stride_;
        lines[0] = *height;
        state.buffers_.clear();
        for (int index = 0; index < 8; ++index) {
            auto slot = std::make_unique<Buffer>();
            slot->pixels.resize(static_cast<std::size_t>(state.stride_) * state.height_);
            state.buffers_.push_back(std::move(slot));
        }
        return static_cast<unsigned>(state.buffers_.size());
    }

    static void Cleanup(void*) {}

    static void* Lock(void* opaque, void** planes) {
        auto& state = *static_cast<PlaybackFrames*>(opaque);
        std::unique_lock<std::mutex> lock(state.mutex_);
        state.condition_.wait(lock, [&] {
            return state.stopping_ || std::any_of(state.buffers_.begin(), state.buffers_.end(),
                                                  [](const auto& slot) { return !slot->in_use; });
        });
        if (state.stopping_) return nullptr;
        for (const auto& slot : state.buffers_) {
            if (!slot->in_use) {
                slot->in_use = true;
                planes[0] = slot->pixels.data();
                return slot.get();
            }
        }
        return nullptr;
    }

    static void Unlock(void*, void*, void* const*) {}

    static void Display(void* opaque, void* picture) {
        auto& state = *static_cast<PlaybackFrames*>(opaque);
        auto* slot = static_cast<Buffer*>(picture);
        std::lock_guard<std::mutex> lock(state.mutex_);
        if (state.seeking_ || state.output_suppressed_) {
            slot->in_use = false;
            ++state.dropped_frames_;
            state.condition_.notify_all();
            return;
        }
        if (state.pending_) {
            state.pending_->in_use = false;
            ++state.dropped_frames_;
        }
        slot->sequence = ++state.frame_generation_;
        slot->time_us = state.latest_time_us_;
        state.pending_ = slot;
        state.condition_.notify_all();
    }

    static void OnTime(void* opaque, const libvlc_media_player_time_point_t* point) {
        if (!point) return;
        auto& state = *static_cast<PlaybackFrames*>(opaque);
        std::lock_guard<std::mutex> lock(state.mutex_);
        state.latest_time_us_ = point->ts_us;
    }

    static void OnPaused(void*, libvlc_time_t) {}
    static void OnSeek(void* opaque, const libvlc_media_player_time_point_t* point) {
        auto& state = *static_cast<PlaybackFrames*>(opaque);
        {
            std::lock_guard<std::mutex> lock(state.mutex_);
            if (point) {
                state.seeking_ = true;
                state.latest_time_us_ = point->ts_us;
            } else {
                state.seeking_ = false;
                state.completed_seek_generation_ = state.requested_seek_generation_;
            }
        }
        state.condition_.notify_all();
    }

    static void OnState(void* opaque, libvlc_state_t state) {
        auto& frames = *static_cast<PlaybackFrames*>(opaque);
        {
            std::lock_guard<std::mutex> lock(frames.mutex_);
            frames.state_ = state;
        }
        frames.condition_.notify_all();
    }

    bool WaitForState(libvlc_state_t state, std::chrono::milliseconds timeout) {
        std::unique_lock<std::mutex> lock(mutex_);
        return condition_.wait_for(lock, timeout, [&] { return state_ == state; });
    }

    std::uint64_t WrittenFrameGeneration() {
        std::lock_guard<std::mutex> lock(mutex_);
        return written_frame_generation_;
    }

    bool WaitForWrittenFrameAfter(std::uint64_t generation, std::chrono::milliseconds timeout) {
        std::unique_lock<std::mutex> lock(mutex_);
        return condition_.wait_for(lock, timeout, [&] {
            return stopping_ || written_frame_generation_ > generation;
        }) && !stopping_;
    }

    void SetOutputSuppressed(bool suppressed) {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            output_suppressed_ = suppressed;
            if (suppressed && pending_) {
                pending_->in_use = false;
                pending_ = nullptr;
                ++dropped_frames_;
            }
        }
        condition_.notify_all();
    }

    void Acknowledge(std::uint64_t frame_generation) {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (awaiting_ack_generation_ != 0 && frame_generation >= awaiting_ack_generation_) {
                awaiting_ack_generation_ = 0;
            }
        }
        condition_.notify_all();
    }

    void SetDisplaySize(unsigned width, unsigned height) {
        std::unique_lock<std::mutex> lock(mutex_);
        if (!condition_.wait_for(lock, std::chrono::seconds(2), [&] {
                return stopping_ || (width_ > 0 && height_ > 0);
            }) || stopping_) {
            throw std::runtime_error("timed out waiting for LibVLC playback buffer format");
        }
        if (width == 0 || height == 0 || width > source_buffer_width_ ||
            height > source_buffer_height_) {
            throw std::runtime_error(
                "LibVLC visible video dimensions " + std::to_string(width) + "x" +
                std::to_string(height) + " exceed its source buffer " +
                std::to_string(source_buffer_width_) + "x" +
                std::to_string(source_buffer_height_));
        }
        source_display_width_ = width;
        source_display_height_ = height;
        display_width_ = frame_bridge::project_visible_extent(
            width, source_buffer_width_, width_);
        display_height_ = frame_bridge::project_visible_extent(
            height, source_buffer_height_, height_);
        condition_.notify_all();
    }

    std::uint64_t BeginSeek() {
        std::unique_lock<std::mutex> lock(mutex_);
        condition_.wait(lock, [&] { return stopping_ || !writing_frame_; });
        seeking_ = true;
        const auto generation = ++requested_seek_generation_;
        if (pending_) {
            pending_->in_use = false;
            pending_ = nullptr;
            ++dropped_frames_;
        }
        // A frame already sent before this seek is obsolete. Do not let its renderer
        // acknowledgement prevent the first post-seek frame from leaving the service.
        awaiting_ack_generation_ = 0;
        condition_.notify_all();
        return generation;
    }

    bool WaitForSeek(std::uint64_t generation, std::chrono::milliseconds timeout) {
        std::unique_lock<std::mutex> lock(mutex_);
        return condition_.wait_for(lock, timeout, [&] {
            return stopping_ || (!seeking_ && completed_seek_generation_ >= generation);
        }) && !stopping_;
    }

private:
    struct Buffer {
        std::vector<std::uint8_t> pixels;
        bool in_use = false;
        std::uint64_t sequence = 0;
        std::int64_t time_us = -1;
    };

    void OutputLoop() {
        while (true) {
            Buffer* frame = nullptr;
            unsigned width = 0;
            unsigned height = 0;
            unsigned stride = 0;
            unsigned source_width = 0;
            unsigned source_height = 0;
            std::uint64_t dropped = 0;
            {
                std::unique_lock<std::mutex> lock(mutex_);
                condition_.wait(lock, [&] {
                    return stopping_ || (pending_ != nullptr && awaiting_ack_generation_ == 0 &&
                                          display_width_ > 0 && display_height_ > 0);
                });
                if (stopping_) return;
                frame = pending_;
                pending_ = nullptr;
                awaiting_ack_generation_ = frame->sequence;
                writing_frame_ = true;
                width = display_width_;
                height = display_height_;
                stride = stride_;
                source_width = source_display_width_;
                source_height = source_display_height_;
                dropped = dropped_frames_;
            }
            try {
                writer_.Write({
                    {"type", "playback-frame"}, {"sourceGeneration", source_generation_},
                    {"frameGeneration", frame->sequence}, {"playbackTimestampUs", std::to_string(frame->time_us)},
                    {"width", width}, {"height", height}, {"stride", stride},
                    {"sourceWidth", source_width}, {"sourceHeight", source_height},
                    {"pixelFormat", "RGBA8888"},
                    {"payloadBytes", static_cast<std::size_t>(stride) * height},
                    {"droppedBeforeWrite", dropped},
                }, frame->pixels.data(), static_cast<std::size_t>(stride) * height);
            } catch (...) {
                std::lock_guard<std::mutex> lock(mutex_);
                stopping_ = true;
            }
            {
                std::lock_guard<std::mutex> lock(mutex_);
                frame->in_use = false;
                written_frame_generation_ = frame->sequence;
                writing_frame_ = false;
            }
            condition_.notify_all();
        }
    }

    ProtocolWriter& writer_;
    const std::uint64_t source_generation_;
    const unsigned maximum_width_;
    const unsigned maximum_height_;
    std::mutex mutex_;
    std::condition_variable condition_;
    std::vector<std::unique_ptr<Buffer>> buffers_;
    Buffer* pending_ = nullptr;
    unsigned width_ = 0;
    unsigned height_ = 0;
    unsigned source_buffer_width_ = 0;
    unsigned source_buffer_height_ = 0;
    unsigned stride_ = 0;
    unsigned display_width_ = 0;
    unsigned display_height_ = 0;
    unsigned source_display_width_ = 0;
    unsigned source_display_height_ = 0;
    std::uint64_t frame_generation_ = 0;
    std::uint64_t written_frame_generation_ = 0;
    std::uint64_t awaiting_ack_generation_ = 0;
    std::uint64_t dropped_frames_ = 0;
    std::int64_t latest_time_us_ = -1;
    std::uint64_t requested_seek_generation_ = 0;
    std::uint64_t completed_seek_generation_ = 0;
    bool seeking_ = false;
    bool output_suppressed_ = false;
    bool writing_frame_ = false;
    bool stopping_ = false;
    libvlc_state_t state_ = libvlc_NothingSpecial;
    std::thread worker_;
};

class LibVlcService {
public:
    explicit LibVlcService(const std::wstring& dll_path) : api_(dll_path) {
        const char* arguments[] = {"--no-spu", "--no-osd"};
        instance_ = api_.new_instance(2, arguments);
        if (!instance_) throw std::runtime_error("libvlc_new returned null");
    }

    ~LibVlcService() {
        ClosePlayer();
        if (instance_) api_.release_instance(instance_);
    }

    bool Handle(const frame_bridge::Message& request) {
        const auto request_id = Required<std::string>(request.metadata, "requestId");
        const auto command = Required<std::string>(request.metadata, "command");
        try {
            if (!request.payload.empty()) throw std::invalid_argument("commands cannot contain binary payloads");
            if (command == "open") Open(request_id, request.metadata);
            else if (command == "close") Close(request_id);
            else if (command == "prime") Prime(request_id);
            else if (command == "play") Play(request_id);
            else if (command == "play-at") PlayAt(request_id, request.metadata);
            else if (command == "pause") Pause(request_id);
            else if (command == "stop") Stop(request_id);
            else if (command == "rate") Rate(request_id, request.metadata);
            else if (command == "seek") Seek(request_id, request.metadata);
            else if (command == "frame-ack") FrameAck(request_id, request.metadata);
            else if (command == "status") Status(request_id, command);
            else if (command == "shutdown") {
                ClosePlayer();
                Status(request_id, command);
                return false;
            } else if (command == "exact" || command == "scrub" || command == "step" || command == "time") {
                Error(request_id, "unsupported-command", "LibVLC playback service does not own canonical exact frames");
            } else {
                Error(request_id, "invalid-request", "unknown media-service command");
            }
        } catch (const nlohmann::json::exception& error) {
            Error(request_id, "invalid-request", error.what());
        } catch (const std::invalid_argument& error) {
            Error(request_id, "invalid-request", error.what());
        } catch (const std::logic_error& error) {
            Error(request_id, "invalid-state", error.what());
        } catch (const std::exception& error) {
            Error(request_id, "backend-failure", error.what());
        }
        return true;
    }

private:
    template <typename Value>
    static Value Required(const nlohmann::json& value, const char* field) {
        if (!value.contains(field)) throw std::invalid_argument(std::string("missing field: ") + field);
        return value.at(field).get<Value>();
    }

    void Open(const std::string& request_id, const nlohmann::json& request) {
        ClosePlayer();
        source_generation_ = Required<std::uint64_t>(request, "sourceGeneration");
        const auto maximum_width = request.value("maxPreviewWidth", 8192U);
        const auto maximum_height = request.value("maxPreviewHeight", 8192U);
        if (maximum_width == 0 || maximum_width > 16384 ||
            maximum_height == 0 || maximum_height > 16384 ||
            static_cast<std::uint64_t>(maximum_width) * maximum_height * 4 >
                frame_bridge::maximum_payload_bytes) {
            throw std::invalid_argument("preview bounds must be between 1 and 16384 pixels");
        }
        frames_ = std::make_unique<PlaybackFrames>(
            writer_, source_generation_, maximum_width, maximum_height);
        player_callbacks_ = {};
        player_callbacks_.version = 0;
        player_callbacks_.on_state_changed = &PlaybackFrames::OnState;
        player_ = api_.new_player(instance_, &player_callbacks_, frames_.get());
        if (!player_) throw std::runtime_error("libvlc_media_player_new returned null");
        api_.set_video_callbacks(player_, &PlaybackFrames::Lock, &PlaybackFrames::Unlock,
                                 &PlaybackFrames::Display, frames_.get());
        api_.set_format_callbacks(player_, &PlaybackFrames::Format, &PlaybackFrames::Cleanup);
        time_callbacks_ = {};
        time_callbacks_.version = 0;
        time_callbacks_.on_update = &PlaybackFrames::OnTime;
        time_callbacks_.on_paused = &PlaybackFrames::OnPaused;
        time_callbacks_.on_seek = &PlaybackFrames::OnSeek;
        if (api_.watch_time(player_, 0, &time_callbacks_, frames_.get()) != 0) {
            throw std::runtime_error("libvlc_media_player_watch_time failed");
        }
        watching_time_ = true;
        const auto source_path = Required<std::string>(request, "sourcePath");
        auto* media = api_.new_media_path(source_path.c_str());
        if (!media) throw std::runtime_error("libvlc_media_new_path returned null");
        api_.set_media(player_, media);
        api_.release_media(media);
        desired_muted_ = request.value("muted", true);
        api_.set_mute(player_, desired_muted_);
        Status(request_id, "open");
    }

    void Close(const std::string& request_id) {
        ClosePlayer();
        ++source_generation_;
        Status(request_id, "close");
    }

    void Play(const std::string& request_id) {
        RequirePlayer();
        StartPlayback();
        Status(request_id, "play");
    }

    void PlayAt(const std::string& request_id, const nlohmann::json& request) {
        RequirePlayer();
        const auto value = Required<std::string>(request, "timeUs");
        std::size_t consumed = 0;
        const auto time_us = std::stoll(value, &consumed);
        if (consumed != value.size() || time_us < 0) throw std::invalid_argument("invalid playback seek time");

        frames_->SetOutputSuppressed(true);
        try {
            const auto state = api_.get_state(player_);
            if (state != libvlc_Playing && state != libvlc_Paused) {
                StartPlayback();
                PausePlayer();
            }
            const auto generation = frames_->BeginSeek();
            if (api_.set_time(player_, time_us, false) != 0) {
                throw std::runtime_error("libvlc_media_player_set_time failed");
            }
            if (!frames_->WaitForSeek(generation, std::chrono::seconds(5))) {
                throw std::runtime_error("timed out waiting for LibVLC seek completion");
            }
            StartPlayback();
        } catch (...) {
            frames_->SetOutputSuppressed(false);
            throw;
        }
        frames_->SetOutputSuppressed(false);
        Status(request_id, "play-at");
    }

    void Prime(const std::string& request_id) {
        RequirePlayer();
        const auto previous_frame = frames_->WrittenFrameGeneration();
        api_.set_mute(player_, true);
        try {
            StartPlayback();
            if (!frames_->WaitForWrittenFrameAfter(previous_frame, std::chrono::seconds(10))) {
                throw std::runtime_error("timed out waiting for LibVLC preview frame");
            }
            PausePlayer();
        } catch (...) {
            api_.set_mute(player_, desired_muted_);
            throw;
        }
        api_.set_mute(player_, desired_muted_);
        Status(request_id, "prime");
    }

    void StartPlayback() {
        const auto state = api_.get_state(player_);
        if (state == libvlc_Paused) {
            api_.set_pause(player_, false);
            if (!frames_->WaitForState(libvlc_Playing, std::chrono::seconds(10))) {
                throw std::runtime_error("timed out resuming LibVLC playback");
            }
        } else if (state != libvlc_Playing) {
            if (api_.play(player_) != 0) throw std::runtime_error("libvlc_media_player_play failed");
            if (!frames_->WaitForState(libvlc_Playing, std::chrono::seconds(10))) {
                throw std::runtime_error("timed out waiting for LibVLC playing state");
            }
        }
        unsigned display_width = 0;
        unsigned display_height = 0;
        const auto size_deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
        while (std::chrono::steady_clock::now() < size_deadline) {
            if (api_.get_video_size(player_, 0, &display_width, &display_height) == 0 &&
                display_width > 0 && display_height > 0) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
        frames_->SetDisplaySize(display_width, display_height);
        if (std::abs(api_.get_rate(player_) - desired_rate_) > 0.001f) {
            const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
            auto state = api_.get_state(player_);
            while (state != libvlc_Playing && state != libvlc_Paused &&
                   std::chrono::steady_clock::now() < deadline) {
                std::this_thread::sleep_for(std::chrono::milliseconds(5));
                state = api_.get_state(player_);
            }
            if ((state != libvlc_Playing && state != libvlc_Paused) ||
                api_.set_rate(player_, desired_rate_) != 0) {
                throw std::runtime_error("playback did not become ready for the selected rate");
            }
        }
    }

    void Pause(const std::string& request_id) {
        RequirePlayer();
        PausePlayer();
        Status(request_id, "pause");
    }

    void PausePlayer() {
        const auto state = api_.get_state(player_);
        if (state == libvlc_Playing) {
            api_.set_pause(player_, true);
            if (!frames_->WaitForState(libvlc_Paused, std::chrono::seconds(5))) {
                throw std::runtime_error("timed out waiting for LibVLC paused state");
            }
        }
    }

    void Stop(const std::string& request_id) {
        RequirePlayer();
        if (api_.get_state(player_) != libvlc_Stopped) {
            api_.stop_async(player_);
            if (!frames_->WaitForState(libvlc_Stopped, std::chrono::seconds(5))) {
                throw std::runtime_error("timed out waiting for LibVLC stopped state");
            }
        }
        Status(request_id, "stop");
    }

    void Rate(const std::string& request_id, const nlohmann::json& request) {
        RequirePlayer();
        const auto rate = Required<float>(request, "rate");
        if (rate < 0.25f || rate > 4.0f) {
            throw std::invalid_argument("playback rate is unsupported");
        }
        desired_rate_ = rate;
        const auto state = api_.get_state(player_);
        if ((state == libvlc_Playing || state == libvlc_Paused) && api_.set_rate(player_, rate) != 0) {
            throw std::invalid_argument("playback rate is unsupported");
        }
        Status(request_id, "rate");
    }

    void Seek(const std::string& request_id, const nlohmann::json& request) {
        RequirePlayer();
        const auto value = Required<std::string>(request, "timeUs");
        std::size_t consumed = 0;
        const auto time_us = std::stoll(value, &consumed);
        if (consumed != value.size() || time_us < 0) throw std::invalid_argument("invalid playback seek time");
        const auto state = api_.get_state(player_);
        if (state != libvlc_Playing && state != libvlc_Paused) {
            frames_->SetOutputSuppressed(true);
            try {
                StartPlayback();
                PausePlayer();
            } catch (...) {
                frames_->SetOutputSuppressed(false);
                throw;
            }
            frames_->SetOutputSuppressed(false);
        }
        const auto generation = frames_->BeginSeek();
        if (api_.set_time(player_, time_us, false) != 0) {
            throw std::runtime_error("libvlc_media_player_set_time failed");
        }
        if (!frames_->WaitForSeek(generation, std::chrono::seconds(5))) {
            throw std::runtime_error("timed out waiting for LibVLC seek completion");
        }
        Status(request_id, "seek");
    }

    void FrameAck(const std::string& request_id, const nlohmann::json& request) {
        RequirePlayer();
        const auto frame_generation = Required<std::uint64_t>(request, "frameGeneration");
        Status(request_id, "frame-ack");
        frames_->Acknowledge(frame_generation);
    }

    void Status(const std::string& request_id, const std::string& command) {
        const auto* state = command == "open" && player_
            ? "playback-ready"
            : player_ ? StateName(api_.get_state(player_)) : "closed";
        writer_.Write({
            {"type", "status"}, {"requestId", request_id}, {"command", command},
            {"state", state},
            {"sourceGeneration", source_generation_}, {"frameGeneration", 0},
            {"timeUs", player_ ? std::to_string(api_.get_time(player_)) : "0"},
            {"lengthUs", player_ ? std::to_string(api_.get_length(player_)) : "0"},
            {"rate", desired_rate_},
        });
    }

    void Error(const std::string& request_id, const std::string& category,
               const std::string& message) {
        writer_.Write({
            {"type", "error"}, {"requestId", request_id}, {"sourceGeneration", source_generation_},
            {"error", {{"category", category}, {"message", message}, {"recoverable", true}}},
        });
    }

    void RequirePlayer() const {
        if (!player_) throw std::logic_error("no playback source is open");
    }

    void ClosePlayer() {
        if (!player_) return;
        if (api_.get_state(player_) != libvlc_Stopped) {
            api_.stop_async(player_);
            frames_->WaitForState(libvlc_Stopped, std::chrono::seconds(5));
        }
        if (watching_time_) api_.unwatch_time(player_);
        watching_time_ = false;
        api_.release_player(player_);
        player_ = nullptr;
        frames_.reset();
        desired_rate_ = 1.0f;
        desired_muted_ = true;
    }

    static const char* StateName(libvlc_state_t state) {
        switch (state) {
            case libvlc_Opening: return "opening";
            case libvlc_Playing: return "playing";
            case libvlc_Paused: return "paused";
            case libvlc_Stopping: return "stopping";
            case libvlc_Stopped: return "stopped";
            case libvlc_Error: return "failed";
            default: return "playback-ready";
        }
    }

    ProtocolWriter writer_;
    LibVlcApi api_;
    libvlc_instance_t* instance_ = nullptr;
    libvlc_media_player_t* player_ = nullptr;
    std::unique_ptr<PlaybackFrames> frames_;
    std::uint64_t source_generation_ = 0;
    bool watching_time_ = false;
    bool desired_muted_ = true;
    float desired_rate_ = 1.0f;
    libvlc_media_player_cbs player_callbacks_{};
    libvlc_media_player_watch_time_cbs time_callbacks_{};
};

}  // namespace

int wmain(int argc, wchar_t** argv) {
    if (argc != 2) {
        std::cerr << "usage: libvlc_media_service <libvlc.dll>\n";
        return 2;
    }
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    try {
        LibVlcService service(argv[1]);
        frame_bridge::Message request;
        while (frame_bridge::read_message(std::cin, request)) {
            if (!service.Handle(request)) break;
        }
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "LibVLC media service terminated: " << error.what() << '\n';
        return 1;
    }
}
