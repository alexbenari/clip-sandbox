# Code Design Guidelines

## Purpose and scope
- This document applies primarily to long-lived application code in layered systems.
- It treats class ownership as the default for long-lived production behavior in this object-oriented codebase. Any free-function exception should be deliberate and reviewable.
- Adapt these guidelines rather than applying them literally to one-off scripts, tests (except § Test reliability, which is written for them), migrations, data pipelines, framework glue, or codebases built around functional or data-oriented patterns.
- Optimize first for clarity, correctness, cohesion, and changeability.

## Terms
- Layer: A part of the application with a distinct kind of responsibility, such as presentation, application orchestration, or domain behavior.
- Responsibility: The kind of work a class, module, or method is supposed to own.
- Cohesion: How strongly the behavior inside a class or module belongs together.
- Boundary: The line where one layer, class, or method hands off work to another.
- Orchestration: Workflow coordination across components or layers.
- Presentation logic: Rendering decisions and local interaction behavior.
- Domain logic: Rules and behavior that express the business or product model.

## Core principles
- Prefer designs that keep behavior close to the state and invariants they govern.
- Prefer explicit class ownership for production behavior, including stateless calculations and formatting, so responsibilities and dependencies remain easy to find and evolve.
- Aim for high cohesion. A class or module should have one cohesive reason to change.
- Prefer interfaces and capability-based polymorphism over business logic that branches on type or kind when the behavior can live on the owning abstraction instead.
- Prefer explicit dependencies and clear ownership of state.
- Avoid abstractions that do not earn their cost. Small duplication is often better than premature generalization.
- Keep methods and classes at a consistent level of abstraction. If a method mixes workflow steps, domain rules, and low-level mechanics, split it.
- Extend an existing layer, class, or method only when the new behavior fits its current responsibility or is a natural extension of it. Avoid smearing concerns across boundaries.

## Boundaries and layering
- Setting layer, class, and method boundaries well is central to good design. For each feature, decide deliberately where workflow, domain behavior, state ownership, and presentation belong.
- Each layer should own one kind of concern. For example, do not let presentation code drift into application orchestration, and do not let orchestration absorb domain behavior that belongs deeper in the model.
- A boundary should make misuse difficult. Keep APIs small, intention-revealing, and hard to call incorrectly.
- A method should operate at one level of abstraction. A class should gather behavior that belongs together. A layer should group components with the same kind of responsibility.
- Before adding behavior to an existing class or module, ask whether it shares the same reason to change. If not, create a separate abstraction instead.
- Own state in the right place and enforce invariants at the boundary that owns them.
- Dependencies should point in the right direction. Do not bypass layers.
- Every parameter should be used. Do not make a method carry duplicate inputs when one value can be derived from another.
- Functions with more than three arguments often signal missing structure, confused ownership, or weak boundaries.

## Naming and code shape
- Name classes and modules by responsibility, not by implementation details.
- Prefix every TypeScript interface name with `I` followed by a PascalCase responsibility name, such as `IAppScreen`.
- When a responsibility changes materially, rename the class or module to match it.
- Files that contain a single primary class should usually be named after that class.
- Name methods by what they accomplish, not how they do it.
- Name variables by the role they play in the current scope.
- Keep names clear, proportional, and aligned with responsibility.
- Prefer code that a reader can understand quickly, with control flow that is easy to follow, over clever compactness.

## Error handling
- Handle errors explicitly and make failure modes clear.

## Comments

- Do not emit introductory doc blocks on methods, classes, properties or enums — C# `<summary>`/`<param>`, JSDoc `/** … @param */`, Python docstrings, or the equivalent in any language. This is a rule, not a preference.
- Do not comment an enum at all — neither the type nor its members, in any comment form. A reason worth keeping belongs on the code that acts on the values.
- Invest in the name instead: precise method and parameter names already say what the block would, without the volume that makes surrounding code harder to read, and without going stale as the code changes. Needing a doc block to explain what something does is a signal that the name is wrong.
- Keep a doc block only where it records something the signature cannot: a non-obvious reason, constraint, or reference to external authority. Prefer moving that reason into the code as a why-comment at the place it applies.
- When removing existing blocks, preserve any such reason rather than deleting it with the block.
- A docstring the runtime reads is behavior, not documentation, and stays — CLI help text (Typer, Click, argparse), MCP tool descriptions, and anything else surfaced to a user or a model at run time. If a consumer requires generated API reference documentation, raise it as a deviation rather than assuming the exception.

## Layer guidance
- UI code follows [`ui-coding-quality.md`](ui-coding-quality.md). It defines the presentation roles (controls, screens, the shell), the workflows that run user flows, the composition root, and how they communicate. It takes precedence over this document where the two differ on UI matters.

