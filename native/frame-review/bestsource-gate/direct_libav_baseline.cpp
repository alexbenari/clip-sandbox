#include "json_string.hpp"
#include "utf8_text.hpp"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
}

#include <chrono>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

namespace {

using Clock = std::chrono::steady_clock;

struct FormatDeleter {
    void operator()(AVFormatContext* value) const { avformat_close_input(&value); }
};
struct CodecDeleter {
    void operator()(AVCodecContext* value) const { avcodec_free_context(&value); }
};
struct PacketDeleter {
    void operator()(AVPacket* value) const { av_packet_free(&value); }
};
struct FrameDeleter {
    void operator()(AVFrame* value) const { av_frame_free(&value); }
};

struct Decoder {
    std::unique_ptr<AVFormatContext, FormatDeleter> format;
    std::unique_ptr<AVCodecContext, CodecDeleter> codec;
    int stream = -1;
};

Decoder open_decoder(const std::filesystem::path& path) {
    AVFormatContext* raw_format = nullptr;
    const auto path_utf8 = frame_review::Utf8Text(path.native()).value();
    if (avformat_open_input(&raw_format, path_utf8.c_str(), nullptr, nullptr) < 0) {
        throw std::runtime_error("avformat_open_input failed");
    }
    Decoder result;
    result.format.reset(raw_format);
    if (avformat_find_stream_info(result.format.get(), nullptr) < 0) {
        throw std::runtime_error("avformat_find_stream_info failed");
    }
    result.stream = av_find_best_stream(result.format.get(), AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
    if (result.stream < 0) throw std::runtime_error("no decodable video stream");
    const auto* codec = avcodec_find_decoder(result.format->streams[result.stream]->codecpar->codec_id);
    if (!codec) throw std::runtime_error("video decoder not found");
    result.codec.reset(avcodec_alloc_context3(codec));
    if (!result.codec || avcodec_parameters_to_context(
            result.codec.get(), result.format->streams[result.stream]->codecpar) < 0 ||
        avcodec_open2(result.codec.get(), codec, nullptr) < 0) {
        throw std::runtime_error("video decoder initialization failed");
    }
    return result;
}

std::int64_t decode_until_eof(Decoder& decoder) {
    std::unique_ptr<AVPacket, PacketDeleter> packet(av_packet_alloc());
    std::unique_ptr<AVFrame, FrameDeleter> frame(av_frame_alloc());
    std::int64_t frames = 0;
    while (av_read_frame(decoder.format.get(), packet.get()) >= 0) {
        if (packet->stream_index == decoder.stream && avcodec_send_packet(decoder.codec.get(), packet.get()) >= 0) {
            while (avcodec_receive_frame(decoder.codec.get(), frame.get()) >= 0) {
                ++frames;
                av_frame_unref(frame.get());
            }
        }
        av_packet_unref(packet.get());
    }
    avcodec_send_packet(decoder.codec.get(), nullptr);
    while (avcodec_receive_frame(decoder.codec.get(), frame.get()) >= 0) {
        ++frames;
        av_frame_unref(frame.get());
    }
    return frames;
}

std::int64_t decode_until_pts(Decoder& decoder, std::int64_t target) {
    std::unique_ptr<AVPacket, PacketDeleter> packet(av_packet_alloc());
    std::unique_ptr<AVFrame, FrameDeleter> frame(av_frame_alloc());
    std::int64_t frames = 0;
    while (av_read_frame(decoder.format.get(), packet.get()) >= 0) {
        if (packet->stream_index == decoder.stream && avcodec_send_packet(decoder.codec.get(), packet.get()) >= 0) {
            while (avcodec_receive_frame(decoder.codec.get(), frame.get()) >= 0) {
                ++frames;
                const auto pts = frame->best_effort_timestamp;
                av_frame_unref(frame.get());
                if (pts != AV_NOPTS_VALUE && pts >= target) return frames;
            }
        }
        av_packet_unref(packet.get());
    }
    throw std::runtime_error("decode reached EOF before the seek target");
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    if (argc != 2) {
        std::cerr << "usage: direct_libav_baseline <movie>\n";
        return 2;
    }
    try {
        const std::filesystem::path movie(argv[1]);
        auto sequential = open_decoder(movie);
        auto started = Clock::now();
        const auto frames = decode_until_eof(sequential);
        const auto sequential_ms = std::chrono::duration<double, std::milli>(Clock::now() - started).count();

        auto seeking = open_decoder(movie);
        const auto* stream = seeking.format->streams[seeking.stream];
        const std::int64_t target = stream->duration > 0 && stream->duration != AV_NOPTS_VALUE
            ? stream->duration / 2
            : av_rescale_q(seeking.format->duration / 2, AVRational{1, AV_TIME_BASE}, stream->time_base);
        started = Clock::now();
        if (av_seek_frame(seeking.format.get(), seeking.stream, target, AVSEEK_FLAG_BACKWARD) < 0) {
            throw std::runtime_error("av_seek_frame failed");
        }
        avcodec_flush_buffers(seeking.codec.get());
        const auto decoded_after_seek = decode_until_pts(seeking, target);
        const auto seek_ms = std::chrono::duration<double, std::milli>(Clock::now() - started).count();

        std::cout << "{\"type\":\"direct-libav-baseline\",\"sequentialFrames\":" << frames
                  << ",\"sequentialMs\":" << std::fixed << std::setprecision(3) << sequential_ms
                  << ",\"seekTargetPts\":\"" << target
                  << "\",\"decodedFramesAfterSeek\":" << decoded_after_seek
                  << ",\"seekAndDecodeForwardMs\":" << seek_ms << "}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cout << "{\"type\":\"error\",\"message\":"
                  << frame_review::JsonString(error.what()).serialized() << "}\n";
        return 1;
    }
}
