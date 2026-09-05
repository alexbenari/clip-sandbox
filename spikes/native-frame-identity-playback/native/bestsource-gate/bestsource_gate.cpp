#include "frame_code.hpp"
#include "operation_runner.hpp"
#include "prepared_video_session.hpp"

#include <bestsource/bsshared.h>
#include <bestsource/videosource.h>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/frame.h>
#include <libavutil/imgutils.h>
#include <libavutil/mem.h>
#include <libavutil/pixfmt.h>
#include <libswscale/swscale.h>
}

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <psapi.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <cstdint>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <tuple>
#include <unordered_map>
#include <vector>

namespace {

using Clock = std::chrono::steady_clock;
constexpr std::int64_t seek_preroll_frames = 20;

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
    std::ostringstream output;
    for (const unsigned char character : value) {
        switch (character) {
            case '\\': output << "\\\\"; break;
            case '"': output << "\\\""; break;
            case '\n': output << "\\n"; break;
            case '\r': output << "\\r"; break;
            case '\t': output << "\\t"; break;
            default:
                if (character < 0x20) {
                    output << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                           << static_cast<int>(character) << std::dec;
                } else {
                    output << character;
                }
        }
    }
    return output.str();
}

double elapsed_ms(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

double duration_ms(Clock::time_point start, Clock::time_point end) {
    return std::chrono::duration<double, std::milli>(end - start).count();
}

std::uint64_t peak_working_set_bytes() {
    PROCESS_MEMORY_COUNTERS counters{};
    counters.cb = sizeof(counters);
    if (!GetProcessMemoryInfo(GetCurrentProcess(), &counters, sizeof(counters))) return 0;
    return static_cast<std::uint64_t>(counters.PeakWorkingSetSize);
}

std::vector<std::int64_t> parse_frames(const std::wstring& value) {
    std::vector<std::int64_t> frames;
    std::wstringstream input(value);
    std::wstring token;
    while (std::getline(input, token, L',')) {
        if (!token.empty()) frames.push_back(std::stoll(token));
    }
    return frames;
}

struct SwsDeleter {
    void operator()(SwsContext* context) const { sws_freeContext(context); }
};

struct AvBufferDeleter {
    void operator()(std::uint8_t* buffer) const { av_free(buffer); }
};

std::string bestsource_hash(const std::array<std::uint8_t, HashSize>& hash) {
    std::ostringstream output;
    for (const auto byte : hash) output << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
    return output.str();
}

struct DuplicateSequenceStats {
    std::uint64_t occurrences = 0;
    std::int64_t first_start = -1;
    std::int64_t second_start = -1;
};

struct DuplicateSequenceExample {
    std::uint64_t occurrences;
    std::int64_t first_start;
    std::int64_t second_start;
};

void record_sequence(std::unordered_map<std::string, DuplicateSequenceStats>& counts,
                     std::string key, std::int64_t start) {
    auto& stats = counts[std::move(key)];
    if (stats.occurrences == 0) {
        stats.first_start = start;
    } else if (stats.occurrences == 1) {
        stats.second_start = start;
    }
    ++stats.occurrences;
}

void emit_hash_diagnostics(BestVideoSource& source, std::int64_t num_frames) {
    constexpr std::int64_t matching_window = 10;
    if (num_frames < 0) throw std::runtime_error("hash diagnostics require a complete frame count");
    std::unordered_map<std::string, DuplicateSequenceStats> frame_counts;
    std::unordered_map<std::string, DuplicateSequenceStats> window_counts;
    frame_counts.reserve(static_cast<std::size_t>(num_frames));
    if (num_frames >= matching_window) {
        window_counts.reserve(static_cast<std::size_t>(num_frames - matching_window + 1));
    }

    std::vector<std::array<std::uint8_t, HashSize>> hashes;
    hashes.reserve(static_cast<std::size_t>(num_frames));
    std::int64_t longest_identical_run = 0;
    std::int64_t current_identical_run = 0;
    std::int64_t keyframe_count = 0;
    std::int64_t previous_keyframe = -1;
    std::vector<std::int64_t> keyframe_gaps;
    std::int64_t pts_usable_keyframe_count = 0;
    std::int64_t previous_pts_usable_keyframe = -1;
    std::vector<std::int64_t> pts_usable_keyframe_gaps;
    for (std::int64_t frame = 0; frame < num_frames; ++frame) {
        const auto& info = source.GetFrameInfo(frame);
        const auto hash = info.Hash;
        if (info.KeyFrame) {
            ++keyframe_count;
            if (previous_keyframe >= 0) keyframe_gaps.push_back(frame - previous_keyframe);
            previous_keyframe = frame;
            if (info.PTS != AV_NOPTS_VALUE) {
                ++pts_usable_keyframe_count;
                if (previous_pts_usable_keyframe >= 0) {
                    pts_usable_keyframe_gaps.push_back(frame - previous_pts_usable_keyframe);
                }
                previous_pts_usable_keyframe = frame;
            }
        }
        if (!hashes.empty() && hashes.back() == hash) {
            ++current_identical_run;
        } else {
            current_identical_run = 1;
        }
        longest_identical_run = std::max(longest_identical_run, current_identical_run);
        hashes.push_back(hash);
        record_sequence(frame_counts,
                        std::string(reinterpret_cast<const char*>(hash.data()), hash.size()), frame);
    }

    for (std::int64_t start = 0; start + matching_window <= num_frames; ++start) {
        std::string key;
        key.reserve(static_cast<std::size_t>(matching_window) * HashSize);
        for (std::int64_t offset = 0; offset < matching_window; ++offset) {
            const auto& hash = hashes[static_cast<std::size_t>(start + offset)];
            key.append(reinterpret_cast<const char*>(hash.data()), hash.size());
        }
        record_sequence(window_counts, std::move(key), start);
    }

    auto summarize = [](const auto& counts) {
        std::uint64_t duplicate_values = 0;
        std::uint64_t positions_in_duplicates = 0;
        std::uint64_t max_occurrences = 0;
        std::vector<DuplicateSequenceExample> examples;
        for (const auto& [key, stats] : counts) {
            (void)key;
            max_occurrences = std::max(max_occurrences, stats.occurrences);
            if (stats.occurrences > 1) {
                ++duplicate_values;
                positions_in_duplicates += stats.occurrences;
                examples.push_back({stats.occurrences, stats.first_start, stats.second_start});
            }
        }
        std::sort(examples.begin(), examples.end(), [](const auto& left, const auto& right) {
            if (left.occurrences != right.occurrences) return left.occurrences > right.occurrences;
            return left.first_start < right.first_start;
        });
        if (examples.size() > 5) examples.resize(5);
        return std::make_tuple(duplicate_values, positions_in_duplicates, max_occurrences, examples);
    };

    const auto [duplicate_hashes, frames_in_duplicate_hashes, max_hash_occurrences, hash_examples] =
        summarize(frame_counts);
    const auto [duplicate_windows, windows_in_duplicate_sequences, max_window_occurrences, window_examples] =
        summarize(window_counts);
    std::sort(keyframe_gaps.begin(), keyframe_gaps.end());
    std::sort(pts_usable_keyframe_gaps.begin(), pts_usable_keyframe_gaps.end());
    const auto gap_percentile = [](const std::vector<std::int64_t>& gaps, double quantile) {
        if (gaps.empty()) return std::int64_t{0};
        const auto rank = static_cast<std::size_t>(
            std::ceil(static_cast<double>(gaps.size()) * quantile));
        return gaps[std::min(gaps.size() - 1, std::max<std::size_t>(1, rank) - 1)];
    };

    auto emit_examples = [](const std::vector<DuplicateSequenceExample>& examples) {
        std::cout << '[';
        for (std::size_t index = 0; index < examples.size(); ++index) {
            if (index > 0) std::cout << ',';
            const auto& example = examples[index];
            std::cout << "{\"occurrences\":" << example.occurrences
                      << ",\"firstStart\":" << example.first_start
                      << ",\"secondStart\":" << example.second_start << '}';
        }
        std::cout << ']';
    };

    std::cout << "{\"type\":\"hash-diagnostics\",\"frameCount\":" << num_frames
              << ",\"matchingWindowFrames\":" << matching_window
              << ",\"duplicateHashValues\":" << duplicate_hashes
              << ",\"framesInDuplicateHashes\":" << frames_in_duplicate_hashes
              << ",\"maxHashOccurrences\":" << max_hash_occurrences
              << ",\"longestIdenticalFrameRun\":" << longest_identical_run
              << ",\"duplicateWindowValues\":" << duplicate_windows
              << ",\"windowsInDuplicateSequences\":" << windows_in_duplicate_sequences
              << ",\"maxWindowOccurrences\":" << max_window_occurrences
              << ",\"keyframeCount\":" << keyframe_count
              << ",\"p50KeyframeGapFrames\":" << gap_percentile(keyframe_gaps, 0.5)
              << ",\"p95KeyframeGapFrames\":" << gap_percentile(keyframe_gaps, 0.95)
              << ",\"maxKeyframeGapFrames\":" << gap_percentile(keyframe_gaps, 1.0)
              << ",\"trailingFramesAfterLastKeyframe\":"
              << (previous_keyframe >= 0 ? num_frames - 1 - previous_keyframe : num_frames)
              << ",\"ptsUsableKeyframeCount\":" << pts_usable_keyframe_count
              << ",\"p50PtsUsableKeyframeGapFrames\":"
              << gap_percentile(pts_usable_keyframe_gaps, 0.5)
              << ",\"p95PtsUsableKeyframeGapFrames\":"
              << gap_percentile(pts_usable_keyframe_gaps, 0.95)
              << ",\"maxPtsUsableKeyframeGapFrames\":"
              << gap_percentile(pts_usable_keyframe_gaps, 1.0)
              << ",\"trailingFramesAfterLastPtsUsableKeyframe\":"
              << (previous_pts_usable_keyframe >= 0
                  ? num_frames - 1 - previous_pts_usable_keyframe : num_frames)
              << ",\"duplicateHashExamples\":";
    emit_examples(hash_examples);
    std::cout << ",\"duplicateWindowExamples\":";
    emit_examples(window_examples);
    std::cout << "}\n";
}

struct FrameSeekContext {
    std::int64_t previous_keyframe = -1;
    std::int64_t frames_since_previous_keyframe = -1;
    std::int64_t previous_seek_keyframe = -1;
    std::int64_t frames_since_previous_seek_keyframe = -1;
};

FrameSeekContext frame_seek_context(BestVideoSource& source, std::int64_t requested) {
    FrameSeekContext context;
    for (std::int64_t frame = requested; frame >= 0; --frame) {
        const auto& info = source.GetFrameInfo(frame);
        if (info.KeyFrame && context.previous_keyframe < 0) {
            context.previous_keyframe = frame;
            context.frames_since_previous_keyframe = requested - frame;
        }
        if (frame >= 100 && frame <= requested - seek_preroll_frames &&
            info.KeyFrame && info.PTS != AV_NOPTS_VALUE) {
            context.previous_seek_keyframe = frame;
            context.frames_since_previous_seek_keyframe = requested - frame;
            break;
        }
    }
    return context;
}

void emit_frame_result(BestVideoSource& source, std::int64_t requested,
                       const BestVideoFrame& frame, const std::string& operation,
                       std::size_t operation_index, Clock::time_point started,
                       Clock::time_point frame_ready, const std::string& access_path,
                       bool delivered_cache_hit, std::size_t delivered_cache_frames,
                       std::size_t delivered_cache_bytes) {
    const auto seek_context = frame_seek_context(source, requested);
    const AVFrame* av_frame = frame.GetAVFrame();
    if (!av_frame || av_frame->width <= 0 || av_frame->height <= 0) {
        throw std::runtime_error("BestSource returned an invalid AVFrame");
    }

    std::unique_ptr<SwsContext, SwsDeleter> scaler(sws_getContext(
        av_frame->width, av_frame->height, static_cast<AVPixelFormat>(av_frame->format),
        av_frame->width, av_frame->height, AV_PIX_FMT_RGBA,
        SWS_BILINEAR, nullptr, nullptr, nullptr));
    if (!scaler) throw std::runtime_error("sws_getContext failed");

    std::uint8_t* destinations[4]{};
    int destination_strides[4]{};
    const int buffer_size = av_image_alloc(destinations, destination_strides,
                                            av_frame->width, av_frame->height,
                                            AV_PIX_FMT_RGBA, 64);
    if (buffer_size < 0) throw std::runtime_error("av_image_alloc failed");
    std::unique_ptr<std::uint8_t, AvBufferDeleter> rgba(destinations[0]);
    const int rows = sws_scale(scaler.get(), av_frame->data, av_frame->linesize, 0,
                               av_frame->height, destinations, destination_strides);
    const auto conversion_ready = Clock::now();
    if (rows != av_frame->height) throw std::runtime_error("sws_scale returned an incomplete frame");

    const auto code = frame_identity::decode_frame_code_rgba(
        rgba.get(), static_cast<std::size_t>(buffer_size), static_cast<unsigned>(av_frame->width),
        static_cast<unsigned>(av_frame->height), static_cast<unsigned>(destination_strides[0]));
    const auto hash = frame_identity::normalized_rgba_hash(
        rgba.get(), static_cast<std::size_t>(buffer_size), static_cast<unsigned>(av_frame->width),
        static_cast<unsigned>(av_frame->height), static_cast<unsigned>(destination_strides[0]));
    const auto analysis_ready = Clock::now();
    const auto& properties = source.GetVideoProperties();
    const auto& info = source.GetFrameInfo(requested);

    std::cout << "{\"type\":\"frame\",\"operation\":\"" << operation
              << "\",\"operationIndex\":" << operation_index
              << ",\"requestedFrame\":" << requested
              << ",\"originalFrame\":" << source.GetOriginalFrameNumber(requested)
              << ",\"pts\":\"" << frame.PTS
              << "\",\"duration\":\"" << frame.Duration
              << "\",\"timebase\":{\"numerator\":" << properties.TimeBase.Num
              << ",\"denominator\":" << properties.TimeBase.Den
              << "},\"width\":" << av_frame->width << ",\"height\":" << av_frame->height
              << ",\"codeValid\":" << (code.valid ? "true" : "false")
              << ",\"sourceCode\":" << code.value
              << ",\"frameInfoPts\":\"" << info.PTS
              << "\",\"frameInfoKeyFrame\":" << (info.KeyFrame ? "true" : "false")
              << ",\"frameInfoHash\":\"" << bestsource_hash(info.Hash)
              << "\",\"rgbaHash\":\"" << std::hex << hash << std::dec
              << "\",\"previousKeyframe\":" << seek_context.previous_keyframe
              << ",\"framesSincePreviousKeyframe\":" << seek_context.frames_since_previous_keyframe
              << ",\"previousSeekKeyframe\":" << seek_context.previous_seek_keyframe
              << ",\"framesSincePreviousSeekKeyframe\":"
              << seek_context.frames_since_previous_seek_keyframe
              << ",\"accessPath\":\"" << access_path << "\""
              << ",\"deliveredCacheHit\":" << (delivered_cache_hit ? "true" : "false")
              << ",\"deliveredCacheFrames\":" << delivered_cache_frames
              << ",\"deliveredCacheBytes\":" << delivered_cache_bytes
              << ",\"getFrameMs\":" << duration_ms(started, frame_ready)
              << ",\"conversionMs\":" << duration_ms(frame_ready, conversion_ready)
              << ",\"analysisMs\":" << duration_ms(conversion_ready, analysis_ready)
              << ",\"latencyMs\":" << std::fixed << std::setprecision(3)
              << elapsed_ms(started) << "}\n";
}

void emit_frame(BestVideoSource& source, std::int64_t requested,
                const std::string& operation, std::size_t operation_index) {
    const auto started = Clock::now();
    std::unique_ptr<BestVideoFrame> frame(source.GetFrame(requested));
    const auto frame_ready = Clock::now();
    if (!frame) throw std::runtime_error("BestSource returned a null frame");
    emit_frame_result(source, requested, *frame, operation, operation_index, started, frame_ready,
                      "bestsource-auto", false, 0, 0);
}

void emit_prepared_access(BestVideoSource& source, PreparedVideoSession& session,
                          bool exact, std::int64_t value, std::size_t operation_index) {
    const auto started = Clock::now();
    const auto access = exact ? session.GetExact(value) : session.StepAdjacent(static_cast<int>(value));
    const auto frame_ready = Clock::now();
    if (!access.frame) throw std::runtime_error("prepared session returned no frame");
    const std::string operation = exact ? "held-landing" : value > 0 ? "held-forward" : "held-reverse";
    emit_frame_result(source, access.frame_index, *access.frame, operation, operation_index,
                      started, frame_ready, access.access_path, access.cache_hit,
                      session.CachedFrameCount(), session.CachedBytes());
}

int run_probe(const std::filesystem::path& movie, const std::filesystem::path& cache_path,
               const std::vector<std::int64_t>& requested_frames, bool cancel, bool suite,
               bool hash_diagnostics, bool held_step) {
    std::map<std::string, std::string> lavf_options;
    int last_percent = -1;
    int progress_delay_ms = 0;
    if (const char* delay = std::getenv("BESTSOURCE_GATE_PROGRESS_DELAY_MS")) {
        progress_delay_ms = std::max(0, std::stoi(delay));
    }
    int requested_decoder_instances = 2;
    if (const char* instances = std::getenv("BESTSOURCE_GATE_DECODER_INSTANCES")) {
        requested_decoder_instances = std::stoi(instances);
        if (requested_decoder_instances < 1) {
            throw std::runtime_error("BESTSOURCE_GATE_DECODER_INSTANCES must be at least 1");
        }
    }
    std::string hardware_device;
    if (const char* requested_device = std::getenv("BESTSOURCE_GATE_HW_DEVICE")) {
        hardware_device = requested_device;
        if (hardware_device.size() > 64) {
            throw std::runtime_error("BESTSOURCE_GATE_HW_DEVICE exceeds 64 characters");
        }
    }
    const auto indexing_started = Clock::now();
    ProgressFunction progress = [&](int track, std::int64_t current, std::int64_t total) {
        if (progress_delay_ms > 0) std::this_thread::sleep_for(std::chrono::milliseconds(progress_delay_ms));
        if (cancel && current > 0) return false;
        int percent = total > 0 && total != INT64_MAX
            ? static_cast<int>(std::clamp<std::int64_t>(current * 100 / total, 0, 100))
            : 100;
        if (percent != last_percent && (percent == 100 || percent >= last_percent + 5)) {
            last_percent = percent;
            std::cout << "{\"type\":\"index-progress\",\"track\":" << track
                      << ",\"percent\":" << percent << "}\n" << std::flush;
        }
        return true;
    };

    std::cout << "{\"type\":\"phase\",\"name\":\"constructor-started\"}\n" << std::flush;
    BestVideoSource source(movie, hardware_device, 0, -1, 0, 0, bcmAlwaysAbsolutePath,
                           cache_path, &lavf_options, progress);
    const auto constructor_ms = elapsed_ms(indexing_started);
    std::cout << "{\"type\":\"phase\",\"name\":\"constructor-completed\"}\n" << std::flush;
    source.SetMaxCacheSize(256ull * 1024 * 1024);
    std::cout << "{\"type\":\"phase\",\"name\":\"frame-cache-configured\"}\n" << std::flush;
    source.SetSeekPreRoll(seek_preroll_frames);
    std::cout << "{\"type\":\"phase\",\"name\":\"seek-preroll-configured\"}\n" << std::flush;
    const int decoder_instances = source.SetMaxDecoderInstances(requested_decoder_instances);
    std::cout << "{\"type\":\"phase\",\"name\":\"decoder-pool-configured\"}\n" << std::flush;
    const auto& properties = source.GetVideoProperties();
    std::cout << "{\"type\":\"phase\",\"name\":\"properties-read\"}\n" << std::flush;

    std::cout << "{\"type\":\"source\",\"track\":" << source.GetTrack()
              << ",\"numFrames\":" << properties.NumFrames
              << ",\"duration\":\"" << properties.Duration
              << "\",\"timebase\":{\"numerator\":" << properties.TimeBase.Num
              << ",\"denominator\":" << properties.TimeBase.Den
              << "},\"constructorMs\":" << std::fixed << std::setprecision(3) << constructor_ms
               << ",\"maxCacheBytes\":268435456,\"seekPreRoll\":20"
               << ",\"decoderInstances\":" << decoder_instances
               << ",\"hardwareDevice\":\"" << escape_json(hardware_device) << "\"}\n";

    if (hash_diagnostics) {
        emit_hash_diagnostics(source, properties.NumFrames);
        std::cout << "{\"type\":\"complete\",\"peakWorkingSetBytes\":"
                  << peak_working_set_bytes() << "}\n";
        return 0;
    }

    if (held_step) {
        if (!requested_frames.empty() && requested_frames.size() != 2 && requested_frames.size() != 3) {
            throw std::runtime_error("held-step frame list must contain start,count[,interval-ms]");
        }
        const auto default_count = std::min<std::int64_t>(120, std::max<std::int64_t>(0, properties.NumFrames - 1));
        const auto count = requested_frames.empty() ? default_count : requested_frames[1];
        const auto start = requested_frames.empty()
            ? std::max<std::int64_t>(0, properties.NumFrames / 2 - count / 2)
            : requested_frames[0];
        const auto interval_ms = requested_frames.size() == 3 ? requested_frames[2] : 0;
        if (count < 1 || start < 0 || start + count >= properties.NumFrames) {
            throw std::runtime_error("held-step start/count is outside the indexed source");
        }
        if (interval_ms < 0 || interval_ms > 10000) {
            throw std::runtime_error("held-step interval must be between 0 and 10000 ms");
        }
        PreparedVideoSession session(source);
        emit_prepared_access(source, session, true, start, 0);
        const auto forward_started = Clock::now();
        for (std::int64_t index = 0; index < count; ++index) {
            const auto step_started = Clock::now();
            emit_prepared_access(source, session, false, 1, static_cast<std::size_t>(index));
            const auto step_elapsed = Clock::now() - step_started;
            const auto target_interval = std::chrono::milliseconds(interval_ms);
            if (interval_ms > 0 && step_elapsed < target_interval) {
                std::this_thread::sleep_for(target_interval - step_elapsed);
            }
        }
        const auto forward_elapsed_ms = elapsed_ms(forward_started);
        const auto reverse_started = Clock::now();
        for (std::int64_t index = 0; index < count; ++index) {
            const auto step_started = Clock::now();
            emit_prepared_access(source, session, false, -1, static_cast<std::size_t>(index));
            const auto step_elapsed = Clock::now() - step_started;
            const auto target_interval = std::chrono::milliseconds(interval_ms);
            if (interval_ms > 0 && step_elapsed < target_interval) {
                std::this_thread::sleep_for(target_interval - step_elapsed);
            }
        }
        const auto reverse_elapsed_ms = elapsed_ms(reverse_started);
        std::cout << "{\"type\":\"held-step-summary\",\"startFrame\":" << start
                  << ",\"stepCount\":" << count
                  << ",\"intervalMs\":" << interval_ms
                  << ",\"forwardElapsedMs\":" << forward_elapsed_ms
                  << ",\"reverseElapsedMs\":" << reverse_elapsed_ms
                  << ",\"cachedFrames\":" << session.CachedFrameCount()
                  << ",\"cachedBytes\":" << session.CachedBytes() << "}\n";
        std::cout << "{\"type\":\"complete\",\"peakWorkingSetBytes\":"
                  << peak_working_set_bytes() << "}\n";
        return 0;
    }

    std::vector<std::int64_t> frames = requested_frames;
    if (frames.empty() && properties.NumFrames > 0) {
        frames = {0, properties.NumFrames / 2, properties.NumFrames - 1};
    }
    if (suite) {
        for (const auto& operation : make_frame_operations(properties.NumFrames)) {
            for (std::size_t index = 0; index < operation.frames.size(); ++index) {
                emit_frame(source, operation.frames[index], operation.name, index);
            }
        }
    } else {
        for (std::size_t index = 0; index < frames.size(); ++index) {
            const auto frame = frames[index];
            if (frame < 0 || frame >= properties.NumFrames) {
                throw std::runtime_error("requested frame is outside the indexed source");
            }
            emit_frame(source, frame, "probe", index);
        }
    }

    std::cout << "{\"type\":\"complete\",\"peakWorkingSetBytes\":"
              << peak_working_set_bytes() << "}\n";
    return 0;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    if (argc < 4 || argc > 5) {
        std::cerr << "usage: bestsource_gate <probe|suite|cancel|hash-diagnostics|held-step> <movie> <cache-base> [frame-list]\n";
        return 2;
    }

    const std::wstring mode = argv[1];
    const auto movie = std::filesystem::path(argv[2]);
    const auto cache_path = std::filesystem::path(argv[3]);
    try {
        if (const char* debug = std::getenv("BESTSOURCE_GATE_DEBUG")) {
            SetBSDebugOutput(std::string(debug) != "0");
        }
        if (mode != L"probe" && mode != L"suite" && mode != L"cancel" && mode != L"hash-diagnostics" && mode != L"held-step") {
            throw std::runtime_error("unknown mode");
        }
        return run_probe(movie, cache_path, argc == 5 ? parse_frames(argv[4]) : std::vector<std::int64_t>{},
                         mode == L"cancel", mode == L"suite", mode == L"hash-diagnostics",
                         mode == L"held-step");
    } catch (const std::exception& error) {
        std::cout << "{\"type\":\"error\",\"mode\":\"" << escape_json(utf8(mode))
                  << "\",\"message\":\"" << escape_json(error.what()) << "\"}\n";
        return mode == L"cancel" ? 3 : 1;
    }
}
