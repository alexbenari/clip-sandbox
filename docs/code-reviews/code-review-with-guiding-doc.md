# Code Review

Reviewed against `C:\dev\clip-sandbox\.agents\coding-quality.md` as the primary design and review standard. I used that guidance mainly for responsibility boundaries, layering, naming, misuse-resistant APIs, and test adequacy.

## Validation run

- `npm run unit` passed (`33` files, `120` tests).
- `npm run typecheck` passed.
- `npm run e2e` passed (`6` Electron scenarios).

Those green checks are useful, but they mostly cover happy paths. The findings below are the issues that remain after the automated suites.

## Findings

### P1: Electron IPC write/delete handlers trust renderer-supplied paths and can escape the selected folder

Files:
- `electron/main.cjs:100-121`
- `electron/preload.cjs:3-18`

Why this matters:
- `save-text-file`, `append-text-file`, and `delete-files` all accept a raw `folderPath` plus raw filenames from the renderer and pass them directly to `path.join(...)`.
- There is no normalization/resolution check that the final target still lives inside the selected folder, and no rejection of path separators or `..` traversal segments.
- In Electron, the preload bridge intentionally exposes these operations to renderer code. If the renderer is ever compromised, or if a future feature accidentally passes an unsafe filename, the main process will write, append, or delete arbitrary files the app process can reach.

Recommendation:
- Keep the authoritative folder session in the main process instead of trusting a renderer-provided `folderPath`.
- Resolve and compare absolute paths before every mutation.
- Reject anything except a single top-level filename for collection writes and clip deletes.
- Add negative tests that attempt traversal payloads such as `..\..\foo.txt`.


### P2: `app-controller.ts` is carrying orchestration, persistence, and domain-mutation responsibilities at once

Files:
- `src/app/app-controller.ts:53-1052`
- Especially `src/app/app-controller.ts:322-399`
- `src/app/app-controller.ts:473-559`
- `src/app/app-controller.ts:613-825`

Why this matters:
- The repo architecture map explicitly treats this file as a risky seam, and `coding-quality.md` says the application controller should orchestrate workflows rather than absorb domain behavior and reusable internals.
- In practice this one module is doing bootstrap composition, DOM lookup, workflow branching, persistence, rollback, dirty-state coordination, delete cleanup, missing-file conflict handling, and UI refresh decisions.
- That level of responsibility mixing raises change amplification and makes negative-path testing harder, because many behaviors can only be exercised through the full controller instead of smaller, focused abstractions.

Recommendation:
- Keep the composition root role, but extract workflow-focused collaborators for:
  - selection switching and unsaved-change continuation,
  - collection save/save-as flows,
  - add-to-collection mutation + persistence,
  - delete-from-disk mutation + collection rewrite recovery.
- Let the controller delegate to those collaborators and stay primarily responsible for wiring and high-level event routing.



## Recommended order of work

1. Harden Electron IPC path handling and add negative tests.
2. Normalize collection identity keys so duplicate prevention matches filesystem semantics.
3. Extract save/delete/selection workflows out of `app-controller.ts`.
4. Remove `@ts-nocheck` from domain and business-logic modules first, then expand outward.
