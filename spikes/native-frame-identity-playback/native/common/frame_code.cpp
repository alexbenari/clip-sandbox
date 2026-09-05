#include "frame_code.hpp"

#include <array>

namespace frame_identity {
namespace {
constexpr unsigned kCodeX = 8;
constexpr unsigned kCodeY = 8;
constexpr unsigned kCellSize = 8;
constexpr unsigned kCellGap = 2;
constexpr unsigned kCodeBits = 24;
constexpr std::array<int, 4> kPreamble{1, 0, 1, 0};
}

DecodedFrameCode decode_frame_code_rgba(
    const std::uint8_t* rgba,
    std::size_t bytes,
    unsigned width,
    unsigned height,
    unsigned stride) {
    if (rgba == nullptr || stride < width * 4 || height < kCodeY + kCellSize ||
        width < kCodeX + kCodeBits * (kCellSize + kCellGap) ||
        bytes < static_cast<std::size_t>(stride) * height) {
        return {false, 0};
    }

    std::array<int, kCodeBits> bits{};
    for (unsigned index = 0; index < kCodeBits; ++index) {
        const unsigned x = kCodeX + index * (kCellSize + kCellGap) + kCellSize / 2;
        const unsigned y = kCodeY + kCellSize / 2;
        const auto* pixel = rgba + static_cast<std::size_t>(y) * stride + x * 4;
        bits[index] = pixel[0] + pixel[1] + pixel[2] >= 384 ? 1 : 0;
    }

    for (unsigned index = 0; index < kPreamble.size(); ++index) {
        if (bits[index] != kPreamble[index]) return {false, 0};
    }

    std::uint16_t value = 0;
    for (unsigned index = 4; index < 20; ++index) {
        value = static_cast<std::uint16_t>((value << 1) | bits[index]);
    }
    for (unsigned group = 0; group < 4; ++group) {
        int parity = 0;
        for (unsigned index = group; index < 16; index += 4) parity ^= bits[4 + index];
        if (parity != bits[20 + group]) return {false, 0};
    }
    return {true, value};
}

std::uint64_t normalized_rgba_hash(
    const std::uint8_t* rgba,
    std::size_t bytes,
    unsigned width,
    unsigned height,
    unsigned stride) {
    if (rgba == nullptr || stride < width * 4 || bytes < static_cast<std::size_t>(stride) * height) return 0;
    std::uint64_t hash = 14695981039346656037ull;
    for (unsigned y = 0; y < height; ++y) {
        const auto* row = rgba + static_cast<std::size_t>(y) * stride;
        for (unsigned x = 0; x < width * 4; ++x) {
            hash ^= row[x];
            hash *= 1099511628211ull;
        }
    }
    return hash;
}

}  // namespace frame_identity

