#include <algorithm>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

extern "C" {
#include <libavcodec/codec_id.h>
#include <libavformat/avformat.h>
#include <libavutil/mem.h>
#include <libavutil/sha.h>
}

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

namespace {

using Clock = std::chrono::steady_clock;
struct Profile {
    const char* version;
    std::int64_t head_us;
    std::int64_t tail_us;
    std::int64_t random_segment_us;
    int random_segment_count;
};

constexpr Profile balanced_profile{
    "sampled-packets-5m-5m-5x1m-v1", 5LL * 60 * AV_TIME_BASE,
    5LL * 60 * AV_TIME_BASE, 60LL * AV_TIME_BASE, 5,
};
constexpr Profile compact_profile{
    "sampled-packets-3m-3m-3x1m-v1", 3LL * 60 * AV_TIME_BASE,
    3LL * 60 * AV_TIME_BASE, 60LL * AV_TIME_BASE, 3,
};

struct ShaDeleter {
    void operator()(AVSHA* value) const { av_free(value); }
};

using ShaPtr = std::unique_ptr<AVSHA, ShaDeleter>;

struct Range {
    std::int64_t start_us;
    std::int64_t end_us;
};

ShaPtr create_sha256() {
    ShaPtr sha(av_sha_alloc());
    if (!sha || av_sha_init(sha.get(), 256) < 0) throw std::runtime_error("could not create SHA-256 state");
    return sha;
}

void update_u64(AVSHA* sha, std::uint64_t value) {
    std::uint8_t encoded[8]{};
    for (int index = 7; index >= 0; --index) {
        encoded[index] = static_cast<std::uint8_t>(value & 0xffu);
        value >>= 8u;
    }
    av_sha_update(sha, encoded, sizeof(encoded));
}

void update_i64(AVSHA* sha, std::int64_t value) {
    update_u64(sha, static_cast<std::uint64_t>(value));
}

void update_text(AVSHA* sha, const std::string& value) {
    update_u64(sha, value.size());
    if (!value.empty()) av_sha_update(sha, reinterpret_cast<const std::uint8_t*>(value.data()),
                                     static_cast<unsigned int>(value.size()));
}

std::string finish_sha256(AVSHA* sha) {
    std::uint8_t digest[32]{};
    av_sha_final(sha, digest);
    std::ostringstream output;
    for (const auto byte : digest) {
        output << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
    }
    return output.str();
}

std::string utf8(const std::wstring& value) {
    if (value.empty()) return {};
    const int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
                                         nullptr, 0, nullptr, nullptr);
    if (size <= 0) throw std::runtime_error("WideCharToMultiByte failed");
    std::string result(static_cast<std::size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
                        result.data(), size, nullptr, nullptr);
    return result;
}

std::string escape_json(const std::string& value) {
    std::string output;
    output.reserve(value.size());
    for (const unsigned char character : value) {
        switch (character) {
            case '\\': output += "\\\\"; break;
            case '"': output += "\\\""; break;
            case '\n': output += "\\n"; break;
            case '\r': output += "\\r"; break;
            case '\t': output += "\\t"; break;
            default: output += static_cast<char>(character); break;
        }
    }
    return output;
}

std::uint64_t splitmix64(std::uint64_t& state) {
    state += 0x9e3779b97f4a7c15ULL;
    auto value = state;
    value = (value ^ (value >> 30U)) * 0xbf58476d1ce4e5b9ULL;
    value = (value ^ (value >> 27U)) * 0x94d049bb133111ebULL;
    return value ^ (value >> 31U);
}

