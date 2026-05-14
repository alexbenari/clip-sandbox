# Code Review

This review was performed as an isolated pass using the `solid` skill as process guidance plus general engineering judgment.

## Validation

- `npm run typecheck` passed.
- `npm run unit` passed.
- `npm run e2e` passed.
- The stale-collection delete issue below was additionally confirmed with a direct runtime repro against the compiled build.

## Findings

### High: Failed saves are treated as success in follow-on flows

Files:
- [app-controller.ts](/C:/dev/clip-sandbox/src/app/app-controller.ts:710)
- [app-controller.ts](/C:/dev/clip-sandbox/src/app/app-controller.ts:775)
- [app-controller.ts](/C:/dev/clip-sandbox/src/app/app-controller.ts:833)

Why this matters:
- `continuePendingAction()` and `confirmDeletePreflightSave()` only special-case the `{ deferred: true }` result from `saveActiveCollection()`.
- A real save failure still falls through as if the save succeeded.
- That means the app can clear a pending switch/browse action or continue into delete-from-disk after a filesystem error, which risks dropping unsaved edits.

Recommendation:
- Treat only `{ ok: true }` as a successful save.
- Keep the pending action or pending delete flow open on save failure.
- Add failure-path tests around save-before-switch and save-before-delete flows.

### High: Delete-from-disk reloads a stale collection object

Files:
- [app-controller.ts](/C:/dev/clip-sandbox/src/app/app-controller.ts:473)
- [pipeline.ts](/C:/dev/clip-sandbox/src/domain/pipeline.ts:245)

Why this matters:
- `Pipeline.removeVideos()` replaces pruned collections inside the pipeline.
- `confirmDeleteFromDisk()` then reloads using `activeCollection()`, which can still point at the old pre-prune collection instance.
- The UI can therefore re-materialize stale collection state and show a false missing-entry conflict for clips that were already removed from the collection as part of the delete cleanup.

Recommendation:
- After pruning videos, reload from the updated collection instance now stored in the pipeline.
- Add a regression test that deletes a clip while viewing a saved collection that also references that clip.

### Medium: Electron folder loading is all-or-nothing on unreadable `.txt` files

Files:
- [main.cjs](/C:/dev/clip-sandbox/electron/main.cjs:22)

Why this matters:
- `readFolderEntries()` eagerly reads every top-level text file.
- A single unreadable or locked collection file rejects the whole folder load.
- The browser path is more resilient and logs per-file read errors instead of aborting the entire load, so behavior differs across runtimes.

Recommendation:
- Isolate `.txt` read failures per file in the Electron path.
- Continue loading the folder when possible and surface diagnostics for the specific unreadable collection file.
- Add an Electron-facing test for partial load behavior when one collection file cannot be read.

## Recommended next steps

1. Fix the save failure handling so pending actions do not continue unless the save actually succeeds.
2. Reload delete-from-disk flows from the updated collection instance stored in `Pipeline`.
3. Make Electron collection-file reads resilient on a per-file basis and add failure-path coverage.
