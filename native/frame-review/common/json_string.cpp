#include "json_string.hpp"

namespace frame_review {

JsonString::JsonString(const std::string& value) {
    serialized_.reserve(value.size() + 2);
    serialized_.push_back('"');
    for (const unsigned char character : value) {
        switch (character) {
            case '"': serialized_ += "\\\""; break;
            case '\\': serialized_ += "\\\\"; break;
            case '\b': serialized_ += "\\b"; break;
            case '\f': serialized_ += "\\f"; break;
            case '\n': serialized_ += "\\n"; break;
            case '\r': serialized_ += "\\r"; break;
            case '\t': serialized_ += "\\t"; break;
            default:
                if (character < 0x20) {
                    static constexpr char hex[] = "0123456789abcdef";
                    serialized_ += "\\u00";
                    serialized_.push_back(hex[character >> 4]);
                    serialized_.push_back(hex[character & 0x0f]);
                } else {
                    serialized_.push_back(static_cast<char>(character));
                }
        }
    }
    serialized_.push_back('"');
}

const std::string& JsonString::serialized() const noexcept {
    return serialized_;
}

}  // namespace frame_review
