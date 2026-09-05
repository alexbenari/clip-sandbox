#include <iostream>
#include <string>
#include <windows.h>
#include <vlc/vlc.h>

template <typename Function>
Function require_symbol(HMODULE module, const char* name) {
    const auto symbol = GetProcAddress(module, name);
    if (symbol == nullptr) {
        std::cerr << "missing_symbol=" << name << '\n';
        std::exit(2);
    }
    return reinterpret_cast<Function>(symbol);
}

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: libvlc_api_probe <libvlc.dll>\n";
        return 1;
    }

    const auto module = LoadLibraryA(argv[1]);
    if (module == nullptr) {
        std::cerr << "load_error=" << GetLastError() << '\n';
        return 1;
    }

    const auto get_version = require_symbol<decltype(&libvlc_get_version)>(module, "libvlc_get_version");
    const auto get_changeset = require_symbol<decltype(&libvlc_get_changeset)>(module, "libvlc_get_changeset");
    require_symbol<decltype(&libvlc_media_player_new)>(module, "libvlc_media_player_new");
    require_symbol<decltype(&libvlc_media_player_next_frame)>(module, "libvlc_media_player_next_frame");
    require_symbol<decltype(&libvlc_media_player_previous_frame)>(module, "libvlc_media_player_previous_frame");
    require_symbol<decltype(&libvlc_video_set_callbacks)>(module, "libvlc_video_set_callbacks");
    require_symbol<decltype(&libvlc_video_set_format_callbacks)>(module, "libvlc_video_set_format_callbacks");
    require_symbol<decltype(&libvlc_video_get_size)>(module, "libvlc_video_get_size");
    require_symbol<decltype(&libvlc_video_set_output_callbacks)>(module, "libvlc_video_set_output_callbacks");

    std::cout << "libvlc=" << get_version() << '\n';
    std::cout << "changeset=" << get_changeset() << '\n';
    std::cout << "required_symbols=present\n";
    FreeLibrary(module);
    return 0;
}
