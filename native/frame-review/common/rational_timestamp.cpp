#include "rational_timestamp.hpp"

#include <limits>
#include <numeric>

namespace frame_identity {
namespace {
void validate(Timebase value) {
    if (value.numerator <= 0 || value.denominator <= 0) {
        throw std::invalid_argument("Timebase terms must be positive.");
    }
}

std::int64_t checked_multiply(std::int64_t left, std::int64_t right) {
    if (left == 0 || right == 0) return 0;
    const auto minimum = std::numeric_limits<std::int64_t>::min();
    const auto maximum = std::numeric_limits<std::int64_t>::max();
    if ((right > 0 && (left > maximum / right || left < minimum / right)) ||
        (right < 0 && ((left > 0 && right < minimum / left) ||
                       (left < 0 && left < maximum / right)))) {
        throw std::overflow_error("timestamp overflow");
    }
    return left * right;
}
}

std::int64_t rescale_exact(std::int64_t ticks, Timebase source, Timebase destination) {
    validate(source);
    validate(destination);
    auto numeratorA = source.numerator;
    auto numeratorB = destination.denominator;
    auto denominatorA = source.denominator;
    auto denominatorB = destination.numerator;

    auto reduce = [](std::int64_t& numerator, std::int64_t& denominator) {
        const auto divisor = std::gcd(numerator, denominator);
        numerator /= divisor;
        denominator /= divisor;
    };
    reduce(numeratorA, denominatorA);
    reduce(numeratorA, denominatorB);
    reduce(numeratorB, denominatorA);
    reduce(numeratorB, denominatorB);

    auto value = ticks;
    auto reduce_ticks = [&value](std::int64_t& denominator) {
        const auto divisor = std::gcd(value < 0 ? -value : value, denominator);
        value /= divisor;
        denominator /= divisor;
    };
    reduce_ticks(denominatorA);
    reduce_ticks(denominatorB);
    if (denominatorA != 1 || denominatorB != 1) {
        throw std::domain_error("Timestamp cannot be represented exactly in the destination timebase.");
    }
    return checked_multiply(checked_multiply(value, numeratorA), numeratorB);
}

int compare(RationalTimestamp left, RationalTimestamp right) {
    validate(left.timebase);
    validate(right.timebase);
    const auto commonDenominator = std::lcm(left.timebase.denominator, right.timebase.denominator);
    const Timebase common{1, commonDenominator};
    const auto leftTicks = rescale_exact(left.ticks, left.timebase, common);
    const auto rightTicks = rescale_exact(right.ticks, right.timebase, common);
    return leftTicks < rightTicks ? -1 : leftTicks > rightTicks ? 1 : 0;
}

}  // namespace frame_identity
