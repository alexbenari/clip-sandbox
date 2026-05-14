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

### P1: Collection identity is case-sensitive in memory, but the desktop runtime is using a case-insensitive filesystem

Files:
- `src/domain/collection.ts:96-129`
- `src/domain/pipeline.ts:91-130`
- `src/ui/save-as-new-dialog-controller.ts:129-136`
- `src/ui/add-to-collection-dialog-controller.ts:17-23`
- `src/app/app-controller.ts:331-349`
- `src/app/app-controller.ts:793-803`

Why this matters:
- `Collection.filenameFromCollectionName(...)` preserves user casing.
- `Pipeline` stores collections by the raw filename string and looks them up with exact string equality.
- Duplicate-prevention in both save flows also uses exact-case lookups.
- On Windows, `Highlights.txt` and `highlights.txt` are the same file on disk. The current logic can therefore miss an existing collection, allow a “new” save, and overwrite or alias the existing file while the in-memory model treats them as distinct identities.

Recommendation:
- Canonicalize collection filenames at the boundary used for identity, preferably with a filesystem-aware normalized key.
- Use that canonical key consistently in `Pipeline`, validation helpers, and controller comparisons.
- Add unit and Electron tests for case-only name collisions.

### P2: The TypeScript safety net is effectively disabled across the authored source tree

Files:
- `tsconfig.base.json:2-10`
- `tsconfig.json:6-15`
- Representative authored files: `src/app/app-controller.ts:1`, `src/domain/pipeline.ts:1`, `src/ui/clip-collection-grid-controller.ts:1`

Why this matters:
- `strict` is disabled.
- `electron/` is excluded from type checking entirely.
- Every authored TypeScript file under `src/` currently starts with `// @ts-nocheck`.
- The result is that `npm run typecheck` mostly proves that the project parses, not that layer contracts are sound.

Under the repo guidance, boundaries should make misuse difficult. Right now the biggest controller/domain/UI boundaries are enforced only by convention and tests, not by the language tooling that the codebase has already adopted.

Recommendation:
- Remove `@ts-nocheck` incrementally, starting with `src/domain/`, `src/business-logic/`, and adapter boundary types.
- Turn on stricter compiler checks for those folders before attempting the large UI/controller files.
- Bring `electron/` under type-checked coverage once the IPC contracts are explicitly typed.

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

## Test gaps to close next

- `tests/unit/electron-file-system-service.spec.ts:5-67` covers happy-path mapping only; it does not exercise traversal rejection or invalid filename handling.
- `tests/e2e/scenarios.spec.ts:87-218` covers only positive Electron flows; there is no case-only collision scenario and no malicious/invalid collection-name scenario.
- `Collection.validateCollectionName(...)` in `src/domain/collection.ts:106-129` only rejects a small illegal-character set. For a Windows desktop app, reserved device names and trailing-dot/space cases are still worth validating explicitly.

## Recommended order of work

1. Harden Electron IPC path handling and add negative tests.
2. Normalize collection identity keys so duplicate prevention matches filesystem semantics.
3. Extract save/delete/selection workflows out of `app-controller.ts`.
4. Remove `@ts-nocheck` from domain and business-logic modules first, then expand outward.
