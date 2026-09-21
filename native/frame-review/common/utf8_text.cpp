#include "utf8_text.hpp"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <limits>
#include <stdexcept>

namespace frame_review {

Utf8Text::Utf8Text(const std::wstring& windows_text) {
    if (windows_text.empty()) return;
    if (windows_text.size() > static_cast<std::size_t>(std::numeric_limits<int>::max())) {
        throw std::length_error("Windows text is too large to convert to UTF-8");
    }
    const auto input_size = static_cast<int>(windows_text.size());
    const int output_size = WideCharToMultiByte(
        CP_UTF8, 0, windows_text.data(), input_size, nullptr, 0, nullptr, nullptr);
    if (output_size <= 0) throw std::runtime_error("WideCharToMultiByte failed");
    value_.resize(static_cast<std::size_t>(output_size));
    const int written = WideCharToMultiByte(
        CP_UTF8, 0, windows_text.data(), input_size, value_.data(), output_size, nullptr, nullptr);
    if (written != output_size) throw std::runtime_error("WideCharToMultiByte failed");
}

const std::string& Utf8Text::value() const noexcept {
    return value_;
}

}  // namespace frame_review
