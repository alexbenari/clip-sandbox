#include "json_string.hpp"
#include "utf8_text.hpp"

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>

extern "C" {
#include <libavcodec/codec_id.h>
#include <libavformat/avformat.h>
#include <libavutil/mem.h>
#include <libavutil/sha.h>
}

namespace {

using Clock = std::chrono::steady_clock;
constexpr std::uint8_t vop_start_code = 0xb6;
constexpr std::uint8_t user_data_start_code = 0xb2;

struct ShaDeleter {
    void operator()(AVSHA* value) const { av_free(value); }
};

using ShaPtr = std::unique_ptr<AVSHA, ShaDeleter>;

ShaPtr create_sha256() {
    ShaPtr sha(av_sha_alloc());
    if (!sha || av_sha_init(sha.get(), 256) < 0) throw std::runtime_error("could not create SHA-256 state");
    return sha;
}

void update_size(AVSHA* sha, std::uint64_t value) {
    std::uint8_t encoded[8]{};
    for (int index = 7; index >= 0; --index) {
        encoded[index] = static_cast<std::uint8_t>(value & 0xffu);
        value >>= 8u;
    }
    av_sha_update(sha, encoded, sizeof(encoded));
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

struct PacketShape {
    std::int64_t vop_count = 0;
    bool divx_packed_marker = false;
};

PacketShape inspect_packet(const std::uint8_t* data, int size) {
    PacketShape result;
    for (int index = 0; index + 4 <= size; ++index) {
        if (data[index] != 0 || data[index + 1] != 0 || data[index + 2] != 1) continue;
        const auto code = data[index + 3];
        if (code == vop_start_code) ++result.vop_count;
        if (code != user_data_start_code) continue;
        const int payload_start = index + 4;
        const int payload_end = std::min(size, payload_start + 255);
        for (int cursor = payload_start; cursor + 1 < payload_end; ++cursor) {
            if (data[cursor] == 'p' && data[cursor + 1] == '\0') {
                result.divx_packed_marker = true;
                break;
            }
        }
    }
    return result;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    if (argc < 2 || argc > 3 || (argc == 3 && std::wstring(argv[2]) != L"--progress")) {
        std::cerr << "usage: media_packet_scan <movie> [--progress]\n";
        return 2;
    }

    const auto started = Clock::now();
    const bool report_progress = argc == 3;
    AVFormatContext* format = nullptr;
    AVPacket* packet = nullptr;
    try {
        const auto movie = frame_review::Utf8Text(std::filesystem::path(argv[1]).wstring()).value();
        if (avformat_open_input(&format, movie.c_str(), nullptr, nullptr) < 0) {
            throw std::runtime_error("could not open source");
        }
        if (avformat_find_stream_info(format, nullptr) < 0) {
            throw std::runtime_error("could not read stream information");
        }
        const int stream_index = av_find_best_stream(format, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
        if (stream_index < 0) throw std::runtime_error("no video stream found");
        const auto* parameters = format->streams[stream_index]->codecpar;
        const auto source_size = format->pb ? avio_size(format->pb) : -1;
        auto payload_sha = create_sha256();
        auto stream_sha = create_sha256();
        update_size(stream_sha.get(), static_cast<std::uint64_t>(parameters->codec_id));
        update_size(stream_sha.get(), static_cast<std::uint64_t>(std::max(0, parameters->extradata_size)));
        if (parameters->extradata && parameters->extradata_size > 0) {
            av_sha_update(stream_sha.get(), parameters->extradata,
                          static_cast<unsigned int>(parameters->extradata_size));
        }

        std::int64_t packet_count = 0;
        std::int64_t packets_with_pts = 0;
        std::int64_t key_packet_count = 0;
        std::int64_t key_packets_with_pts = 0;
        std::int64_t packets_with_multiple_vops = 0;
        std::int64_t max_vops_per_packet = 0;
        std::int64_t selected_stream_bytes = 0;
        bool divx_packed_marker_seen = false;
        int last_progress_percent = -1;

        packet = av_packet_alloc();
        if (!packet) throw std::runtime_error("could not allocate packet");
        while (av_read_frame(format, packet) >= 0) {
            if (packet->stream_index == stream_index) {
                ++packet_count;
                selected_stream_bytes += packet->size;
                update_size(payload_sha.get(), static_cast<std::uint64_t>(packet->size));
                update_size(stream_sha.get(), static_cast<std::uint64_t>(packet->size));
                if (packet->size > 0) {
                    av_sha_update(payload_sha.get(), packet->data, static_cast<unsigned int>(packet->size));
                    av_sha_update(stream_sha.get(), packet->data, static_cast<unsigned int>(packet->size));
                }
                const bool has_pts = packet->pts != AV_NOPTS_VALUE;
                if (has_pts) ++packets_with_pts;
                if ((packet->flags & AV_PKT_FLAG_KEY) != 0) {
                    ++key_packet_count;
                    if (has_pts) ++key_packets_with_pts;
                }
                if (parameters->codec_id == AV_CODEC_ID_MPEG4) {
                    const auto shape = inspect_packet(packet->data, packet->size);
                    max_vops_per_packet = std::max(max_vops_per_packet, shape.vop_count);
                    if (shape.vop_count > 1) ++packets_with_multiple_vops;
                    divx_packed_marker_seen = divx_packed_marker_seen || shape.divx_packed_marker;
                }
            }
            av_packet_unref(packet);
            if (report_progress && source_size > 0 && format->pb) {
                const auto current = std::clamp<std::int64_t>(avio_tell(format->pb), 0, source_size);
                const int percent = static_cast<int>(current * 100 / source_size);
                if (percent == 100 || percent >= last_progress_percent + 5) {
                    last_progress_percent = percent;
                    std::cout << "{\"type\":\"packet-scan-progress\",\"currentBytes\":" << current
                              << ",\"totalBytes\":" << source_size << ",\"percent\":" << percent
                              << "}\n" << std::flush;
                }
            }
        }

        const double elapsed_ms = std::chrono::duration<double, std::milli>(Clock::now() - started).count();
        const bool packed_confirmed = packets_with_multiple_vops > 0;
        const char* packed_status = packed_confirmed
            ? "confirmed"
            : divx_packed_marker_seen ? "marker-only" : "none";
        std::cout << "{\"type\":\"packet-scan\",\"codec\":"
                  << frame_review::JsonString(avcodec_get_name(parameters->codec_id)).serialized()
                  << ",\"streamIndex\":" << stream_index
                  << ",\"sourceBytes\":" << source_size
                  << ",\"selectedStreamBytes\":" << selected_stream_bytes
                  << ",\"packetPayloadDigest\":\"" << finish_sha256(payload_sha.get()) << "\""
                  << ",\"streamDigest\":\"" << finish_sha256(stream_sha.get()) << "\""
                  << ",\"packetCount\":" << packet_count
                  << ",\"packetsWithPts\":" << packets_with_pts
                  << ",\"packetsWithoutPts\":" << packet_count - packets_with_pts
                  << ",\"keyPacketCount\":" << key_packet_count
                  << ",\"keyPacketsWithPts\":" << key_packets_with_pts
                  << ",\"keyPacketsWithoutPts\":" << key_packet_count - key_packets_with_pts
                  << ",\"packetsWithMultipleVops\":" << packets_with_multiple_vops
                  << ",\"maxVopsPerPacket\":" << max_vops_per_packet
                  << ",\"divxPackedMarkerSeen\":" << (divx_packed_marker_seen ? "true" : "false")
                  << ",\"packedBFramesDetected\":" << (packed_confirmed ? "true" : "false")
                  << ",\"packedBFrameStatus\":\"" << packed_status << "\""
                  << ",\"elapsedMs\":" << std::fixed << std::setprecision(3) << elapsed_ms << "}\n";

        av_packet_free(&packet);
        avformat_close_input(&format);
        return 0;
    } catch (const std::exception& error) {
        av_packet_free(&packet);
        avformat_close_input(&format);
        std::cout << "{\"type\":\"error\",\"message\":"
                  << frame_review::JsonString(error.what()).serialized() << "}\n";
        return 1;
    }
}
