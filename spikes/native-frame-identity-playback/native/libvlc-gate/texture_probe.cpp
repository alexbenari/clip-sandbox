#include "libvlc_api.hpp"

#include <iostream>

bool setup(void** opaque, const libvlc_video_setup_device_cfg_t*, libvlc_video_setup_device_info_t*) {
    *opaque = reinterpret_cast<void*>(1);
    return true;
}
void cleanup(void*) {}
void set_window(void*, libvlc_video_output_resize_cb, libvlc_video_output_mouse_move_cb,
                libvlc_video_output_mouse_press_cb, libvlc_video_output_mouse_release_cb, void*) {}
bool update_output(void*, const libvlc_video_render_cfg_t*, libvlc_video_output_cfg_t*) { return true; }
void swap(void*) {}
bool make_current(void*, bool) { return true; }
void* get_proc(void*, const char*) { return nullptr; }
void metadata(void*, libvlc_video_metadata_type_t, const void*) {}
bool select_plane(void*, std::size_t, void*) { return true; }

int wmain(int argc, wchar_t** argv) {
    if (argc != 2) {
        std::cerr << "usage: libvlc_texture_probe <libvlc.dll>\n";
        return 2;
    }
    try {
        LibVlcApi api(argv[1]);
        auto* instance = api.new_instance(0, nullptr);
        if (instance == nullptr) return 1;
        auto* player = api.new_player(instance, nullptr, nullptr);
        if (player == nullptr) return 1;
        const bool registered = api.set_output_callbacks(
            player, libvlc_video_engine_d3d11, setup, cleanup, set_window, update_output,
            swap, make_current, get_proc, metadata, select_plane, nullptr);
        const bool detached = api.set_output_callbacks(
            player, libvlc_video_engine_disable, nullptr, nullptr, nullptr, nullptr,
            nullptr, nullptr, nullptr, nullptr, nullptr, nullptr);
        api.release_player(player);
        api.release_instance(instance);
        std::cout << "{\"d3d11CallbacksRegistered\":" << (registered ? "true" : "false")
                  << ",\"callbacksDetached\":" << (detached ? "true" : "false")
                  << ",\"renderTargetCreated\":false}\n";
        return registered && detached ? 0 : 1;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}

