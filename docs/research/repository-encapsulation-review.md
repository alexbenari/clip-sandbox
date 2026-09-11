# Repository encapsulation review

Date: 2026-09-09. Static review of the current working tree, including accepted shell changes. Implementation code was not changed by this review.

Implementation follow-up (2026-09-10): the six actionable findings have been corrected; C1 remains an explicitly retained desktop-path tradeoff. See [correction verification and scope](encapsulation-fixes-verification.md). The analysis below records the pre-correction state.

## Conclusion

Encapsulation is not consistent across the repository. The shell correction removed the identified child-selector dependencies, but the older grid/fullscreen boundary has active implementation sharing. Several classes expose mutable state or mutable object references that let callers bypass invariants. Explicit classes and private backing fields alone do not establish encapsulation.

There are six actionable findings below and one lower-priority contract-design concern. P1 means fix first because an active path can mix clip identity and displayed content. P2 means a demonstrated boundary/invariant weakness or lifecycle hazard, without claiming a reproduced ordinary-user failure. P3 means structural debt. These priorities are remediation priorities, not counts of observed user incidents.

## Coverage and method

Inventoried declarations and dependencies across all 59 authored runtime TS/CJS files under src/ and electron/, plus relevant index.html structure/styles. Followed high-risk calls in detail: grid/fullscreen, shell/utilities, session/domain mutations, dialogs/menus, filesystem/video-edit contracts and settings. Used caller searches to distinguish exercised cross-component access from public exposure with no observed production misuse. Read applicable architecture axioms, coding-quality.md and the exception register. The appendix gives the exact runtime file inventory; inclusion means structural coverage, not an exhaustive line-by-line correctness audit.

Tests were inspected as evidence of intended contracts. Three isolated in-memory probes ran against the existing compiled modules from the preceding successful build; relevant source implementations were also inspected. No rebuild, full suite, native UI session, disk mutation workflow or long-running playback test was run for this read-only review. The preceding refactor's passing tests are not proof of repository-wide encapsulation.

Excluded from production findings: generated build output, node_modules, illustrative sandboxes, historical plan examples, test fixture access and tooling/configuration internals. These are not claimed to be encapsulated application components. This is a repository-wide runtime boundary review, not a security, performance or exhaustive behavioral audit.

## Findings

### F1 — P1: Fullscreen rewrites grid-owned card content without changing clip identity

**Active production crossing.** [FullscreenSession.swapCardContents](../../src/app/fullscreen-session.ts:203) queries child videos and rewrites dataset names, URLs and durations, video sources and playback properties. [Grid card construction](../../src/ui/clip-collection-grid-controller.ts:298) separately establishes data-clip-id and metadata callbacks capturing a particular Clip. Those identities/callbacks are not exchanged by the fullscreen swap. The app supplies the live grid through [getGrid wiring](../../src/app/app-controller.ts:1249).

**Evidence:** calling the actual swap method on two in-memory cards produced `[{id:A,name:b.mp4,src:file:///b.mp4},{id:B,name:a.mp4,src:file:///a.mp4}]`. This proves the mismatch, not a complete user incident. Grid metadata handling subsequently writes metadata to the captured Clip ([onLoadedMetadata](../../src/ui/clip-collection-grid-controller.ts:970)); source changes can therefore attribute metadata to the wrong identity. Selection and clip lookup also continue to use the unchanged IDs. The final consequence through normal playback/editing has not been reproduced here.

**Correction:** keep media/card identity changes in the grid owner. Fullscreen should request rotation of visible clips through a capability, with the grid moving intact cards or rebinding identity, metadata and media lifecycle coherently. Do not fix this by swapping another arbitrary list of dataset fields.

**Acceptance:** real rotation followed by metadata arrival, selection, fullscreen exit and Zoom must keep clip ID, displayed file and canonical metadata aligned. Include unequal durations/aspect ratios so a mismatch is observable.

### F2 — P2: Fullscreen and grid share mutable presentation state and asynchronous lifetime

