#include "frame_code.hpp"
#include "json_string.hpp"
#include "preview_size.hpp"
#include "rational_timestamp.hpp"
#include "utf8_text.hpp"

#include <cstdlib>
#include <iostream>
#include <vector>

using frame_identity::RationalTimestamp;
using frame_identity::Timebase;

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << message << '\n';
        std::exit(1);
    }
}

int main() {
    require(frame_review::JsonString("").serialized() == "\"\"",
            "empty JSON string must include both quotes");
    require(frame_review::JsonString("plain text").serialized() == "\"plain text\"",
            "plain JSON string must preserve content and quotes");
    require(frame_review::JsonString("quote \" slash \\").serialized() ==
                "\"quote \\\" slash \\\\\"",
            "quotes and backslashes must use JSON escapes");
    require(frame_review::JsonString("\b\f\n\r\t\x01").serialized() ==
                "\"\\b\\f\\n\\r\\t\\u0001\"",
            "special and control characters must use JSON escapes");
    require(frame_review::JsonString("שלום 🎬").serialized() == "\"שלום 🎬\"",
            "UTF-8 bytes must remain unchanged inside JSON quotes");
    require((std::string("{\"message\":") + frame_review::JsonString("read \"source\"").serialized() + "}") ==
                "{\"message\":\"read \\\"source\\\"\"}",
            "error caller must consume the complete JSON string");
    require((std::string("{\"path\":") + frame_review::JsonString("C:\\clips\\sample.mp4").serialized() + "}") ==
                "{\"path\":\"C:\\\\clips\\\\sample.mp4\"}",
            "path caller must consume the complete JSON string");
    require((std::string("{\"codec\":") + frame_review::JsonString("mpeg4").serialized() + "}") ==
                "{\"codec\":\"mpeg4\"}",
            "codec caller must consume the complete JSON string");

    require(frame_review::Utf8Text(L"").value().empty(),
            "empty Windows text must remain empty UTF-8");
    require(frame_review::Utf8Text(L"Clip Sandbox").value() == "Clip Sandbox",
            "ASCII Windows text must remain unchanged in UTF-8");
    require(frame_review::Utf8Text(L"\u05e9\u05dc\u05d5\u05dd \U0001f3ac").value() ==
                "\xd7\xa9\xd7\x9c\xd7\x95\xd7\x9d \xf0\x9f\x8e\xac",
            "Unicode Windows text must convert to UTF-8");

    const auto four_k_preview = frame_bridge::fit_preview_size(3840, 1606, 1280, 800);
    require(four_k_preview.width == 1280 && four_k_preview.height == 535,
            "4K preview must fit the viewport without changing aspect ratio");
    const auto small_preview = frame_bridge::fit_preview_size(720, 384, 1280, 800);
    require(small_preview.width == 720 && small_preview.height == 384,
            "preview fitting must not upscale smaller sources");
    require(frame_bridge::project_visible_extent(1606, 1632, 544) == 535,
            "visible height must retain LibVLC buffer cropping after preview scaling");

    require(frame_identity::compare({24, {1, 24}}, {1000, {1, 1000}}) == 0,
            "equal timestamps in different timebases must compare equal");
    require(frame_identity::compare({23, {1, 24}}, {1000, {1, 1000}}) < 0,
            "presentation order must use rational timestamps");
    require(frame_identity::rescale_exact(48, {1, 24}, {1, 1000}) == 2000,
            "exact timestamp rescaling failed");

    bool rejected = false;
    try {
        (void)frame_identity::rescale_exact(1, {1, 24}, {1, 1000});
    } catch (const std::domain_error&) {
        rejected = true;
    }
    require(rejected, "inexact timestamp rescaling must be rejected");

    std::vector<std::uint8_t> rgba(320 * 180 * 4, 0);
    const unsigned value = 37;
    const int preamble[4] = {1, 0, 1, 0};
    int bits[24]{};
    for (unsigned index = 0; index < 4; ++index) bits[index] = preamble[index];
    for (unsigned index = 0; index < 16; ++index) bits[4 + index] = (value >> (15 - index)) & 1;
    for (unsigned group = 0; group < 4; ++group) {
        for (unsigned index = group; index < 16; index += 4) bits[20 + group] ^= bits[4 + index];
    }
    for (unsigned index = 0; index < 24; ++index) {
        const unsigned x = 8 + index * 10 + 4;
        const unsigned y = 12;
        auto* pixel = rgba.data() + (y * 320 + x) * 4;
        pixel[0] = pixel[1] = pixel[2] = bits[index] ? 255 : 0;
        pixel[3] = 255;
    }
    const auto decoded = frame_identity::decode_frame_code_rgba(rgba.data(), rgba.size(), 320, 180, 320 * 4);
    require(decoded.valid && decoded.value == value, "native frame-code decoder returned the wrong source frame");

    std::cout << "COMMON_NATIVE_TESTS_READY\n";
    return 0;
}