std::vector<Range> build_ranges(std::int64_t duration_us, std::int64_t source_size,
                                AVCodecID codec, int stream_index, const Profile& profile) {
    if (duration_us <= 0) throw std::runtime_error("source duration is unavailable for sampled validation");
    std::vector<Range> ranges;
    ranges.push_back({0, std::min(duration_us, profile.head_us)});
    ranges.push_back({std::max<std::int64_t>(0, duration_us - profile.tail_us), duration_us});

    const auto segment = std::min(duration_us, profile.random_segment_us);
    const auto first = std::min(duration_us - segment, profile.head_us);
    const auto last = std::max(first, duration_us - profile.tail_us - segment);
    auto seed = static_cast<std::uint64_t>(source_size) ^
                (static_cast<std::uint64_t>(duration_us) << 1U) ^
                (static_cast<std::uint64_t>(codec) << 33U) ^
                static_cast<std::uint64_t>(stream_index);
    for (int index = 0; index < profile.random_segment_count; ++index) {
        const auto span = static_cast<std::uint64_t>(last - first);
        const auto start = first + static_cast<std::int64_t>(span == 0 ? 0 : splitmix64(seed) % (span + 1));
        ranges.push_back({start, start + segment});
    }

    std::sort(ranges.begin(), ranges.end(), [](const Range& left, const Range& right) {
        return left.start_us < right.start_us;
    });
    std::vector<Range> merged;
    for (const auto range : ranges) {
        if (range.end_us <= range.start_us) continue;
        if (!merged.empty() && range.start_us <= merged.back().end_us) {
            merged.back().end_us = std::max(merged.back().end_us, range.end_us);
        } else {
            merged.push_back(range);
        }
    }
    return merged;
}

std::int64_t source_duration_us(const AVFormatContext* format, const AVStream* stream) {
    if (stream->duration != AV_NOPTS_VALUE && stream->duration > 0) {
        return av_rescale_q(stream->duration, stream->time_base, AV_TIME_BASE_Q);
    }
    return format->duration != AV_NOPTS_VALUE ? format->duration : 0;
}