**Active sharing; lifecycle consequence inferred.** The [app creates one fullscreenState object](../../src/app/app-controller.ts:202) passed into both owners. The grid reads slots and replaces a shared hidden-card buffer ([hiddenCardBuffer/replaceHiddenCards](../../src/ui/clip-collection-grid-controller.ts:461)); fullscreen manages timers and pending rotation on the same object. More critically, [randomizeOnce](../../src/app/fullscreen-session.ts:232) captures grid cards across waitForEnd and later mutates them without checking whether fullscreen is still active or the grid view changed. stopFsRandomizer clears an interval/pending flag but does not cancel that promise.

This permits a late completion to operate on stale/restored cards. Frequency and visible effect remain unverified; this is not reported as a reproduced playback defect.

**Correction:** grid owns visibility/card buffers; fullscreen owns rotation scheduling. Give asynchronous rotation a cancelable or generation-checked owner capability. Pass values such as target slot count rather than sharing a mixed presentation/timer state bag.

**Acceptance:** exit fullscreen and replace the active view before the awaited ended event; the late event must not change the new/restored view. Test rotation restart and disposal as well.

### F3 — P2: PipelineSession returns a mutable sequence that bypasses dirty tracking

**Latent API weakness, demonstrated in isolation.** [currentClipSequence](../../src/app/pipeline-session.ts:25) returns the owned ClipSequence directly. Its public replaceOrder/removeMany methods can modify membership/order without going through [replaceCurrentOrder/removeFromCurrentSequence](../../src/app/pipeline-session.ts:92), which refresh the cached dirty flag.

**Probe:** start with two clips and dirty=false; reverse the returned sequence using replaceOrder; dirty remains false; explicitly refreshDirtyClipSequenceState then returns true. Current production reorder/removal callers found in this review use the session methods, so this is not a claim of existing unsaved-change loss.

**Correction:** expose a read capability for the active sequence, or make dirty state derived/observable so legal mutations cannot bypass it. Ensure any mutable Pipeline/Clip references returned by the session have deliberate ownership rules; do not indiscriminately copy canonical Clip identities.

**Acceptance:** no consumer of the session's public read API can change sequence order/membership without dirty tracking reflecting it.

### F4 — P2: Public controller fields expose invariant-bearing state and internal handles

**Latent exposure; no external production writes found for the examples below.** The grid exposes [selectedClipIds, activeCacheKey and gridViewCache](../../src/ui/clip-collection-grid-controller.ts:382). A caller can clear selection without applying selection classes/notifying listeners, or mutate a cache without disposal. Other examples: [ContextMenuController.openState](../../src/ui/context-menu-controller.ts:116), [GridVideoMetadataTracker.statesByClipId/sequenceToken](../../src/ui/grid-video-metadata-tracker.ts:20), [ZoomOverlayController.overlayEl/videoEl](../../src/ui/zoom-overlay-controller.ts:34), and dialog handler/error fields. getCardByClipId/getGridElement/getVideoElement also return live DOM handles; the grid getter is actively used by F1/F6, while no production use of Zoom's video getter was found.

Private backing fields are appropriate where only the owner uses the field. Exposing callbacks/dependencies as mutable public fields also allows replacing behavior after initialization, although this review found no production caller doing so. Adapter examples are listed in the supporting inventory.

**Correction:** make implementation state private; retain narrow behavioral methods and explicit read-only snapshots. Remove unused raw-handle getters after checking tests/callers. Keep intentionally exported outer mounting surfaces distinct from descendants or mutable caches.

**Acceptance:** type-level consumer checks reject direct state writes; public methods still produce selection, focus, disposal and notification outcomes. Tests should stop depending on private mutation except narrowly justified internal-owner tests.

### F5 — P2: Clip retains and returns a mutable File extension while caching related values

**Latent aliasing weakness, demonstrated in isolation.** The [constructor stores the supplied file reference](../../src/domain/clip.ts:33), [file returns it](../../src/domain/clip.ts:49), and mediaSource is cached separately. ClipFile extends File with mutable path/mediaSource/relativePath fields. Pipeline also retains file references keyed by name; ordinary native File.name is readonly, so name mutation is not alleged for native File callers.

