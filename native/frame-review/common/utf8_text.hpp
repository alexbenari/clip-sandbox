#pragma once

#include <string>

namespace frame_review {

class Utf8Text {
public:
    explicit Utf8Text(const std::wstring& windows_text);

    const std::string& value() const noexcept;

private:
    std::string value_;
};

}  // namespace frame_review