std::int64_t stream_start_us(const AVFormatContext* format, const AVStream* stream) {
    if (stream->start_time != AV_NOPTS_VALUE) {
        return av_rescale_q(stream->start_time, stream->time_base, AV_TIME_BASE_Q);
    }
    return format->start_time != AV_NOPTS_VALUE ? format->start_time : 0;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    if (argc < 2 || argc > 3 || (argc == 3 && std::wstring(argv[2]) != L"--compact")) {
        std::cerr << "usage: media_sample_signature <movie> [--compact]\n";
        return 2;
    }

    const auto started = Clock::now();
    AVFormatContext* format = nullptr;
    AVPacket* packet = nullptr;
    try {
        const auto movie = utf8(std::filesystem::path(argv[1]).wstring());
        if (avformat_open_input(&format, movie.c_str(), nullptr, nullptr) < 0) {
            throw std::runtime_error("could not open source");
        }
        if (avformat_find_stream_info(format, nullptr) < 0) {
            throw std::runtime_error("could not read stream information");
        }
        const int stream_index = av_find_best_stream(format, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
        if (stream_index < 0) throw std::runtime_error("no video stream found");
        const auto* stream = format->streams[stream_index];
        const auto* parameters = stream->codecpar;
        const auto source_size = format->pb ? avio_size(format->pb) : -1;
        if (source_size < 0) throw std::runtime_error("source size is unavailable for sampled validation");
        const auto duration_us = source_duration_us(format, stream);
        const auto timeline_start_us = stream_start_us(format, stream);
        const auto& profile = argc == 3 ? compact_profile : balanced_profile;
        const auto ranges = build_ranges(duration_us, source_size, parameters->codec_id,
                                         stream_index, profile);

        auto metadata_sha = create_sha256();
        update_u64(metadata_sha.get(), static_cast<std::uint64_t>(parameters->codec_id));
        update_u64(metadata_sha.get(), static_cast<std::uint64_t>(parameters->codec_tag));
        update_u64(metadata_sha.get(), static_cast<std::uint64_t>(std::max(0, parameters->width)));
        update_u64(metadata_sha.get(), static_cast<std::uint64_t>(std::max(0, parameters->height)));
        update_u64(metadata_sha.get(), static_cast<std::uint64_t>(std::max(0, parameters->extradata_size)));
        if (parameters->extradata && parameters->extradata_size > 0) {
            av_sha_update(metadata_sha.get(), parameters->extradata,
                          static_cast<unsigned int>(parameters->extradata_size));
        }
        const auto metadata_digest = finish_sha256(metadata_sha.get());

        auto sample_sha = create_sha256();
        update_text(sample_sha.get(), profile.version);
        update_i64(sample_sha.get(), source_size);
        update_i64(sample_sha.get(), duration_us);
        update_i64(sample_sha.get(), stream_index);
        update_text(sample_sha.get(), metadata_digest);

        packet = av_packet_alloc();
        if (!packet) throw std::runtime_error("could not allocate packet");
        std::int64_t sampled_packets = 0;
        std::int64_t sampled_bytes = 0;
        std::int64_t sampled_duration_us = 0;
        std::int64_t packets_without_timestamps = 0;

        for (std::size_t range_index = 0; range_index < ranges.size(); ++range_index) {
            const auto range = ranges[range_index];
            update_i64(sample_sha.get(), range.start_us);
            update_i64(sample_sha.get(), range.end_us);
            sampled_duration_us += range.end_us - range.start_us;

            const auto target = av_rescale_q(timeline_start_us + range.start_us,
                                             AV_TIME_BASE_Q, stream->time_base);
            if (avformat_seek_file(format, stream_index, std::numeric_limits<std::int64_t>::min(),
                                   target, target, AVSEEK_FLAG_BACKWARD) < 0) {
                throw std::runtime_error("could not seek to a sampled validation range");
            }
            avformat_flush(format);
            std::int64_t range_packets = 0;
            while (av_read_frame(format, packet) >= 0) {
                if (packet->stream_index != stream_index) {
                    av_packet_unref(packet);
                    continue;
                }
                const auto timestamp = packet->pts != AV_NOPTS_VALUE ? packet->pts : packet->dts;
                if (timestamp == AV_NOPTS_VALUE) {
                    ++packets_without_timestamps;
                    av_packet_unref(packet);
                    continue;
                }
                const auto packet_us = av_rescale_q(timestamp, stream->time_base, AV_TIME_BASE_Q) -
                                       timeline_start_us;
                if (packet_us < range.start_us) {
                    av_packet_unref(packet);
                    continue;
                }
                if (packet_us >= range.end_us) {
                    av_packet_unref(packet);
                    break;
                }
                ++range_packets;
                ++sampled_packets;
                sampled_bytes += packet->size;
                update_i64(sample_sha.get(), packet->pts);
                update_i64(sample_sha.get(), packet->dts);
                update_i64(sample_sha.get(), packet->duration);
                update_i64(sample_sha.get(), packet->flags);
                update_i64(sample_sha.get(), packet->size);
                if (packet->size > 0) {
                    av_sha_update(sample_sha.get(), packet->data,
                                  static_cast<unsigned int>(packet->size));
                }
                av_packet_unref(packet);
            }
            if (range_packets == 0) {
                throw std::runtime_error("sampled validation range contained no timestamped video packets");
            }
        }

        const auto elapsed_ms = std::chrono::duration<double, std::milli>(Clock::now() - started).count();
        std::cout << "{\"type\":\"sampled-packet-signature\",\"profileVersion\":\""
                  << profile.version << "\",\"codec\":\""
                  << escape_json(avcodec_get_name(parameters->codec_id))
                  << "\",\"streamIndex\":" << stream_index
                  << ",\"sourceBytes\":" << source_size
                  << ",\"durationUs\":" << duration_us
                  << ",\"streamMetadataDigest\":\"" << metadata_digest << "\""
                  << ",\"sampleDigest\":\"" << finish_sha256(sample_sha.get()) << "\""
                  << ",\"sampledPacketCount\":" << sampled_packets
                  << ",\"sampledBytes\":" << sampled_bytes
                  << ",\"sampledDurationUs\":" << sampled_duration_us
                  << ",\"packetsWithoutTimestamps\":" << packets_without_timestamps
                  << ",\"ranges\":[";
        for (std::size_t index = 0; index < ranges.size(); ++index) {
            if (index > 0) std::cout << ',';
            std::cout << "{\"startUs\":" << ranges[index].start_us
                      << ",\"endUs\":" << ranges[index].end_us << '}';
        }
        std::cout << "],\"elapsedMs\":" << std::fixed << std::setprecision(3) << elapsed_ms << "}\n";

        av_packet_free(&packet);
        avformat_close_input(&format);
        return 0;
    } catch (const std::exception& error) {
        av_packet_free(&packet);
        avformat_close_input(&format);
        std::cout << "{\"type\":\"error\",\"message\":\"" << escape_json(error.what()) << "\"}\n";
        return 1;
    }
}
