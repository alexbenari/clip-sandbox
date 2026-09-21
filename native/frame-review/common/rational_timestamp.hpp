#pragma once

#include <cstdint>
#include <stdexcept>

namespace frame_identity {

struct Timebase {
    std::int64_t numerator;
    std::int64_t denominator;
};

struct RationalTimestamp {
    std::int64_t ticks;
    Timebase timebase;
};

int compare(RationalTimestamp left, RationalTimestamp right);
std::int64_t rescale_exact(std::int64_t ticks, Timebase source, Timebase destination);

}  // namespace frame_identity
