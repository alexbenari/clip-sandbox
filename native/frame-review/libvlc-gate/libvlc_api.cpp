#include "libvlc_api.hpp"

#include <stdexcept>

LibVlcApi::LibVlcApi(const std::wstring& dll_path) : module_(LoadLibraryW(dll_path.c_str())) {
    if (module_ == nullptr) throw std::runtime_error("Could not load the pinned libvlc.dll.");
    new_instance = load<decltype(new_instance)>("libvlc_new");
    release_instance = load<decltype(release_instance)>("libvlc_release");
    new_media_path = load<decltype(new_media_path)>("libvlc_media_new_path");
    release_media = load<decltype(release_media)>("libvlc_media_release");
    new_player = load<decltype(new_player)>("libvlc_media_player_new");
    release_player = load<decltype(release_player)>("libvlc_media_player_release");
    set_media = load<decltype(set_media)>("libvlc_media_player_set_media");
    play = load<decltype(play)>("libvlc_media_player_play");
    set_pause = load<decltype(set_pause)>("libvlc_media_player_set_pause");
    stop_async = load<decltype(stop_async)>("libvlc_media_player_stop_async");
    get_state = load<decltype(get_state)>("libvlc_media_player_get_state");
    get_time = load<decltype(get_time)>("libvlc_media_player_get_time");
    get_length = load<decltype(get_length)>("libvlc_media_player_get_length");
    set_time = load<decltype(set_time)>("libvlc_media_player_set_time");
    get_rate = load<decltype(get_rate)>("libvlc_media_player_get_rate");
    set_rate = load<decltype(set_rate)>("libvlc_media_player_set_rate");
    next_frame = load<decltype(next_frame)>("libvlc_media_player_next_frame");
    previous_frame = load<decltype(previous_frame)>("libvlc_media_player_previous_frame");
    watch_time = load<decltype(watch_time)>("libvlc_media_player_watch_time");
    unwatch_time = load<decltype(unwatch_time)>("libvlc_media_player_unwatch_time");
    set_video_callbacks = load<decltype(set_video_callbacks)>("libvlc_video_set_callbacks");
    set_format_callbacks = load<decltype(set_format_callbacks)>("libvlc_video_set_format_callbacks");
    get_video_size = load<decltype(get_video_size)>("libvlc_video_get_size");
    set_output_callbacks = load<decltype(set_output_callbacks)>("libvlc_video_set_output_callbacks");
    set_mute = load<decltype(set_mute)>("libvlc_audio_set_mute");
    get_version = load<decltype(get_version)>("libvlc_get_version");
    get_changeset = load<decltype(get_changeset)>("libvlc_get_changeset");
}

LibVlcApi::~LibVlcApi() {
    if (module_ != nullptr) FreeLibrary(module_);
}
