#pragma once

#include <string>
#include <windows.h>
#include <vlc/vlc.h>

class LibVlcApi {
public:
    explicit LibVlcApi(const std::wstring& dll_path);
    ~LibVlcApi();
    LibVlcApi(const LibVlcApi&) = delete;
    LibVlcApi& operator=(const LibVlcApi&) = delete;

    decltype(&libvlc_new) new_instance;
    decltype(&libvlc_release) release_instance;
    decltype(&libvlc_media_new_path) new_media_path;
    decltype(&libvlc_media_release) release_media;
    decltype(&libvlc_media_player_new) new_player;
    decltype(&libvlc_media_player_release) release_player;
    decltype(&libvlc_media_player_set_media) set_media;
    decltype(&libvlc_media_player_play) play;
    decltype(&libvlc_media_player_set_pause) set_pause;
    decltype(&libvlc_media_player_stop_async) stop_async;
    decltype(&libvlc_media_player_get_state) get_state;
    decltype(&libvlc_media_player_get_time) get_time;
    decltype(&libvlc_media_player_get_length) get_length;
    decltype(&libvlc_media_player_set_time) set_time;
    decltype(&libvlc_media_player_get_rate) get_rate;
    decltype(&libvlc_media_player_set_rate) set_rate;
    decltype(&libvlc_media_player_next_frame) next_frame;
    decltype(&libvlc_media_player_previous_frame) previous_frame;
    decltype(&libvlc_media_player_watch_time) watch_time;
    decltype(&libvlc_media_player_unwatch_time) unwatch_time;
    decltype(&libvlc_video_set_callbacks) set_video_callbacks;
    decltype(&libvlc_video_set_format_callbacks) set_format_callbacks;
    decltype(&libvlc_video_get_size) get_video_size;
    decltype(&libvlc_video_set_output_callbacks) set_output_callbacks;
    decltype(&libvlc_audio_set_mute) set_mute;
    decltype(&libvlc_get_version) get_version;
    decltype(&libvlc_get_changeset) get_changeset;

private:
    HMODULE module_;

    template <typename Function>
    Function load(const char* name) {
        auto* symbol = GetProcAddress(module_, name);
        if (symbol == nullptr) throw std::runtime_error(std::string("Missing LibVLC symbol: ") + name);
        return reinterpret_cast<Function>(symbol);
    }
};
