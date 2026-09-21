#include "protocol.hpp"

#include <cstdlib>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << '\n';
        std::exit(1);
    }
}

void require_rejected(const std::string& bytes) {
    std::stringstream stream(bytes, std::ios::in | std::ios::binary);
    frame_bridge::Message decoded;
    bool rejected = false;
    try {
        frame_bridge::read_message(stream, decoded);
    } catch (const std::runtime_error&) {
        rejected = true;
    }
    require(rejected, "invalid protocol input was accepted");
}

void write_u32(std::string& bytes, std::size_t offset, std::uint32_t value) {
    for (int index = 0; index < 4; ++index) {
        bytes[offset + index] = static_cast<char>((value >> (index * 8U)) & 0xffU);
    }
}

std::string valid_message() {
    std::stringstream stream(std::ios::in | std::ios::out | std::ios::binary);
    frame_bridge::write_message(stream, {{"type", "status"}, {"requestId", "bounded"}});
    return stream.str();
}

}  // namespace

int main() {
    std::stringstream stream(std::ios::in | std::ios::out | std::ios::binary);
    const std::vector<std::uint8_t> pixels{1, 2, 3, 4};
    frame_bridge::write_message(stream, {{"type", "frame"}, {"requestId", "7"}},
                                pixels.data(), pixels.size());
    frame_bridge::Message decoded;
    require(frame_bridge::read_message(stream, decoded), "valid message was not read");
    require(decoded.metadata.at("type") == "frame", "message type changed");
    require(decoded.metadata.at("requestId") == "7", "request id changed");
    require(decoded.payload == pixels, "payload changed");
    require(!frame_bridge::read_message(stream, decoded), "clean EOF was not reported");

    require_rejected(std::string(frame_bridge::wire_header_bytes, '\0'));

    auto unsupported_version = valid_message();
    unsupported_version[4] = 2;
    require_rejected(unsupported_version);

    auto empty_metadata = valid_message();
    write_u32(empty_metadata, 8, 0);
    require_rejected(empty_metadata);

    auto oversized_metadata = valid_message();
    write_u32(oversized_metadata, 8,
              static_cast<std::uint32_t>(frame_bridge::maximum_metadata_bytes + 1));
    require_rejected(oversized_metadata);

    auto oversized_payload = valid_message();
    write_u32(oversized_payload, 12,
              static_cast<std::uint32_t>(frame_bridge::maximum_payload_bytes + 1));
    require_rejected(oversized_payload);

    auto truncated_payload = valid_message();
    write_u32(truncated_payload, 12, 4);
    require_rejected(truncated_payload);

    bool invalid_write_rejected = false;
    try {
        std::stringstream output;
        frame_bridge::write_message(output, {{"type", "frame"}}, nullptr, 1);
    } catch (const std::runtime_error&) {
        invalid_write_rejected = true;
    }
    require(invalid_write_rejected, "non-empty null payload write was accepted");
    return 0;
}
