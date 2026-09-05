#pragma once

#include <bestsource/videosource.h>

#include <cstddef>
#include <cstdint>
#include <list>
#include <memory>
#include <string>
#include <unordered_map>

struct PreparedFrameAccess {
    std::int64_t frame_index;
    const BestVideoFrame* frame;
    bool cache_hit;
    std::string access_path;
};

class PreparedVideoSession {
public:
    explicit PreparedVideoSession(BestVideoSource& source,
                                  std::size_t max_delivered_cache_bytes = 256ull * 1024 * 1024);

    PreparedFrameAccess GetExact(std::int64_t frame_index);
    PreparedFrameAccess StepAdjacent(int direction);
    [[nodiscard]] std::int64_t CurrentFrame() const;
    [[nodiscard]] std::size_t CachedFrameCount() const;
    [[nodiscard]] std::size_t CachedBytes() const;

private:
    struct CachedFrame {
        std::int64_t frame_index;
        std::unique_ptr<BestVideoFrame> frame;
        std::size_t estimated_bytes;
    };

    using Cache = std::list<CachedFrame>;
    using CacheIterator = Cache::iterator;

    PreparedFrameAccess FindCached(std::int64_t frame_index, const std::string& access_path);
    PreparedFrameAccess Store(std::int64_t frame_index, std::unique_ptr<BestVideoFrame> frame,
                              const std::string& access_path);
    void EvictToLimit();

    BestVideoSource& source_;
    std::size_t max_cache_bytes_;
    std::size_t cached_bytes_ = 0;
    std::int64_t current_frame_ = -1;
    Cache cache_;
    std::unordered_map<std::int64_t, CacheIterator> cache_by_frame_;
};
