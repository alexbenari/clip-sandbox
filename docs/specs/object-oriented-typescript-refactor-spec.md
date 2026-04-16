# Feature Spec: Object-Oriented TypeScript Refactor

## 1. Summary

Refactor Clip Sandbox into a more consistently object-oriented TypeScript codebase in order to improve consistency, testability, and maintainability without intentionally changing product behavior.

This initiative is a broad architectural refactor, not a feature expansion. It targets the renderer code first, but also covers tests and any other authored code where converting to TypeScript and explicit objects materially improves the design. The repository should emerge with:

1. TypeScript as the default authored language for `src/`,
2. TypeScript coverage for tests,
3. a class-first object-oriented design for code that naturally owns state, behavior, lifecycle, orchestration, or domain rules,
4. explicit documentation for any modules intentionally kept non-object-oriented,
5. preserved end-user behavior and UX.

The work will be executed as one branch and one refactor initiative, even if implementation is internally sequenced.

## 2. Problem

The current codebase is only partially aligned with the desired architecture.

What exists today:

1. the domain layer already contains meaningful classes such as `Pipeline`, `Collection`, and `ClipSequence`,
2. the app, business-logic, and UI layers still rely heavily on module-level functions and factory-style composition,
3. TypeScript is present but only configured for a narrow subset of domain files,
4. tests are written in JavaScript and do not yet benefit from TypeScript’s constraints,
5. large orchestration files such as `src/app/app-controller.js` still centralize substantial behavior.

This creates several maintainability issues:

1. the codebase does not express one consistent architectural style,
2. stateful responsibilities are not always owned by explicit objects,
3. type boundaries are weaker than they should be,
4. the gap between domain design and app/UI orchestration makes the overall architecture harder to reason about,
5. future refactors and feature work will continue to pay a tax for mixed patterns unless this is addressed directly.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Make `src/` a TypeScript-first codebase.
2. Convert tests to TypeScript so the test suite validates the same contracts and types as the product code.
3. Refactor code that naturally lends itself to object-oriented design into explicit objects, with classes as the default shape for stateful responsibilities.
4. Reduce reliance on module-level orchestration for stateful app behavior.
5. Preserve current product behavior and UX unless a very small change is required to support the refactor cleanly.
6. Produce an explicit written record of any modules intentionally kept non-object-oriented and why.
7. Finish the work as one cohesive initiative rather than as separately landed partial migrations.

### 3.2 Non-Goals

1. No new user-facing features are required.
2. No intentional UX redesign is part of this refactor.
3. No requirement to convert Electron main/preload code to TypeScript if leaving it as-is materially simplifies the work.
4. No requirement to convert every file in the repository to TypeScript regardless of value; pragmatic exceptions are allowed for bootstrap or config files.
5. No requirement that every remaining module become a class purely for style consistency if the result would be worse than the current design.

## 4. Product and Architectural Decisions Locked for This Feature

1. The primary motivation is consistency, testability, and maintainability.
2. `src/` is the highest-priority migration target.
3. Tests are in scope for TypeScript conversion.
4. Electron code may remain JavaScript/CommonJS if that meaningfully reduces migration cost and risk.
5. Config and bootstrap files may remain in their current pragmatic form when converting them would add tooling churn without architectural benefit.
6. The architectural target is class-first object orientation for code that owns state, lifecycle, orchestration, or domain behavior.
7. Non-object-oriented modules are allowed where they are genuinely the better design, but each must be justified in a written exception register.
8. The refactor is one branch and one initiative, with internal sequencing allowed but no partial landing.
9. Current product behavior should be preserved as closely as practical.

## 5. Scope

### 5.1 In Scope

1. TypeScript migration for authored renderer code under `src/`.
2. TypeScript migration for tests under `tests/`.
3. Refactoring stateful renderer, business-logic, app, and UI responsibilities into clearer objects.
4. Refactoring large stateful modules into smaller cohesive objects where that improves design.
5. Updating tooling, build, and test configuration as needed to support the migrated code.
6. Updating imports, runtime entrypoints, and test wiring needed to make the migrated code run.
7. Producing a module-exception document that explains which modules remain non-object-oriented and why.

### 5.2 Conditionally In Scope

1. Electron main/preload migration only if it proves low-cost and low-risk.
2. Additional repository files outside `src/` and `tests/` when converting them is clearly beneficial and does not create disproportionate churn.

### 5.3 Out of Scope

1. New product capabilities.
2. Intentional behavior redesign.
3. Re-architecting Electron solely for stylistic consistency.
4. Converting HTML or CSS to a different frontend stack.

## 6. Target Architectural Direction

### 6.1 Object-Oriented Default

The default expectation after this refactor is:

1. domain entities remain explicit classes,
2. stateful business-logic responsibilities become explicit objects or services,
3. app/session state is owned by explicit objects rather than loose state records plus free functions,
4. UI controllers with internal state and lifecycle are represented as explicit objects rather than ad hoc module closures,
5. the composition root remains identifiable and intentionally thin relative to the objects it wires together.

### 6.2 Class-First Interpretation

For this initiative, “object-oriented” should be interpreted primarily as class-based design for responsibilities that naturally own:

1. mutable state,
2. lifecycle,
3. coordination across subsystems,
4. invariants,
5. behavior tightly coupled to owned state.

Classes are the default, not an absolute rule. A non-class design may remain when it is materially clearer, smaller, or more correct.

### 6.3 Allowed Non-OO Categories

Some code may remain module-based when object orientation would not improve it. Likely examples include:

1. pure value formatting,
2. pure stateless transforms,
3. constants,
4. type-only definitions,
5. minimal composition/bootstrap seams,
6. other focused utilities that do not own meaningful state or behavior.

