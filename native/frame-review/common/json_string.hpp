#pragma once

#include <string>

namespace frame_review {

class JsonString {
public:
    explicit JsonString(const std::string& value);

    const std::string& serialized() const noexcept;

private:
    std::string serialized_;
};

}  // namespace frame_review
