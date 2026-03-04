# Feature Spec: Share View via Self-Contained Page

## 1. Summary

Add a "Share View" feature that lets a user:

1. Open a local folder of clips.
2. Arrange clips in the desired order (existing behavior).
3. Generate a share link for that exact arranged view.

The shared view must not depend on the sender's local file paths. For MVP, clip bytes are embedded into a single self-contained HTML page.

## 2. Problem

Current state:

- The app can load local clips and reorder them.
- The result cannot be shared as a stable remote view.

Need:

- A way to publish the arranged view so recipients can open it from a URL and see the same clip order and playback behavior.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Preserve arrangement order exactly.
2. Preserve playback style: autoplay, muted, loop, inline.
3. Produce one portable artifact (`share page`) that contains all required media bytes.
4. Make publishing backend-agnostic via a hosting adapter.
5. Provide predictable size estimation before export.

### 3.2 Non-Goals (MVP)

1. No transcoding/compression pipeline.
2. No authentication/permissions model for private shares.
3. No collaborative editing of a shared page.
4. No delta updates to an existing share artifact.

## 4. User Stories

1. As a creator, I can click `Share View` and publish my current order.
2. As a creator, I can see estimated output size before publishing.
3. As a recipient, I can open a URL and immediately view the clips in the intended order.
4. As a creator, if the share is too large, I get a clear reason and next action.

## 5. UX Specification

### 5.1 Entry Point

Add a new toolbar button in `index.html`:

- Label: `Share View`
- Placement: near `Save Order`

### 5.2 Share Modal/Panel

When clicked, show a modal with:

1. Clip count
2. Raw clip bytes
3. Estimated embedded bytes (`base64`)
4. Estimated total HTML size
5. Size cap result (pass/fail)
6. Action buttons:
   - `Generate + Upload`
   - `Download HTML` (fallback/manual hosting)
   - `Cancel`

### 5.3 Success State

After upload success:

1. Show final URL.
2. Provide `Copy Link` button.
3. Show optional artifact ID/hash.

### 5.4 Failure States

1. Size exceeds configured limit.
2. Missing/unreadable clip data.
3. Upload failure/time-out.
4. Browser memory/decode error.

Each failure must include plain-language cause and one next action.

## 6. Functional Requirements

### 6.1 Input Scope

The exported share includes:

1. Current grid order from DOM order.
2. Only clips currently present in the view.
3. Current clip display names.

### 6.2 Playback Behavior in Shared Page

Each clip tile must:

1. Autoplay
2. Be muted
3. Loop indefinitely
4. Use `playsinline`

### 6.3 Deterministic Ordering

Order in shared page must match `getOrderArray()` order at export time.

### 6.4 Packaging Strategy

Use a single payload buffer plus manifest:

1. Concatenate all selected clip bytes into one binary payload.
2. Base64-encode payload.
3. Chunk base64 into fixed-width lines for HTML embedding.
4. Embed manifest JSON and payload into separate script tags.

### 6.5 Host-Agnostic Publish

Publishing is abstracted. Export/generation does not depend on one provider.

## 7. Data Format Specification

### 7.1 Embedded Page Structure

The generated page must contain:

1. `<script id="manifest" type="application/json">...</script>`
2. `<script id="payload" type="application/octet-stream">...</script>`
3. Bootstrap JS that decodes payload once and materializes video blobs by manifest offsets.

### 7.2 Manifest Schema (v1)

```json
{
  "version": 1,
  "createdAt": "2026-03-04T00:00:00.000Z",
  "app": {
    "name": "clip-sandbox",
    "version": "1.0.0"
  },
  "view": {
    "mode": "grid",
    "order": ["clip-1", "clip-2", "clip-3"]
  },
  "clips": [
    {
      "id": "clip-1",
      "name": "attic-bedroom-static_1.mp4",
      "mime": "video/mp4",
      "offset": 0,
      "length": 138239,
      "durationSec": 3.2,
      "width": 1280,
      "height": 720,
      "sha256": "optional"
    }
  ],
  "totals": {
    "clipCount": 3,
    "rawBytes": 1169455,
    "base64Chars": 1559276
  }
}
```

### 7.3 Required Manifest Fields

1. `version`
2. `clips[].id`
3. `clips[].name`
4. `clips[].mime`
5. `clips[].offset`
6. `clips[].length`
7. `view.order`

### 7.4 Offset Rules

1. `offset` is byte index in decoded payload.
2. `length` is byte count.
3. Payload slice for clip `i` is `[offset, offset + length)`.
4. Clip entries must not overlap.
5. Final clip end must equal payload byte length.

### 7.5 Base64 Rules

1. Use standard base64 alphabet.
2. Remove whitespace before decode.
3. Chunk size default: `8192` chars.
4. Whitespace/newlines in payload script are allowed.

## 8. Runtime Decode and Render

### 8.1 Bootstrap Steps

1. Parse manifest JSON.
2. Read payload text from script tag.
3. Strip whitespace.
4. Decode base64 to `Uint8Array`.
5. For each clip in `view.order`:
   - slice payload bytes
   - create `Blob` with `mime`
   - create object URL
   - create `<video>` tile and set playback flags

### 8.2 Memory Rules

1. Decode payload once.
2. Keep one payload byte array in memory.
3. Revoke object URLs on `beforeunload`.
4. If lazy loading is added later, keep this format unchanged.

### 8.3 Browser Requirements

1. Chrome/Edge current stable are primary targets.
2. `Blob`, `URL.createObjectURL`, and `atob` are required.

## 9. Size and Performance Requirements

### 9.1 Size Calculation

Given total raw bytes `N`:

