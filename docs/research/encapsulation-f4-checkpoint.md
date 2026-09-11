# Encapsulation F4 checkpoint

## Scope

Bounded F4 privacy tightening for the context menu, metadata tracker, zoom overlay, collection conflict controller, and dialog controllers. Existing behavior and deliberate mount roots remain unchanged.

## Edits

- Made controller dependencies, callbacks, DOM references, and invariant-bearing state private; stable constructor dependencies are readonly where they are not reassigned.
- Removed the unused `ZoomOverlayController.getVideoElement()` raw DOM accessor.
- No caller or behavior redesign was made. No new type consumer test was needed because existing tests use public behavior and no caller mutates these fields.

## Checks

- `npm run typecheck` passed, including `tsconfig.strict-src.json`.
- Focused controller coverage passed: 8 files, 27 tests across context menu, metadata tracking, zoom overlay, collection conflict, and all four dialog controllers.
- No production `getVideoElement` callers remain; the only remaining reference is the historical research review.

## Remaining work

Root should independently inspect the bounded diff, caller searches, type errors, and behavior test results before integrating the packet.