These are allowed only when the final design documentation explains why they remain non-object-oriented.

### 6.4 Current Hotspots Likely to Change

Based on the current repository shape, the refactor will likely focus heavily on:

1. `src/app/app-controller.js`,
2. `src/app/app-session-state.js`,
3. UI controllers currently implemented as module factories,
4. stateful business-logic modules under `src/business-logic/`,
5. supporting test fixtures and test helpers that depend on the current module boundaries.

Exact file and class names may change during implementation, but the resulting ownership lines should be clearer than the current arrangement.

## 7. TypeScript Requirements

### 7.1 Source Code

Required direction for source code:

1. `src/` should be authored in TypeScript,
2. the TypeScript configuration should cover the migrated source tree rather than a narrow subset,
3. the migrated source code should use explicit types where that improves clarity and safety,
4. the resulting setup must support the current runtime model.

### 7.2 Tests

Required direction for tests:

1. `tests/` should be migrated to TypeScript,
2. test helpers and fixtures should be updated as needed to work cleanly with the new types and object model,
3. the converted tests should continue to prove behavior rather than merely mirror implementation structure.

### 7.3 Pragmatic Exceptions

Pragmatic exceptions are allowed for:

1. Electron code under `electron/` if leaving it in JavaScript is materially simpler,
2. config or bootstrap files that do not justify migration effort,
3. other narrow seams where TypeScript conversion would add churn with little architectural value.

These exceptions should be captured in the final exception register if they are meaningful to the architectural story.

## 8. Behavior Preservation Requirements

This initiative is a structural refactor first. Product behavior should remain intact.

Required behavior preservation:

1. pipeline and collection loading continue to work,
2. source switching and dirty-state behavior continue to work,
3. save and save-as-new flows continue to work,
4. add-to-collection flows continue to work,
5. delete-from-disk flows continue to work,
6. zoom behavior continues to work,
7. fullscreen behavior continues to work,
8. selection, reorder, and grid interaction continue to work,
9. visible UX should remain substantially the same unless a minor change is needed to support the refactor cleanly.

Any unavoidable behavior changes must be small, explicit, and justified.

## 9. Design and Documentation Requirements

### 9.1 Exception Register

Implementation must produce a written exception register documenting which modules remain non-object-oriented and why.

Required characteristics:

1. it should be a dedicated document rather than an implicit trail in commit history,
2. it should identify the remaining non-OO modules or module categories,
3. it should explain why keeping each one non-object-oriented is the better design,
4. it should be reviewable by the user after implementation.

The exact final path may be decided during execution planning, but it must live under `docs/`.

### 9.2 Architecture Documentation

If the refactor materially changes durable architectural boundaries, the implementation must update `docs/agent-docs/` accordingly so the repository’s agent-facing architecture documentation remains accurate.

## 10. Testing and Verification Requirements

The refactor must be validated at the levels needed to prove that behavior was preserved while the architecture changed.

Required verification includes:

1. TypeScript typechecking for the migrated code,
2. unit and integration coverage updates where architecture changes invalidate existing assumptions,
3. regression verification for critical user-visible flows,
4. end-to-end verification for the most refactor-sensitive behavior paths,
5. running the full automated suite after every internal implementation milestone, not only at the end of the initiative.

Implementation should begin by checking whether existing coverage is strong enough for:

1. folder load,
2. source switching,
3. save and save-as-new,
4. add-to-collection,
5. delete-from-disk,
6. zoom,
7. fullscreen,
8. reorder and selection.

If the current suite is weak in these areas, coverage should be strengthened before the most disruptive structural edits.

Milestone validation rule:

1. every internal milestone must end with a full-suite run covering both unit/integration and e2e coverage,
2. targeted commands may be used during the milestone for faster debugging, but they do not replace the required full-suite run,
3. implementation should not proceed past a milestone boundary while the full suite is failing unless the execution plan is explicitly updated to record a deliberate temporary stop point and why.

## 11. Risks and Complexity Notes

This is a large refactor with real complexity and should be treated as such.

Primary risks:

1. broad churn across `src/` and `tests/` causing regressions that are hard to localize,
2. introducing ceremony rather than clarity by forcing class conversions where they do not help,
3. allowing TypeScript/tooling work to dominate the initiative instead of serving the architectural goal,
4. destabilizing behavior while changing large orchestration seams,
5. failing to document exceptions clearly enough, leaving the final architecture inconsistent without explanation.

Risk-reduction priorities:

1. preserve behavior with strong regression coverage,
2. prioritize the highest-value stateful hotspots first,
3. use TypeScript to clarify boundaries rather than merely rename files,
4. keep the composition root thinner, not more complex,
5. document the final architectural shape clearly.

## 12. Acceptance Criteria

The feature is complete when all of the following are true:

1. `src/` has been migrated to TypeScript except for any explicitly justified pragmatic exceptions.
2. `tests/` have been migrated to TypeScript except for any explicitly justified pragmatic exceptions.
3. The main stateful responsibilities in the renderer codebase are represented by explicit objects, with classes as the normal form.
4. Large stateful module seams have been refactored into clearer ownership boundaries.
5. Current user-visible behavior continues to work and passes the relevant verification suite.
6. The full automated suite has been run after every internal milestone, with results recorded in the execution plan.
7. Any intentional TypeScript or OO exceptions, including meaningful JavaScript holdouts such as Electron or config seams, are documented with rationale.
8. If durable architecture boundaries changed, `docs/agent-docs/` has been updated to reflect the final design.
9. The work ships as one cohesive refactor initiative rather than as partially landed migrations.
