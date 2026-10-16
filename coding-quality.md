# Code Design Guidelines

## Purpose and scope
- This document applies primarily to long-lived application code in layered systems.
- It treats class ownership as the default for long-lived production behavior in this object-oriented codebase. Any free-function exception should be deliberate and reviewable.
- Adapt these guidelines rather than applying them literally to one-off scripts, tests, migrations, data pipelines, framework glue, or codebases built around functional or data-oriented patterns.
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

- Keep tests reflecting the intended behavior, and match unit, integration, and end-to-end coverage to the risk of the code.
- Do not assert private DOM structure, incidental call counts, exact pixel measurements, animation frames, or timestamps unless the requirement guarantees them. Assert observable behavior and relationships; use a justified tolerance for approximate values.
- Do not use fixed sleeps or assume a background operation finishes within a particular interval. Wait for an observable completion condition with a bounded timeout; control clocks, animations, and external responses in tests that need exact timing.
- Do not let tests depend on execution order, shared user data, random input, live services, or machine-specific state. Give each test explicit fixtures and isolated state, and clean up what it creates.
- Do not combine several slow or failure-prone operations in one end-to-end test under a single timeout. Keep each scenario focused; cover detailed rules in unit or integration tests and reserve end-to-end tests for essential user workflows.
- Do not weaken assertions or only raise timeouts to make a flaky test pass. Check whether the failure reveals a product bug, then make the setup and observation deterministic. If real hardware or media timing is essential, run that check separately; if it cannot be made reliable, remove it and record the coverage gap.
