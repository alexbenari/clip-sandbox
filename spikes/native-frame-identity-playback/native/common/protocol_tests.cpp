#include "protocol.hpp"

#include <cassert>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

int main() {
    std::stringstream stream(std::ios::in | std::ios::out | std::ios::binary);
    const std::vector<std::uint8_t> pixels{1, 2, 3, 4};
    frame_bridge::write_message(stream, {{"type", "frame"}, {"requestId", "7"}},
                                pixels.data(), pixels.size());
    frame_bridge::Message decoded;
    assert(frame_bridge::read_message(stream, decoded));
    assert(decoded.metadata.at("type") == "frame");
    assert(decoded.metadata.at("requestId") == "7");
    assert(decoded.payload == pixels);
    assert(!frame_bridge::read_message(stream, decoded));

    std::string invalid(frame_bridge::wire_header_bytes, '\0');
    std::stringstream invalid_stream(invalid, std::ios::in | std::ios::binary);
    bool rejected = false;
    try {
        frame_bridge::read_message(invalid_stream, decoded);
    } catch (const std::runtime_error&) {
        rejected = true;
    }
    assert(rejected);
    return 0;
}
