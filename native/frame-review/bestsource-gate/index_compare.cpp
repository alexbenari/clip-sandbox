#include "json_string.hpp"
#include "utf8_text.hpp"

#include <bestsource/bsshared.h>
#include <bestsource/videosource.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using Clock = std::chrono::steady_clock;

double elapsed_ms(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

BestVideoSource open_source(const std::filesystem::path& movie,
                            const std::filesystem::path& cache_path) {
    const std::map<std::string, std::string> options;
    return BestVideoSource(movie, "", 0, -1, 0, 0, bcmAlwaysAbsolutePath,
                           cache_path, &options, nullptr);
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    if (argc != 5) {
        std::cerr << "usage: index_compare <source> <source-cache> <candidate> <candidate-cache>\n";
        return 2;
    }

    try {
        const auto started = Clock::now();
        auto source = open_source(std::filesystem::path(argv[1]), std::filesystem::path(argv[2]));
        auto candidate = open_source(std::filesystem::path(argv[3]), std::filesystem::path(argv[4]));
        const auto source_frames = source.GetVideoProperties().NumFrames;
        const auto candidate_frames = candidate.GetVideoProperties().NumFrames;
        const auto compared = std::min(source_frames, candidate_frames);
        std::int64_t mismatches = 0;
        std::vector<std::int64_t> first_mismatches;
        for (std::int64_t index = 0; index < compared; ++index) {
            if (source.GetFrameInfo(index).Hash != candidate.GetFrameInfo(index).Hash) {
                ++mismatches;
                if (first_mismatches.size() < 10) first_mismatches.push_back(index);
            }
        }
        mismatches += std::max(source_frames, candidate_frames) - compared;

        std::cout << "{\"type\":\"index-comparison\",\"source\":"
                  << frame_review::JsonString(frame_review::Utf8Text(argv[1]).value()).serialized()
                  << ",\"candidate\":"
                  << frame_review::JsonString(frame_review::Utf8Text(argv[3]).value()).serialized() << ",\"sourceFrames\":" << source_frames
                  << ",\"candidateFrames\":" << candidate_frames
                  << ",\"comparedFrames\":" << compared
                  << ",\"mismatchCount\":" << mismatches
                  << ",\"frameCountPreserved\":" << (source_frames == candidate_frames ? "true" : "false")
                  << ",\"completeHashOrderPreserved\":" << (mismatches == 0 ? "true" : "false")
                  << ",\"firstMismatchFrames\":[";
        for (std::size_t index = 0; index < first_mismatches.size(); ++index) {
            if (index) std::cout << ',';
            std::cout << first_mismatches[index];
        }
        std::cout << "],\"elapsedMs\":" << std::fixed << std::setprecision(3)
                  << elapsed_ms(started) << "}\n";
        return mismatches == 0 ? 0 : 1;
    } catch (const std::exception& error) {
        std::cout << "{\"type\":\"error\",\"message\":"
                  << frame_review::JsonString(error.what()).serialized() << "}\n";
        return 1;
    }
}
