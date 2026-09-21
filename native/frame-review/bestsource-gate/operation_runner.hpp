#pragma once

#include <cstdint>
#include <string>
#include <vector>

struct FrameOperation {
    std::string name;
    std::vector<std::int64_t> frames;
};

std::vector<FrameOperation> make_frame_operations(std::int64_t frame_count);
