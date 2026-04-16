# Object-Oriented Exception Register

Last updated: 2026-04-16

This document records the intentional non-OO holdouts from the object-oriented TypeScript refactor. The default architectural rule is class-first for stateful renderer responsibilities. A file appears here only when keeping it module-based is the better design.

## Composition and bootstrap seams

### `src/app/app-controller.ts`

Reason kept non-OO: this file is the renderer composition root. Its job is to assemble the object graph, wire DOM lookups to controllers and services, and host the application bootstrap entrypoint. Turning it into a long-lived `AppController` class would mostly move composition code behind a singleton-shaped wrapper without reducing complexity. The real goal is to keep stateful behavior in dedicated objects and leave the composition root thin.

## Pure or mostly stateless renderer helpers

### `src/app/app-text.ts`

Reason kept non-OO: this module is a pure text and formatting catalog. Converting message builders and constants into a class would add ceremony without creating useful ownership or lifecycle.

### `src/app/event-binding.ts`

Reason kept non-OO: this module is a focused DOM wiring helper. It binds passed handlers to passed elements and does not retain its own mutable state after setup.

## Value-shape helpers

### `src/ui/display-layout-rules.ts`

Reason kept non-OO: layout calculation is pure math over supplied dimensions and slot counts. Functions such as `computeBestGrid(...)`, `computeFsLayout(...)`, and `normalizeFsSlots(...)` do not own DOM, state, lifecycle, or workflow. This is a better fit for small deterministic functions than for a controller or class-backed UI object.

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

1. This register explains why files remain module-based. It does not list every class-backed file introduced by the refactor.
2. The TypeScript conversion is currently pragmatic: many `.ts` files still use `// @ts-nocheck` to preserve a one-shot landing. That is a type-safety follow-up concern, not a non-OO exception.
