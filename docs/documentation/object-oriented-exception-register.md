# Object-Oriented Exception Register

Last updated: 2026-09-11

This document records intentional non-OO holdouts. Production TypeScript is class-owned by default; a module-level function must have a concrete reason to remain outside an object and must be recorded here when it is an architectural exception.

## Pragmatic JavaScript and config holdouts

### `electron/main.cjs`

Reason kept non-OO and non-TS: Electron main-process bootstrap remained pragmatic CommonJS to avoid expanding the refactor into process and tooling churn unrelated to the renderer architecture goal.

### `electron/preload.cjs`

Reason kept non-OO and non-TS: the preload bridge is a narrow Electron boundary file. Keeping it in CommonJS reduced migration risk without weakening the renderer OO design.

### `vitest.config.js`

Reason kept non-OO and non-TS: test-runner configuration is tool metadata, not application architecture.

### `playwright.config.mjs`

Reason kept non-OO and non-TS: e2e runner configuration is likewise a tooling seam rather than a domain or application design concern.

## Notes

1. This register explains why production files remain module-based. It does not list class-backed files or local callbacks that implement a class-owned operation.
2. Tests, sandboxes, spikes, generated output, and build/tooling scripts are governed by their own conventions and are not production OO exceptions.
3. No production TypeScript free-function exception is currently registered.
