#include "callback_state.hpp"

#include <cstring>
#include <stdexcept>

using namespace std::chrono_literals;

unsigned CallbackState::format(void** opaque, char* chroma, unsigned* width, unsigned* height,
                               unsigned* pitches, unsigned* lines) {
    auto& state = *static_cast<CallbackState*>(*opaque);
    std::lock_guard<std::mutex> lock(state.mutex_);
    std::memcpy(chroma, "RV32", 4);
    state.width_ = *width;
    state.height_ = *height;
    state.pitch_ = *width * 4;
    pitches[0] = state.pitch_;
    lines[0] = *height;
    state.buffers_.clear();
    for (unsigned index = 0; index < 8; ++index) {
        auto slot = std::make_unique<BufferSlot>();
        slot->pixels.assign(static_cast<std::size_t>(state.pitch_) * state.height_, 0);
        state.buffers_.push_back(std::move(slot));
    }
    return static_cast<unsigned>(state.buffers_.size());
}

void CallbackState::cleanup(void*) {}

void* CallbackState::lock(void* opaque, void** planes) {
    auto& state = *static_cast<CallbackState*>(opaque);
    std::unique_lock<std::mutex> lock(state.mutex_);
    state.condition_.wait(lock, [&] {
        for (const auto& slot : state.buffers_) if (!slot->in_use) return true;
        return false;
    });
    for (const auto& slot : state.buffers_) {
        if (!slot->in_use) {
            slot->in_use = true;
            planes[0] = slot->pixels.data();
            return slot.get();
        }
    }
    return nullptr;
}

void CallbackState::unlock(void*, void*, void* const*) {}

void CallbackState::display(void* opaque, void* picture) {
    auto& state = *static_cast<CallbackState*>(opaque);
    auto& slot = *static_cast<BufferSlot*>(picture);
    std::lock_guard<std::mutex> lock(state.mutex_);
    const auto code = frame_identity::decode_frame_code_rgba(
        slot.pixels.data(), slot.pixels.size(), state.width_, state.height_, state.pitch_);
    state.display_sequence_ += 1;
    state.displays_.push_back({
        state.display_sequence_, code.valid, code.value,
        frame_identity::normalized_rgba_hash(
            slot.pixels.data(), slot.pixels.size(), state.width_, state.height_, state.pitch_),
        state.latest_watch_time_us_, state.width_, state.height_, std::chrono::steady_clock::now(),
    });
    while (state.displays_.size() > 64) state.displays_.pop_front();
    slot.in_use = false;
    state.condition_.notify_all();
}

void CallbackState::on_state(void* opaque, libvlc_state_t state_value) {
    auto& state = *static_cast<CallbackState*>(opaque);
    std::lock_guard<std::mutex> lock(state.mutex_);
    state.state_ = state_value;
    state.condition_.notify_all();
}

void CallbackState::on_next_status(void* opaque, int status) {
    auto& state = *static_cast<CallbackState*>(opaque);
    std::lock_guard<std::mutex> lock(state.mutex_);
    state.next_statuses_.push_back(status);
    state.condition_.notify_all();
}

void CallbackState::on_previous_status(void* opaque, int status) {
    auto& state = *static_cast<CallbackState*>(opaque);
    std::lock_guard<std::mutex> lock(state.mutex_);
    state.previous_statuses_.push_back(status);
    state.condition_.notify_all();
}

void CallbackState::on_time(void* opaque, const libvlc_media_player_time_point_t* point) {
    auto& state = *static_cast<CallbackState*>(opaque);
    std::lock_guard<std::mutex> lock(state.mutex_);
    state.latest_watch_time_us_ = point->ts_us;
    state.condition_.notify_all();
}

void CallbackState::on_time_paused(void*, libvlc_time_t) {}
void CallbackState::on_seek(void* opaque, const libvlc_media_player_time_point_t* point) {
    if (point != nullptr) return;
    auto& state = *static_cast<CallbackState*>(opaque);
    std::lock_guard<std::mutex> lock(state.mutex_);
    state.seek_completions_ += 1;
    state.condition_.notify_all();
}

DisplayObservation CallbackState::wait_for_display_after(
    std::uint64_t sequence, std::chrono::milliseconds timeout) {
    std::unique_lock<std::mutex> lock(mutex_);
    if (!condition_.wait_for(lock, timeout, [&] { return display_sequence_ > sequence; })) {
        throw std::runtime_error("Timed out waiting for a displayed frame.");
    }
    for (const auto& display : displays_) {
        if (display.sequence > sequence) return display;
    }
    throw std::runtime_error("Displayed frame was evicted before observation.");
}

DisplayObservation CallbackState::wait_for_display_settled_after(
    std::uint64_t sequence,
    std::chrono::milliseconds idle,
    std::chrono::milliseconds timeout,
    std::size_t* display_count) {
    std::unique_lock<std::mutex> lock(mutex_);
    const auto deadline = std::chrono::steady_clock::now() + timeout;
    if (!condition_.wait_until(lock, deadline, [&] { return display_sequence_ > sequence; })) {
        throw std::runtime_error("Timed out waiting for a displayed frame.");
    }

    auto observed_sequence = display_sequence_;
    while (condition_.wait_for(lock, idle, [&] { return display_sequence_ > observed_sequence; })) {
        observed_sequence = display_sequence_;
        if (std::chrono::steady_clock::now() >= deadline) {
            throw std::runtime_error("Displayed frames did not settle before the deadline.");
        }
    }

    *display_count = static_cast<std::size_t>(observed_sequence - sequence);
    for (auto iterator = displays_.rbegin(); iterator != displays_.rend(); ++iterator) {
        if (iterator->sequence == observed_sequence) return *iterator;
    }
    throw std::runtime_error("Settled displayed frame was evicted before observation.");
}

int CallbackState::wait_for_next_status_after(std::size_t count, std::chrono::milliseconds timeout) {
    std::unique_lock<std::mutex> lock(mutex_);
    if (!condition_.wait_for(lock, timeout, [&] { return next_statuses_.size() > count; })) {
        throw std::runtime_error("Timed out waiting for next-frame status.");
    }
    return next_statuses_[count];
}

int CallbackState::wait_for_previous_status_after(std::size_t count, std::chrono::milliseconds timeout) {
    std::unique_lock<std::mutex> lock(mutex_);
    if (!condition_.wait_for(lock, timeout, [&] { return previous_statuses_.size() > count; })) {
        throw std::runtime_error("Timed out waiting for previous-frame status.");
    }
    return previous_statuses_[count];
}

bool CallbackState::wait_for_state(libvlc_state_t state, std::chrono::milliseconds timeout) {
    std::unique_lock<std::mutex> lock(mutex_);
    return condition_.wait_for(lock, timeout, [&] { return state_ == state; });
}

std::uint64_t CallbackState::display_count() const { std::lock_guard<std::mutex> lock(mutex_); return display_sequence_; }
std::size_t CallbackState::next_status_count() const { std::lock_guard<std::mutex> lock(mutex_); return next_statuses_.size(); }
std::size_t CallbackState::previous_status_count() const { std::lock_guard<std::mutex> lock(mutex_); return previous_statuses_.size(); }
std::size_t CallbackState::seek_completion_count() const { std::lock_guard<std::mutex> lock(mutex_); return seek_completions_; }

bool CallbackState::wait_for_seek_completion_after(std::size_t count, std::chrono::milliseconds timeout) {
    std::unique_lock<std::mutex> lock(mutex_);
    return condition_.wait_for(lock, timeout, [&] { return seek_completions_ > count; });
}
