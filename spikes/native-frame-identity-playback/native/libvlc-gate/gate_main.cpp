#include "callback_state.hpp"
#include "libvlc_api.hpp"

#include <algorithm>
#include <chrono>
#include <codecvt>
#include <functional>
#include <iomanip>
#include <iostream>
#include <locale>
#include <sstream>
#include <stdexcept>
#include <string>

using namespace std::chrono_literals;

class ScopeExit {
public:
    explicit ScopeExit(std::function<void()> action) : action_(std::move(action)) {}
    ~ScopeExit() noexcept {
        if (!active_) return;
        action_();
    }
    ScopeExit(const ScopeExit&) = delete;
    ScopeExit& operator=(const ScopeExit&) = delete;
    void dismiss() noexcept { active_ = false; }

private:
    std::function<void()> action_;
    bool active_ = true;
};

std::string utf8(const std::wstring& value) {
    return std::wstring_convert<std::codecvt_utf8_utf16<wchar_t>>{}.to_bytes(value);
}

std::string escape_json(const std::string& value) {
    std::ostringstream output;
    for (const unsigned char character : value) {
        switch (character) {
            case '\\': output << "\\\\"; break;
            case '"': output << "\\\""; break;
            case '\n': output << "\\n"; break;
            case '\r': output << "\\r"; break;
            case '\t': output << "\\t"; break;
            default:
                if (character < 0x20) output << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(character);
                else output << character;
        }
    }
    return output.str();
}

void emit_display(const char* operation, int operation_index, int status,
                  const DisplayObservation& display, double latency_ms, std::size_t operation_displays = 1) {
    std::cout << "{\"type\":\"observation\",\"operation\":\"" << operation
              << "\",\"operationIndex\":" << operation_index
              << ",\"status\":" << status
              << ",\"displaySequence\":" << display.sequence
              << ",\"codeValid\":" << (display.code_valid ? "true" : "false")
              << ",\"sourceCode\":" << display.source_code
              << ",\"rgbaHash\":\"" << std::hex << display.rgba_hash << std::dec
              << "\",\"watchTimeUs\":" << display.watch_time_us
              << ",\"width\":" << display.width << ",\"height\":" << display.height
              << ",\"operationDisplayCount\":" << operation_displays
              << ",\"latencyMs\":" << std::fixed << std::setprecision(3) << latency_ms << "}\n";
}

void emit_status(const char* operation, int operation_index, int status) {
    std::cout << "{\"type\":\"status\",\"operation\":\"" << operation
              << "\",\"operationIndex\":" << operation_index
              << ",\"status\":" << status << "}\n";
}

DisplayObservation wait_display(CallbackState& state, std::uint64_t previous,
                                std::chrono::steady_clock::time_point started) {
    const auto display = state.wait_for_display_after(previous, 15s);
    const auto latency = std::chrono::duration<double, std::milli>(display.displayed_at - started).count();
    if (latency < 0) throw std::runtime_error("Display callback timestamp preceded the operation.");
    return display;
}

