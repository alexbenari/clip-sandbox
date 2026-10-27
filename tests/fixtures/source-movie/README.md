# Source movie fixtures

Small MP4 files for the clip source-info reader tests. They were made once, by re-encoding the first second of `tests/e2e/fixtures/video-edit/clips/source.mp4` with the FFmpeg staged under `native-build/frame-review/runtime/ffmpeg/`:

    ffmpeg -i source.mp4 -t 1 -i <metadata.txt> -map 0:v -map_metadata 1 -c:v libx264 -pix_fmt yuv420p -preset ultrafast -movflags <flags> <name>.mp4

`<metadata.txt>` is an FFmpeg metadata file (`;FFMETADATA1`) holding the entries below; `untagged.mp4` has no metadata input.

| File | Metadata entries | `-movflags` |
|---|---|---|
| `tagged.mp4` | `clip-sandbox.prov.v1` = the `value` in `expected-tag.json` | `+faststart+use_metadata_tags` |
| `tagged-moov-at-end.mp4` | same as `tagged.mp4` | `+use_metadata_tags` (metadata after the media data) |
| `untagged.mp4` | none | `+faststart` |
| `other-key.mp4` | `example.other` = `1` | `+faststart+use_metadata_tags` |
| `tagged-after-other-key.mp4` | `example.other` = `1`, then the same tag as `tagged.mp4` | `+faststart+use_metadata_tags` |
| `oversized.mp4` | `clip-sandbox.prov.v1` = 70 KiB of `x` | `+faststart+use_metadata_tags` |
| `invalid-record.mp4` | `clip-sandbox.prov.v1` = `{"provenanceVersion":2}` | `+faststart+use_metadata_tags` |

Tests derive any other shape, such as a truncated file or one without a `udta` box, from these files in their own temporary folder.
