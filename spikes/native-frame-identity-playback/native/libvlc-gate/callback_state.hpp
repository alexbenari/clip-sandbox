#pragma once

#include "frame_code.hpp"

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <mutex>
#include <memory>
#include <vector>
#include <vlc/vlc.h>

struct DisplayObservation {
    std::uint64_t sequence;
    bool code_valid;
    std::uint16_t source_code;
    std::uint64_t rgba_hash;
    std::int64_t watch_time_us;
    unsigned width;
    unsigned height;
    std::chrono::steady_clock::time_point displayed_at;
};

class CallbackState {
public:
    static unsigned format(void** opaque, char* chroma, unsigned* width, unsigned* height,
                           unsigned* pitches, unsigned* lines);
    static void cleanup(void* opaque);
    static void* lock(void* opaque, void** planes);
    static void unlock(void* opaque, void* picture, void* const* planes);
    static void display(void* opaque, void* picture);
    static void on_state(void* opaque, libvlc_state_t state);
    static void on_next_status(void* opaque, int status);
    static void on_previous_status(void* opaque, int status);
    static void on_time(void* opaque, const libvlc_media_player_time_point_t* point);
    static void on_time_paused(void* opaque, libvlc_time_t system_date_us);
    static void on_seek(void* opaque, const libvlc_media_player_time_point_t* point);

    DisplayObservation wait_for_display_after(std::uint64_t sequence, std::chrono::milliseconds timeout);
    DisplayObservation wait_for_display_settled_after(
        std::uint64_t sequence,
        std::chrono::milliseconds idle,
        std::chrono::milliseconds timeout,
        std::size_t* display_count);
    int wait_for_next_status_after(std::size_t count, std::chrono::milliseconds timeout);
    int wait_for_previous_status_after(std::size_t count, std::chrono::milliseconds timeout);
    bool wait_for_state(libvlc_state_t state, std::chrono::milliseconds timeout);
    std::uint64_t display_count() const;
    std::size_t next_status_count() const;
    std::size_t previous_status_count() const;
    std::size_t seek_completion_count() const;
    bool wait_for_seek_completion_after(std::size_t count, std::chrono::milliseconds timeout);

private:
    struct BufferSlot {
        std::vector<std::uint8_t> pixels;
        bool in_use = false;
    };

    mutable std::mutex mutex_;
    std::condition_variable condition_;
    std::vector<std::unique_ptr<BufferSlot>> buffers_;
    unsigned width_ = 0;
    unsigned height_ = 0;
    unsigned pitch_ = 0;
    std::uint64_t display_sequence_ = 0;
    std::int64_t latest_watch_time_us_ = -1;
    std::deque<DisplayObservation> displays_;
    std::vector<int> next_statuses_;
    std::vector<int> previous_statuses_;
    std::size_t seek_completions_ = 0;
    libvlc_state_t state_ = libvlc_NothingSpecial;
};
