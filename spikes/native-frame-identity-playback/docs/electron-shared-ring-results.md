# Electron Shared-Ring Experiment

## Result

**BLOCKED BY THE ELECTRON 37 MAIN/RENDERER BOUNDARY**

The full-resolution binary bridge passed the 100 ms p95 delivery-and-draw target for 720p and
1080p, but measured 146.34 ms p95 for the 3840x1606 representative. A bounded shared-memory
experiment therefore attempted to remove the largest measured component: the roughly 90-103 ms
main-to-renderer structured-clone transfer for each 25,067,520-byte 4K RGBA frame.

The experiment implemented this intended ownership model:

1. two fixed 64 MiB slots;
2. atomic `free -> writing -> ready -> reading -> free` state transitions;
3. frame pixels in shared storage and metadata only over Electron IPC;
4. one acknowledged playback frame in flight, with LibVLC retaining only the newest pending frame;
5. generation counters and the existing latest-wins scrub mailbox.

Electron 37.10.3 prevented the ring from crossing the trust boundary:

- `SharedArrayBuffer` is not exposed in the sandboxed preload used by this host;
- allocating the buffer in Electron main and returning it through `ipcMain.handle` fails with
  `An object could not be cloned`;
- Electron's documented IPC transfer list accepts message ports, not arbitrary array buffers.

The failure is captured in `artifacts/bridge/shared-ring-media-017.json`. No shared-ring latency is
reported because the renderer never received the shared storage. The ring remains an isolated
experimental mode; normal binary transport is unaffected.

## Decision

Do not weaken context isolation or enable Node integration merely to make the experiment pass.
Do not build a native sibling window inside Milestone 4.

The next architecture review should compare these bounded options:

1. deliver preview frames at actual viewport resolution, which avoids transferring unused 4K
   pixels and may let the existing binary bridge pass;
2. use a narrowly scoped native addon or a newer Electron shared-texture facility, accepting the
   additional platform-specific build and security surface;
3. enter the signed native-window decision gate only if callback or texture rendering still fails.

Current Electron documentation confirms that IPC uses structured clone and that transfer lists are
for message ports. Newer Electron documentation also describes an experimental shared-texture API,
but Electron 37.10.3 does not expose that API in its installed type definitions. See the official
[Electron IPC guide](https://www.electronjs.org/docs/latest/tutorial/ipc),
[`ipcRenderer.postMessage`](https://www.electronjs.org/docs/latest/api/ipc-renderer), and
[shared-texture API](https://www.electronjs.org/docs/latest/api/shared-texture).

Electron 37.10.3 matches the production checkout's current major/patch line, but `npm audit` still
reports two high-severity dependency findings for that line. It is suitable for reproducing this
isolated spike, not a recommendation to ship that runtime unchanged. Production adoption must
include an Electron upgrade and regression rerun.

## M4b Follow-Up

The first bounded option is now implemented and measured. Native services fit every oversized
source to the renderer viewport without upscaling, and the host waits 100 ms for scrub input to
settle before starting BestSource work. On the 4K representative, the preview payload fell 9.24
times, bridge p95 fell from 133.29 ms to 28.65 ms, and visible callback playback rose from 6.33 to
14.77 fps. The viewport-sized binary path therefore passes; shared memory and a native sibling
window are not required for this preview workload. See [M4b Results](electron-bridge-m4b-results.md).