1. Embedded payload chars = `4 * ceil(N / 3)`
2. Embedded payload bytes ~= payload chars (ASCII)
3. Total HTML ~= payload chars + manifest bytes + page template bytes

### 9.2 MVP Limits

Configurable defaults:

1. `MAX_RAW_BYTES = 75 MiB`
2. `MAX_HTML_BYTES_ESTIMATE = 110 MiB`
3. `WARN_HTML_BYTES_ESTIMATE = 80 MiB`

Reasoning:

- Base64 adds ~33%.
- Large single-file HTML can cause slow load and memory pressure.

### 9.3 Expected Behavior

1. Show estimate before generation.
2. Hard-block export when above max.
3. Warn (but allow) near max.

## 10. Security and Privacy

1. Shared artifact contains raw clip bytes in recoverable form.
2. Treat share URL as public unless private hosting is enforced externally.
3. Escape all user-controlled text inserted into HTML (`name`, titles).
4. Do not execute manifest content as code.
5. Avoid inline remote dependencies in generated page.

## 11. Hosting and Link Architecture

### 11.1 Hosting Adapter Interface

Define a provider abstraction:

```ts
type UploadResult = {
  url: string;
  artifactId?: string;
};

type HostingAdapter = {
  name: string;
  upload(htmlBytes: Uint8Array, meta: { suggestedName: string; rawBytes: number }): Promise<UploadResult>;
};
```

### 11.2 MVP Providers

1. `download-only` (always available): download generated HTML; user hosts manually.
2. `http-upload` (optional): upload to configured endpoint.

### 11.3 Link Format

Returned URL is provider-defined. App only validates it as absolute `http(s)` URL before showing copy action.

## 12. Proposed Code Structure

Proposed additions (paths relative to repo root):

1. `share/estimate-share-size.js`
2. `share/build-share-package.js`
3. `share/render-share-html.js`
4. `share/hosting/adapter.js`
5. `share/hosting/download-only.js`
6. `share/hosting/http-upload.js`
7. `share/share-controller.js`

Integration points:

1. `index.html`: add `Share View` button and modal container.
2. `app.js`: wire share controller with current grid state and clip data access.

## 13. Algorithm Details

### 13.1 Export Pipeline

1. Collect ordered clip descriptors from grid.
2. Resolve raw bytes for each clip.
3. Build concatenated payload and manifest offsets.
4. Estimate/validate size.
5. Render HTML template with embedded manifest + chunked payload.
6. Upload via selected adapter or download.

### 13.2 Byte Source Strategy

At load time, store clip source for later export:

1. Preferred: keep original `File` reference on card dataset map (in-memory map keyed by clip id).
2. Fallback: fetch existing object URL and read blob bytes.

Preferred option avoids re-fetch indirection and preserves source fidelity.

## 14. Error Handling Matrix

1. `ERR_NO_CLIPS`: no clips loaded.
2. `ERR_TOO_LARGE`: estimate exceeds max.
3. `ERR_READ_CLIP`: unable to read bytes from one or more clips.
4. `ERR_BUILD_HTML`: generation failure.
5. `ERR_UPLOAD_FAILED`: provider upload failed.
6. `ERR_COPY_LINK`: clipboard API unavailable/failed.

Each error includes:

1. User-facing message
2. Technical detail for logs
3. Suggested action

## 15. Testing Plan

### 15.1 Unit Tests

1. Size estimator correctness (`N -> 4*ceil(N/3)`).
2. Manifest offsets are contiguous and exact.
3. HTML renderer inserts manifest/payload script tags.
4. Payload chunking and dechunking round-trip.
5. Input escaping for clip names.

### 15.2 E2E Tests (Playwright)

1. Load fixture clips, reorder, export with `download-only`, open generated HTML, verify order.
2. Verify videos have `autoplay`, `muted`, `loop`, `playsinline`.
3. Verify size-limit block path.
4. Verify error message for forced upload failure.

### 15.3 Manual QA

1. Chrome + Edge on Windows.
2. Small share (<10 MiB), medium (~50 MiB), near-limit (~100 MiB HTML).
3. Open shared page in normal window and fullscreen.

## 16. Observability

Add structured logs for:

1. `share_estimate_computed`
2. `share_generation_started`
3. `share_generation_succeeded`
4. `share_generation_failed`
5. `share_upload_started`
6. `share_upload_succeeded`
7. `share_upload_failed`

Each event should include clip count and byte metrics.

## 17. Rollout Plan

### Phase 1 (MVP)

1. Download-only self-contained HTML export.
2. Full embed via manifest + payload.
3. Size checks and basic modal UX.

### Phase 2

1. Add pluggable HTTP upload adapter.
2. Return share URL and copy link.

### Phase 3

1. Optional lazy blob materialization for very large shares.
2. Optional transcode/compression pre-export.

## 18. Acceptance Criteria

1. User can generate a self-contained HTML from current ordered clips.
2. Generated page opens offline and plays all clips in correct order.
3. Playback is autoplay+muted+loop+inline.
4. Size estimate is shown before generation.
5. Generation is blocked above configured max with clear error.
6. Code path supports both download-only and upload adapters.

## 19. Open Questions

1. Final default size limits for production usage.
2. Which hosting provider is first-class for link generation.
3. Share retention policy (indefinite vs. expiring links).
4. Whether non-MP4 formats require normalization in later phases.

## 20. Appendix: Current Prototype Confirmation

A working prototype of the embedded payload model exists at:

- `demo/demo.html`

It demonstrates:

1. `manifest` + `application/octet-stream` payload embedding.
2. One-time decode to byte array.
3. Slice-by-offset reconstruction to blob URLs.
4. Side-by-side autoplay looping video tiles.
