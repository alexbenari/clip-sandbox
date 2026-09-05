#pragma once

#include <cstddef>
#include <cstdint>

namespace frame_identity {

struct DecodedFrameCode {
    bool valid;
    std::uint16_t value;
};

DecodedFrameCode decode_frame_code_rgba(
    const std::uint8_t* rgba,
    std::size_t bytes,
    unsigned width,
    unsigned height,
    unsigned stride);

std::uint64_t normalized_rgba_hash(
    const std::uint8_t* rgba,
    std::size_t bytes,
    unsigned width,
    unsigned height,
    unsigned stride);

}  // namespace frame_identity

