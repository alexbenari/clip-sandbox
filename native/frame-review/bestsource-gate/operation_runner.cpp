#include "operation_runner.hpp"

#include <algorithm>
#include <numeric>
#include <random>

std::vector<FrameOperation> make_frame_operations(std::int64_t frame_count) {
    std::vector<FrameOperation> operations;
    if (frame_count <= 0) return operations;

    FrameOperation forward{"forward", {}};
    forward.frames.resize(static_cast<std::size_t>(frame_count));
    std::iota(forward.frames.begin(), forward.frames.end(), 0);
    operations.push_back(forward);

    FrameOperation reverse{"reverse", forward.frames};
    std::reverse(reverse.frames.begin(), reverse.frames.end());
    operations.push_back(std::move(reverse));

    FrameOperation alternating{"alternating", {}};
    const auto middle = frame_count / 2;
    alternating.frames.push_back(middle);
    for (std::int64_t distance = 1; alternating.frames.size() < static_cast<std::size_t>(frame_count); ++distance) {
        if (middle + distance < frame_count) alternating.frames.push_back(middle + distance);
        if (middle - distance >= 0) alternating.frames.push_back(middle - distance);
    }
    operations.push_back(std::move(alternating));

    FrameOperation random{"random-neighbors", forward.frames};
    std::mt19937 generator(0xB35750u);
    std::shuffle(random.frames.begin(), random.frames.end(), generator);
    std::vector<std::int64_t> with_neighbors;
    for (const auto frame : random.frames) {
        with_neighbors.push_back(frame);
        if (frame + 1 < frame_count) with_neighbors.push_back(frame + 1);
    }
    random.frames = std::move(with_neighbors);
    operations.push_back(std::move(random));

    const auto repeat = std::min<std::int64_t>(frame_count - 1, frame_count / 3);
    operations.push_back({"repeat", {repeat, repeat, repeat, repeat, repeat}});
    operations.push_back({"boundaries", {0, frame_count - 1, 0, frame_count - 1}});
    return operations;
}
