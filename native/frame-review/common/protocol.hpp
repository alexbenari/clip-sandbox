#pragma once

#include <cstddef>
#include <cstdint>
#include <istream>
#include <ostream>
#include <vector>

#include <nlohmann/json.hpp>

namespace frame_bridge {

constexpr std::uint16_t protocol_version = 1;
constexpr std::size_t wire_header_bytes = 16;
constexpr std::size_t maximum_metadata_bytes = 1024 * 1024;
constexpr std::size_t maximum_payload_bytes = 256ull * 1024 * 1024;

struct Message {
    nlohmann::json metadata;
    std::vector<std::uint8_t> payload;
};

bool read_message(std::istream& input, Message& message);
void write_message(std::ostream& output, const nlohmann::json& metadata,
                   const std::uint8_t* payload = nullptr, std::size_t payload_size = 0);

}  // namespace frame_bridge