int wmain(int argc, wchar_t** argv) {
    if ((argc != 4 && argc != 5)
        || (std::wstring(argv[1]) != L"fixture" && std::wstring(argv[1]) != L"smoke")) {
        std::cerr << "usage: libvlc_gate <fixture|smoke> <libvlc.dll> <movie> [fixture-start-us]\n";
        return 2;
    }

    const std::string mode = utf8(argv[1]);
    const std::string movie = utf8(argv[3]);
    try {
        LibVlcApi api(argv[2]);
        const char* instance_args[] = {"--no-audio", "--no-spu", "--no-osd"};
        auto* instance = api.new_instance(3, instance_args);
        if (instance == nullptr) throw std::runtime_error("libvlc_new returned null.");
        ScopeExit instance_guard([&] { api.release_instance(instance); });

        CallbackState callbacks;
        libvlc_media_player_cbs player_callbacks{};
        player_callbacks.version = 0;
        player_callbacks.on_state_changed = &CallbackState::on_state;
        player_callbacks.on_next_frame_status = &CallbackState::on_next_status;
        player_callbacks.on_prev_frame_status = &CallbackState::on_previous_status;
        auto* player = api.new_player(instance, &player_callbacks, &callbacks);
        if (player == nullptr) {
            throw std::runtime_error("libvlc_media_player_new returned null.");
        }
        ScopeExit player_guard([&] {
            api.stop_async(player);
            api.release_player(player);
        });

        api.set_video_callbacks(player, &CallbackState::lock, &CallbackState::unlock,
                                &CallbackState::display, &callbacks);
        api.set_format_callbacks(player, &CallbackState::format, &CallbackState::cleanup);
        libvlc_media_player_watch_time_cbs time_callbacks{};
        time_callbacks.version = 0;
        time_callbacks.on_update = &CallbackState::on_time;
        time_callbacks.on_paused = &CallbackState::on_time_paused;
        time_callbacks.on_seek = &CallbackState::on_seek;
        if (api.watch_time(player, 0, &time_callbacks, &callbacks) != 0) {
            throw std::runtime_error("libvlc_media_player_watch_time failed.");
        }
        bool watching_time = true;
        ScopeExit watch_guard([&] { if (watching_time) api.unwatch_time(player); });

        auto* media = api.new_media_path(movie.c_str());
        if (media == nullptr) throw std::runtime_error("libvlc_media_new_path returned null.");
        ScopeExit media_guard([&] { api.release_media(media); });
        api.set_media(player, media);
        api.release_media(media);
        media_guard.dismiss();
        api.set_mute(player, true);

        auto display_sequence = callbacks.display_count();
        auto started = std::chrono::steady_clock::now();
        if (api.play(player) != 0) throw std::runtime_error("libvlc_media_player_play failed.");
        auto display = wait_display(callbacks, display_sequence, started);
        emit_display("play-first", 0, 0, display,
                     std::chrono::duration<double, std::milli>(display.displayed_at - started).count());
        const auto timeline_start = argc == 5
            ? static_cast<libvlc_time_t>(std::stoll(utf8(argv[4])))
            : std::max<libvlc_time_t>(0, api.get_time(player));

        if (mode == "fixture") {
            auto run_next = [&](const char* operation, int index) {
                display_sequence = callbacks.display_count();
                const auto status_count = callbacks.next_status_count();
                started = std::chrono::steady_clock::now();
                api.next_frame(player);
                const int status = callbacks.wait_for_next_status_after(status_count, 10s);
                if (!callbacks.wait_for_state(libvlc_Paused, 10s)) {
                    throw std::runtime_error("Timed out waiting for paused state after next-frame request.");
                }
                std::size_t operation_displays = 0;
                display = callbacks.wait_for_display_settled_after(display_sequence, 20ms, 10s, &operation_displays);
                emit_display(operation, index, status, display,
                             std::chrono::duration<double, std::milli>(display.displayed_at - started).count(),
                             operation_displays);
                return display;
            };

            auto run_previous = [&](const char* operation, int index) {
                display_sequence = callbacks.display_count();
                const auto status_count = callbacks.previous_status_count();
                started = std::chrono::steady_clock::now();
                api.previous_frame(player);
                const int status = callbacks.wait_for_previous_status_after(status_count, 10s);
                std::size_t operation_displays = 0;
                display = callbacks.wait_for_display_settled_after(display_sequence, 20ms, 10s, &operation_displays);
                emit_display(operation, index, status, display,
                             std::chrono::duration<double, std::milli>(display.displayed_at - started).count(),
                             operation_displays);
                return display;
            };

            const auto length = api.get_length(player);
            auto run_seek = [&](const char* operation, int index, libvlc_time_t target) {
                api.set_pause(player, true);
                if (!callbacks.wait_for_state(libvlc_Paused, 2s)) {
                    throw std::runtime_error("Timed out waiting for paused state before seek.");
                }
                display_sequence = callbacks.display_count();
                const auto seek_count = callbacks.seek_completion_count();
                started = std::chrono::steady_clock::now();
                const int status = api.set_time(player, target, false);
                if (!callbacks.wait_for_seek_completion_after(seek_count, 10s)) {
                    throw std::runtime_error("Timed out waiting for seek completion.");
                }
                api.set_pause(player, true);
                if (!callbacks.wait_for_state(libvlc_Paused, 2s)) {
                    throw std::runtime_error("Timed out waiting for paused state after seek.");
                }
                const auto materialize_status_count = callbacks.next_status_count();
                api.next_frame(player);
                const int materialize_status = callbacks.wait_for_next_status_after(materialize_status_count, 10s);
                std::size_t operation_displays = 0;
                display = callbacks.wait_for_display_settled_after(display_sequence, 20ms, 10s, &operation_displays);
                std::cout << "{\"type\":\"seek-request\",\"operation\":\"" << operation
                          << "\",\"operationIndex\":" << index
                          << ",\"targetTimeUs\":" << target << "}\n";
                emit_status((std::string(operation) + "-materialize").c_str(), index, materialize_status);
                emit_display(operation, index, status, display,
                             std::chrono::duration<double, std::milli>(display.displayed_at - started).count(),
                             operation_displays);
                return display;
            };

            run_next("pause-prime", 0);
            for (int index = 0; index < 12; ++index) run_next("next", index);
            for (int index = 0; index < 6; ++index) run_previous("previous", index);

            for (int index = 0; index < 3; ++index) {
                run_next("alternate-next", index);
                run_previous("alternate-previous", index);
            }

            const auto middle = length > timeline_start
                ? timeline_start + (length - timeline_start) / 2
                : timeline_start + 1500000;
            for (int index = 0; index < 2; ++index) run_seek("seek-middle", index, middle);

            const auto random_target = length > timeline_start
                ? timeline_start + ((length - timeline_start) * 2) / 5
                : timeline_start + 1200000;
            run_seek("seek-random", 0, random_target);
            run_next("seek-next", 0);
            run_previous("seek-previous", 0);

            run_seek("seek-start", 0, timeline_start);
            const auto start_status_count = callbacks.previous_status_count();
            api.previous_frame(player);
            emit_status("previous-at-start", 0,
                        callbacks.wait_for_previous_status_after(start_status_count, 10s));

            const auto end_target = length > 100000 ? length - 100000 : 0;
            run_seek("seek-end", 0, end_target);
            run_next("end-next", 0);
            const auto end_status_count = callbacks.next_status_count();
            api.next_frame(player);
            emit_status("next-at-end", 0,
                        callbacks.wait_for_next_status_after(end_status_count, 10s));
        }

        api.stop_async(player);
        if (!callbacks.wait_for_state(libvlc_Stopped, 5s)) {
            throw std::runtime_error("Timed out waiting for stopped state.");
        }
        api.unwatch_time(player);
        watching_time = false;
        watch_guard.dismiss();
        api.release_player(player);
        player_guard.dismiss();
        api.release_instance(instance);
        instance_guard.dismiss();
        std::cout << "{\"type\":\"summary\",\"mode\":\"" << mode
                  << "\",\"movie\":\"" << escape_json(movie)
                  << "\",\"result\":\"completed\"}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cout << "{\"type\":\"summary\",\"mode\":\"" << mode
                  << "\",\"movie\":\"" << escape_json(movie)
                  << "\",\"result\":\"failed\",\"error\":\""
                  << escape_json(error.what()) << "\"}\n";
        return 1;
    }
}
