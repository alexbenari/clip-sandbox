#include "protocol.hpp"

#include <array>
#include <cstring>
#include <stdexcept>
#include <string>

namespace frame_bridge {
namespace {

constexpr std::array<std::uint8_t, 4> magic{'F', 'V', 'S', 'P'};

std::uint16_t read_u16(const std::uint8_t* value) {
    return static_cast<std::uint16_t>(value[0]) |
           static_cast<std::uint16_t>(value[1] << 8U);
}

std::uint32_t read_u32(const std::uint8_t* value) {
    return static_cast<std::uint32_t>(value[0]) |
           (static_cast<std::uint32_t>(value[1]) << 8U) |
           (static_cast<std::uint32_t>(value[2]) << 16U) |
           (static_cast<std::uint32_t>(value[3]) << 24U);
}

void write_u16(std::uint8_t* target, std::uint16_t value) {
    target[0] = static_cast<std::uint8_t>(value & 0xffU);
    target[1] = static_cast<std::uint8_t>((value >> 8U) & 0xffU);
}

void write_u32(std::uint8_t* target, std::uint32_t value) {
    for (int index = 0; index < 4; ++index) {
        target[index] = static_cast<std::uint8_t>((value >> (index * 8U)) & 0xffU);
    }
}

void read_exact(std::istream& input, char* target, std::size_t size) {
    input.read(target, static_cast<std::streamsize>(size));
    if (static_cast<std::size_t>(input.gcount()) != size) {
        throw std::runtime_error("protocol message ended before its declared length");
    }
}

}  // namespace

bool read_message(std::istream& input, Message& message) {
    std::array<std::uint8_t, wire_header_bytes> header{};
    input.read(reinterpret_cast<char*>(header.data()), static_cast<std::streamsize>(header.size()));
    if (input.gcount() == 0 && input.eof()) return false;
    if (static_cast<std::size_t>(input.gcount()) != header.size()) {
        throw std::runtime_error("protocol header is truncated");
    }
    if (!std::equal(magic.begin(), magic.end(), header.begin())) {
        throw std::runtime_error("protocol magic is invalid");
    }
    if (read_u16(header.data() + 4) != protocol_version) {
        throw std::runtime_error("protocol version is unsupported");
    }
    const auto metadata_size = read_u32(header.data() + 8);
    const auto payload_size = read_u32(header.data() + 12);
    if (metadata_size == 0 || metadata_size > maximum_metadata_bytes) {
        throw std::runtime_error("protocol metadata length is invalid");
    }
    if (payload_size > maximum_payload_bytes) {
        throw std::runtime_error("protocol payload length is invalid");
    }

    std::string metadata(metadata_size, '\0');
    read_exact(input, metadata.data(), metadata.size());
    message.metadata = nlohmann::json::parse(metadata);
    message.payload.resize(payload_size);
    if (payload_size > 0) {
        read_exact(input, reinterpret_cast<char*>(message.payload.data()), payload_size);
    }
    return true;
}

void write_message(std::ostream& output, const nlohmann::json& metadata,
                   const std::uint8_t* payload, std::size_t payload_size) {
    const auto encoded = metadata.dump();
    if (encoded.empty() || encoded.size() > maximum_metadata_bytes) {
        throw std::runtime_error("protocol metadata exceeds its length limit");
    }
    if (payload_size > maximum_payload_bytes || (payload_size > 0 && payload == nullptr)) {
        throw std::runtime_error("protocol payload exceeds its length limit");
    }
    std::array<std::uint8_t, wire_header_bytes> header{};
    std::copy(magic.begin(), magic.end(), header.begin());
    write_u16(header.data() + 4, protocol_version);
    write_u16(header.data() + 6, 0);
    write_u32(header.data() + 8, static_cast<std::uint32_t>(encoded.size()));
    write_u32(header.data() + 12, static_cast<std::uint32_t>(payload_size));
    output.write(reinterpret_cast<const char*>(header.data()), static_cast<std::streamsize>(header.size()));
    output.write(encoded.data(), static_cast<std::streamsize>(encoded.size()));
    if (payload_size > 0) {
        output.write(reinterpret_cast<const char*>(payload), static_cast<std::streamsize>(payload_size));
    }
    output.flush();
    if (!output) throw std::runtime_error("protocol message write failed");
}

}  // namespace frame_bridge
