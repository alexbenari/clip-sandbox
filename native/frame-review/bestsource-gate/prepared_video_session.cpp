#include "prepared_video_session.hpp"

extern "C" {
#include <libavutil/frame.h>
#include <libavutil/imgutils.h>
}

#include <algorithm>
#include <stdexcept>

namespace {

std::size_t estimated_frame_bytes(const BestVideoFrame& frame) {
    const AVFrame* value = frame.GetAVFrame();
    if (!value) return 0;
    const int size = av_image_get_buffer_size(static_cast<AVPixelFormat>(value->format),
                                              value->width, value->height, 1);
    return size > 0 ? static_cast<std::size_t>(size) : 0;
}

}  // namespace

PreparedVideoSession::PreparedVideoSession(BestVideoSource& source,
                                           std::size_t max_delivered_cache_bytes)
    : source_(source), max_cache_bytes_(max_delivered_cache_bytes) {
    if (max_cache_bytes_ == 0) throw std::invalid_argument("delivered frame cache must be non-zero");
}

PreparedFrameAccess PreparedVideoSession::GetExact(std::int64_t frame_index) {
    const auto frame_count = source_.GetVideoProperties().NumFrames;
    if (frame_index < 0 || frame_index >= frame_count) {
        throw std::out_of_range("exact frame is outside the prepared source");
    }
    auto cached = FindCached(frame_index, "exact-cache");
    if (cached.frame) {
        current_frame_ = frame_index;
        return cached;
    }
    std::unique_ptr<BestVideoFrame> frame(source_.GetFrame(frame_index));
    if (!frame) throw std::runtime_error("BestSource returned no exact frame");
    current_frame_ = frame_index;
    return Store(frame_index, std::move(frame), "random-exact");
}

PreparedFrameAccess PreparedVideoSession::StepAdjacent(int direction) {
    if (direction != -1 && direction != 1) throw std::invalid_argument("adjacent direction must be -1 or 1");
    if (current_frame_ < 0) throw std::logic_error("adjacent stepping requires an exact current frame");
    const auto target = current_frame_ + direction;
    const auto frame_count = source_.GetVideoProperties().NumFrames;
    if (target < 0 || target >= frame_count) throw std::out_of_range("adjacent step reached the source boundary");

    auto cached = FindCached(target, direction > 0 ? "forward-cache" : "reverse-cache");
    if (cached.frame) {
        current_frame_ = target;
        return cached;
    }

    // A delivered-cache hit can leave every decoder far from the displayed frame.
    // BestSource's normal path reuses nearby decoders without forcing a long linear walk.
    std::unique_ptr<BestVideoFrame> frame(source_.GetFrame(target));
    if (!frame) throw std::runtime_error("BestSource returned no adjacent frame");
    current_frame_ = target;
    return Store(target, std::move(frame), direction > 0 ? "forward-adaptive" : "reverse-adaptive");
}

std::int64_t PreparedVideoSession::CurrentFrame() const {
    return current_frame_;
}

std::size_t PreparedVideoSession::CachedFrameCount() const {
    return cache_.size();
}

std::size_t PreparedVideoSession::CachedBytes() const {
    return cached_bytes_;
}

PreparedFrameAccess PreparedVideoSession::FindCached(std::int64_t frame_index,
                                                     const std::string& access_path) {
    const auto found = cache_by_frame_.find(frame_index);
    if (found == cache_by_frame_.end()) return {frame_index, nullptr, false, access_path};
    cache_.splice(cache_.begin(), cache_, found->second);
    found->second = cache_.begin();
    return {frame_index, cache_.front().frame.get(), true, access_path};
}

PreparedFrameAccess PreparedVideoSession::Store(std::int64_t frame_index,
                                                std::unique_ptr<BestVideoFrame> frame,
                                                const std::string& access_path) {
    const auto bytes = estimated_frame_bytes(*frame);
    cache_.push_front({frame_index, std::move(frame), bytes});
    cache_by_frame_[frame_index] = cache_.begin();
    cached_bytes_ += bytes;
    EvictToLimit();
    return {frame_index, cache_.front().frame.get(), false, access_path};
}

void PreparedVideoSession::EvictToLimit() {
    while (cached_bytes_ > max_cache_bytes_ && cache_.size() > 1) {
        auto oldest = std::prev(cache_.end());
        cached_bytes_ -= oldest->estimated_bytes;
        cache_by_frame_.erase(oldest->frame_index);
        cache_.erase(oldest);
    }
}
