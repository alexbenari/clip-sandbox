import argparse
import json
from pathlib import Path

import vapoursynth as vs


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe an upstream BestSource VapourSynth plugin.")
    parser.add_argument("--plugin", required=True)
    parser.add_argument("--movie", required=True)
    parser.add_argument("--cache", required=True)
    args = parser.parse_args()

    plugin = str(Path(args.plugin).resolve())
    movie = str(Path(args.movie).resolve())
    cache = str(Path(args.cache).resolve())

    print(json.dumps({"type": "phase", "name": "plugin-loading", "plugin": plugin}), flush=True)
    vs.core.std.LoadPlugin(path=plugin)
    vs.core.bs.SetDebugOutput(enable=True)
    vs.core.bs.SetFFmpegLogLevel(level=32)
    print(json.dumps({"type": "phase", "name": "source-opening"}), flush=True)
    clip = vs.core.bs.VideoSource(
        source=movie,
        cachemode=4,
        cachepath=cache,
        maxdecoders=1,
        showprogress=True,
    )
    print(json.dumps({"type": "phase", "name": "source-opened", "frames": clip.num_frames}), flush=True)
    frame = clip.get_frame(0)
    print(json.dumps({
        "type": "complete",
        "width": frame.width,
        "height": frame.height,
        "format": frame.format.name,
    }), flush=True)


if __name__ == "__main__":
    main()
