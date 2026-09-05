#pragma once

#include <algorithm>
#include <cstdint>
#include <stdexcept>

namespace frame_bridge {

struct PreviewSize {
    unsigned width;
    unsigned height;
};

inline PreviewSize fit_preview_size(unsigned source_width, unsigned source_height,
                                    unsigned maximum_width, unsigned maximum_height) {
    if (source_width == 0 || source_height == 0 || maximum_width == 0 || maximum_height == 0) {
        throw std::invalid_argument("preview dimensions must be positive");
    }
    if (source_width <= maximum_width && source_height <= maximum_height) {
        return {source_width, source_height};
    }
    if (static_cast<std::uint64_t>(maximum_width) * source_height <=
        static_cast<std::uint64_t>(maximum_height) * source_width) {
        return {
            maximum_width,
            (std::max)(1U, static_cast<unsigned>(
                static_cast<std::uint64_t>(source_height) * maximum_width / source_width)),
        };
    }
    return {
        (std::max)(1U, static_cast<unsigned>(
            static_cast<std::uint64_t>(source_width) * maximum_height / source_height)),
        maximum_height,
    };
}

inline unsigned project_visible_extent(unsigned visible_extent, unsigned source_buffer_extent,
                                       unsigned preview_buffer_extent) {
    if (visible_extent == 0 || source_buffer_extent == 0 || preview_buffer_extent == 0) {
        throw std::invalid_argument("visible projection dimensions must be positive");
    }
    return (std::min)(preview_buffer_extent, (std::max)(1U, static_cast<unsigned>(
        static_cast<std::uint64_t>(visible_extent) * preview_buffer_extent / source_buffer_extent)));
}

}  // namespace frame_bridge