## Tradeoffs and exceptions
- Keep a free function only at a pragmatic language, framework, bootstrap, generated-code, or tooling boundary where a class would make ownership less clear. Record production exceptions in `docs/documentation/object-oriented-exception-register.md`.
- Prefer duplication over abstraction when the shared pattern is still unstable or the abstraction would obscure intent.
- A class may own multiple closely related behaviors if they change together and reinforce one responsibility.
- Follow framework conventions unless there is a strong reason not to. Local design preferences should not fight the platform without a clear payoff.
- Avoid obvious performance or memory inefficiencies, but do not trade away clarity for speculative micro-optimizations.

## Test reliability

`npm run lint` enforces the mechanical parts of these rules for tests. The rest are checked in review. Disable a lint rule only for one line, with a comment saying why.

What to assert:

- Keep tests reflecting the intended behavior, and match unit, integration, and end-to-end coverage to the risk of the code.
- Each test protects one requirement that a user or caller relies on. Its name states the scenario and the expected outcome in domain terms, and every clause in the name has an action and an assertion in the body.
- Do not assert private DOM structure, incidental call counts or call order, exact pixel measurements, animation frames, timestamps, durations, retry counts, size limits, or encoder settings unless the requirement guarantees them. Assert observable behavior and relationships; use a justified tolerance for approximate values. When a value does matter, take it from the production constant or the spec, and never use it to find other things.
- Assert on what the code under test produced or changed, never on the fixture. Assert a mock interaction only when the interaction is the contract, such as "never sends a path to the service".
- Use exact expected values for concrete inputs. A range that admits every possible result, a substring match on an argument list, or `toThrow()` without the expected message is not an assertion.
- Before freezing a recorded string or behavior as the expected value, confirm it is the requirement, or fix the bug it shows.

Proving a test can fail:

- See every new or changed test fail for the right reason before relying on it: write it first, or break the behavior it names and confirm it fails with a readable message. Failing only because the code does not exist yet is not enough. For an end-to-end test, also confirm the scenario reaches the state its name describes; if the fixture cannot reach it, prove the property at a lower level and name the end-to-end test for what it covers.
- A negative test ("X does not happen") first creates the conditions in which X would happen, then waits until X would have been observable. Writing it first does not prove it: with no code, nothing happens.
- An ordering test holds the first step open, for example with a deferred promise, so that an implementation that does not wait fails.
- Assert an effect right after the awaited call that promises it, before awaiting other work that could complete the effect and hide an ordering bug.

Timing:

- Do not use fixed sleeps, size a wait to a private constant, or assume a background operation finishes within a particular interval. Wait for an observable completion condition with a bounded timeout; control clocks, animations, and external responses in tests that need exact timing.
- After a resize, navigation, or mode change, wait for evidence that it took effect before measuring. A setup call can silently do nothing; a maximized window ignores a resize. In Playwright, prefer the retrying `expect(locator)` matchers over asserting on a value read once.
- Do not poll a value that keeps changing on its own; make the system still, or compare against a value captured at the action. Do not count microtasks; flush fully or wait on a condition.

Isolation and environment:

- Do not let tests depend on execution order, shared user data, random input, live services, or machine-specific state. Give each test explicit fixtures and isolated state, and clean up what it creates. Temporary folders, profiles, and caches live under the test's own root and are removed in `finally` or `afterEach`; when the app itself writes elsewhere, give it a test-mode location instead of cleaning up after it. Restore global patches the same way, saving the original before replacing it.
- Optional native dependencies use the shared skip guard in `tests/support/frame-review-dependencies.ts`, evaluated before anything that can throw. Never resolve tools at module load.
- Never assume a display size. Derive pointer targets from element boxes, and do not rely on layout that a smaller display changes: CI's display is smaller than a desktop one.
- Integration tests build the DOM from the shipped page (`tests/support/page-markup.ts`) or the control's own factory, never from a hand-copied skeleton. A stub honors the inputs that matter to the behavior under test, or the test uses the real collaborator.

Structure and gates:

- Do not combine several slow or failure-prone operations in one end-to-end test under a single timeout. Keep each scenario focused; cover detailed rules in unit or integration tests and reserve end-to-end tests for essential user workflows. An end-to-end test drives real controls and reaches only states a user can reach: no injected DOM nodes, synthetic events, or clicks through something that covers the target.
- Name a test file after the unit or workflow it tests. When a production class is renamed or split, rename its tests in the same change. Search for an existing test before adding one, and keep shared builders in `tests/support/` or `tests/e2e/support/`.
- Every kind of check a test relies on, such as `tsc`, a native build, or a fixture generator, runs in pre-commit or CI; otherwise the test is not coverage.
- Do not weaken assertions or only raise timeouts to make a flaky test pass. Check whether the failure reveals a product bug, then take one of three outcomes and say which in the commit message: make it deterministic; move the timing-sensitive part to a level where timing can be controlled; or remove the test and record the coverage gap. Never keep a test's name over a body that no longer does what the name says.