**Probe with a real File:** assign mediaSource=file:///a.mp4, construct Clip, then change clip.file.mediaSource to file:///b.mp4. The returned file says B while clip.mediaSource still says A. No production caller performing that mutation was found. Input aliasing exists even if the getter is removed.

**Correction:** separate immutable source metadata from the Blob/File capability, or copy/normalize extension metadata at construction and expose readonly data. Keep legitimate replaceFile/metadata updates as owner operations.

**Acceptance:** mutating an external input object or returned metadata cannot change part of a Clip's source identity while leaving another part stale.

### F6 — P3: Grid layout crosses out through the composition root into a DOM adapter

**Active structural coupling, not a demonstrated failure.** [The app's applyGridLayout closure](../../src/app/app-controller.ts:408) obtains the grid's live element and hands it to [DomRendererAdapter](../../src/adapters/browser/dom-renderer-adapter.ts:2), which assumes every child is a grid card and sets child heights. The grid initiates this callback, so it is intentional delegated rendering, not an unrelated caller secretly searching the document. However, implementation ownership is distributed across three modules; adding grid decorations or changing card layout requires keeping the adapter's assumptions aligned. Legacy [toolbar measurement](../../src/ui/clip-collection-grid-controller.ts:615) is another layout seam; measuring an explicitly supplied outer surface is less severe than inspecting descendants.

**Correction:** put DOM layout application behind the grid owner, optionally using an internal stateless helper. Keep pure layout calculation injectable; the app need not obtain private grid children. Preserve standalone layout support through an explicit allocation contract.

**Acceptance:** normal/fullscreen layout, viewport resize and animated panel allocation pass without app orchestration obtaining grid DOM for layout.

### C1 — P3 design concern: Filesystem representation is embedded in business edit contracts

[DesktopFolderSession](../../src/adapters/electron/electron-file-system-service.ts:48) explicitly exports folderPath. The [app parses it](../../src/app/app-controller.ts:113), [ZoomVideoEditWorkflow](../../src/app/zoom-video-edit-workflow.ts:51) forwards its structural shape, and [ClipEditor](../../src/business-logic/clip-editor.ts:66) reads clip.file.path and folderSession.folderPath to build the runtime request. These are public contract fields, not private access. Their spread does couple business code to the filesystem representation and decorated File objects.

Recommendation: when changing edit/storage boundaries, consider typed source/destination capabilities or a normalized edit input that leaves platform resolution with the adapter. This is a design tradeoff for a Windows-first local app, not evidence of permission bypass or a requirement to build a generic storage framework. Root explicitly rejected the stronger bypass interpretation in the delegated evidence.

## Boundaries that looked sound in the reviewed paths

- CollectionScreen coordinates focus via child capabilities. Settings and Keyboard query markup they own. Panel sizing and Close-button behavior remain owner-local after the recent correction.
- IAppScreen roots/commands and utility panels/triggers are deliberately exported outer surfaces. Mounting/hiding them via the shell/coordinator is part of their contract; it does not justify descendant inspection.
- GridContextMenuControl and ZoomEditMenuControl pass semantic item descriptions through narrow open/close capabilities. The context menu owns rendering and keyboard navigation.
- Collection ordered names and ClipSequence ordered IDs are copied; private maps are not directly exposed. Collection changes return new Collection values. Canonical mutable Clip sharing has a legitimate purpose, but its file aliasing needs F5.
- Settings production parsing freezes its flat value object. Electron transport remains behind adapters/preload; no direct renderer imports of main-process helpers were found.
- Composition-root lookup/injection of static elements, pure layout functions, generic editable/dialog checks, and data-oriented domain calls are not automatically encapsulation violations.

## Suggested correction order

1. F1/F2 together: establish grid-owned fullscreen rotation and a cancelable lifecycle, then exercise real clips.
2. F3/F5: close demonstrated mutable-reference escape paths without duplicating canonical identities.
3. F4: tighten private fields/getters in bounded component groups; do not perform a cosmetic blanket private conversion without checking callers and tests.
4. F6 and C1: simplify layout ownership; revisit storage representation when its benefit justifies the API change.

The UI coding-guideline discussion remains separate. No implementation changes or new general policy were made by this review.

## Evidence and limitations

The isolated probes establish reachable API behavior, not frequency or severity through normal use. F1's card identity mismatch is demonstrated; metadata misattribution and late-event behavior still need workflow tests. F3/F5 demonstrate possible invariant bypass, with no matching production mutation found. Public-field exposure is not reported as evidence that somebody already misuses every field. Static searches cannot prove absence of all dynamic access or future callers.

One Luna/medium delegation inventoried 15 adapter/Electron files and six direct caller/domain files. Root checked the cited crossings, qualified two overstatements and retained final judgments. Outcome: successful bounded inventory, small rework, focused verification; cost savings unmeasured. [Ledger](encapsulation-review-delegation-log.md), [supporting evidence](encapsulation-adapter-evidence.md).

Adjacent issues observed during review: swallowed playback promises in FullscreenSession; ZoomVideoEditWorkflow calls onStarted before its try block and clears running state without a finally around consumer callbacks, so throwing callbacks can leave it running. These are separate correctness/lifecycle concerns, not additional encapsulation findings.

## Runtime inventory (structural coverage)

- `electron/app-settings-store.cjs`
- `electron/ffmpeg-resolver.cjs`
- `electron/folder-entry.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `electron/video-edit-runtime.cjs`
- `src/adapters/browser/audio-feedback-adapter.ts`
- `src/adapters/browser/browser-file-system-service.ts`
- `src/adapters/browser/clock-adapter.ts`
- `src/adapters/browser/dom-renderer-adapter.ts`
- `src/adapters/browser/file-system-adapter.ts`
- `src/adapters/browser/fullscreen-adapter.ts`
- `src/adapters/electron/electron-app-settings-service.ts`
- `src/adapters/electron/electron-file-system-service.ts`
- `src/adapters/electron/electron-video-edit-service.ts`
- `src/app/app-controller.ts`
- `src/app/app-diagnostics.ts`
- `src/app/app-keydown-handler.ts`
- `src/app/app-session-state.ts`
- `src/app/app-settings-service.ts`
- `src/app/app-settings.ts`
- `src/app/app-text.ts`
- `src/app/event-binding.ts`
- `src/app/fullscreen-session.ts`
- `src/app/pipeline-session.ts`
- `src/app/zoom-video-edit-workflow.ts`
- `src/business-logic/clip-editor.ts`
- `src/business-logic/PipelineFactory.ts`
- `src/business-logic/video-edit-catalog.ts`
- `src/domain/clip-sequence.ts`
- `src/domain/clip.ts`
- `src/domain/collection-description-validator.ts`
- `src/domain/collection.ts`
- `src/domain/pipeline.ts`
- `src/ui/activity-indicator-control.ts`
- `src/ui/add-to-collection-dialog-controller.ts`
- `src/ui/app-screen.ts`
- `src/ui/application-shell-controller.ts`
- `src/ui/clip-collection-grid-controller.ts`
- `src/ui/collection-conflict-controller.ts`
- `src/ui/collection-screen.ts`
- `src/ui/collection-selector-control.ts`
- `src/ui/context-menu-controller.ts`
- `src/ui/delete-from-disk-dialog-controller.ts`
- `src/ui/display-layout-rules.ts`
- `src/ui/foldable-panel-controller.ts`
- `src/ui/global-utility-coordinator.ts`
- `src/ui/grid-context-menu-control.ts`
- `src/ui/grid-video-metadata-tracker.ts`
- `src/ui/keyboard-map-control.ts`
- `src/ui/load-status-control.ts`
- `src/ui/main-toolbar-control.ts`
- `src/ui/order-menu-controller.ts`
- `src/ui/save-as-new-dialog-controller.ts`
- `src/ui/settings-screen.ts`
- `src/ui/status-bar-control.ts`
- `src/ui/unsaved-changes-dialog-controller.ts`
- `src/ui/zoom-edit-menu-control.ts`
- `src/ui/zoom-overlay-controller.ts`
