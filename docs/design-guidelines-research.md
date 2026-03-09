# Design Guidelines Research: Pure Client-Side Web App (HTML + CSS + JS)

Date: 2026-03-07
Audience: engineers building or refactoring browser-only applications with no backend calls

## 1. Scope and Constraints

This report focuses on web apps where:
- The runtime is the browser only.
- The only external input is user-selected local files/directories.
- The stack is plain HTML, CSS, and JavaScript (no framework required).

Implications:
- All architecture boundaries are in-process boundaries (modules, functions, adapters), not network boundaries.
- Reliability and maintainability come from code structure, contracts, and tests.
- Security risk is mainly DOM injection, unsafe dynamic execution, and unsafe handling of file-originated content.

## 2. Research Approach and Compared Source Types

I compared:
- Principle-origin sources (SOLID, DRY, AHA, YAGNI/simple design).
- Platform sources (MDN, specs, compatibility data) for browser APIs that matter in a local-file app.
- Testing sources (Testing Library and Vitest official docs) for testability decisions.

Key cross-source finding: for this stack, maintainability is driven more by module boundaries and data-flow discipline than by class hierarchies.

## 3. Executive Recommendation

Use a **Functional Core + Imperative Shell + Ports/Adapters** structure, built from ES modules [1][2].

Why this is the best fit:
- It applies SOLID without forcing class-heavy code.
- It keeps DRY focused on duplicated knowledge, not premature abstraction.
- It naturally supports KISS/AHA: start with simple use-case modules and abstract only after repetition stabilizes.
- It strongly improves testability by isolating pure domain logic from DOM and file APIs.

Avoid:
- A single large `app.js` that mixes state, DOM, permissions, parsing, and layout.
- Deep inheritance trees for UI behavior.
- Early generic abstraction layers before repeated use-cases appear.

## 4. Principle-by-Principle Application to Pure HTML/CSS/JS

### 4.1 SOLID (adapted to module/function-level JavaScript)

SOLID is often taught for class-based OO, but its intent applies directly to modules and functions [18][19].

#### SRP: Single Responsibility Principle
Design modules around one axis of change (not around call order). In this stack, common axes are:
- File ingestion/parsing rules
- Domain policy/rules
- DOM rendering and event wiring
- Persistence/serialization format

Practical rule:
- One module = one reason to change, one test seam.

#### OCP: Open/Closed Principle
Prefer extension points over editing stable core logic repeatedly.
Examples:
- Add new file parser via registry (`parsers.register(type, parserFn)`) instead of branching in core.
- Add new layout strategy as pluggable function.

#### LSP: Liskov Substitution Principle
In plain JS, enforce substitutability through contracts:
- JSDoc/types and runtime guards at module boundaries.
- Adapter contract tests that run against real + fake implementations.

#### ISP: Interface Segregation Principle
Keep dependency surfaces narrow:
- Pass only the exact methods needed (`{ readText(file) }`, not a giant utility bag).
- Split adapter interfaces (`FileReaderPort`, `StoragePort`, `RendererPort`) instead of a monolithic `Platform` object.

#### DIP: Dependency Inversion Principle
High-level use-cases should depend on abstractions (ports), not browser APIs [20].
- Use-case module accepts collaborators as arguments.
- Composition root wires browser adapters to ports.

### 4.2 DRY (without overfitting)

Use DRY for duplicated knowledge, not for every repeated line [21].

Good DRY targets:
- Validation rules duplicated in multiple flows.
- Filename normalization rules repeated across parser/sorter/UI.
- Error-message mapping duplicated in UI + logs.

Not a DRY target yet:
- Two similar workflows that are still evolving differently.

Practical rule:
- If repeated logic reflects a stable business rule, centralize it.
- If repeated logic is still exploratory, keep it duplicated temporarily.

### 4.3 KISS

For this stack, KISS means:
- Prefer direct data flow over meta-framework patterns.
- Prefer explicit modules over clever dynamic wiring.
- Prefer predictable control flow with small pure functions.

Simple-design checkpoints:
- Can a new developer trace one user action in under 3 module hops?
- Can a failing behavior be tested without a browser for most logic?
- Are there fewer concepts than use-cases?

### 4.4 AHA (Avoid Hasty Abstractions)

AHA complements DRY [22]:
- Delay abstraction until repeated patterns are proven.
- Prefer local duplication over wrong global abstraction.

Refactoring trigger:
- Similar logic appears in 3+ places with same invariants and only superficial differences.

### 4.5 Composition Over Inheritance

In JavaScript apps, composition should be default [16][17]:
- Build behavior from small functions and collaborators.
- Reuse non-UI logic via imported modules.
- For UI behavior, compose renderers and handlers rather than subclassing base widgets.

### 4.6 Testability as design outcome

Testability requires seams [25][27]:
- Pure domain/use-case functions take data in, return data out.
- Side effects isolated in adapter modules.
- UI code minimal and mostly orchestration.

This reduces brittle mocks and improves confidence in behavior-level tests.

## 5. Architecture Options Compared

### Option A: Functional Core + Imperative Shell + Ports/Adapters (Recommended)

Shape:
- Domain and use-cases are pure modules.
- Browser APIs are wrapped in adapters.
- Composition root wires dependencies.

Pros:
- Best alignment with SOLID + testability.
- Easy unit tests for majority of logic.
- Safe refactoring with minimal UI breakage.

Cons:
- Requires discipline around boundary placement.
- Slight upfront structure cost.

Best for:
- Medium or growing apps with evolving features.

### Option B: UI-Component-Centric (Custom Elements-heavy)

Shape:
- Encapsulate behavior in custom elements.

Pros:
- Good UI encapsulation.
- Useful if reusable UI widgets are core requirement.

Cons:
- Can hide domain logic inside elements (testability drop).
- More lifecycle complexity than needed for simple local tools.

Best for:
- Design systems or reusable widget libraries.

### Option C: Single Controller Module (Monolith)

Shape:
- One central script owns all state and side effects.

Pros:
- Fast initial prototyping.

Cons:
- Weak SRP, weak DIP, low testability.
- High regression risk as features grow.

Best for:
- Very short-lived demos only.

## 6. Recommended Project Structure

```text
/src
  /app
    bootstrap.js            # composition root: wire dependencies and start app
    router.js               # optional local view/state routing
  /domain
    models.js               # core entities/value objects
    rules.js                # pure policy logic and invariants
    errors.js               # domain error types/codes
  /usecases
    load-files.js           # orchestrates domain + ports
    apply-order.js
    save-order.js
  /ports
    file-system-port.js     # interface contracts (JSDoc)
    storage-port.js
    clock-port.js
    random-port.js
    renderer-port.js
  /adapters
    /browser
      file-system-adapter.js
      storage-adapter.js
      dom-renderer-adapter.js
      clock-adapter.js
  /ui
    view-model.js           # transforms domain state -> render model
    events.js               # maps DOM events -> usecase calls
    templates.js            # render helpers (DOM APIs, not innerHTML for untrusted data)
  /shared
    result.js               # Result helpers
    assert.js               # runtime boundary checks
/tests
  /unit
  /integration
  /e2e
/docs
  design-guidelines-research.md
```

For no-build setups, keep ES module imports relative or use import maps [2][4].

## 7. Data and Dependency Flow

Recommended flow for each user action:
1. UI event handler captures user intent.
2. Handler calls one use-case with plain input DTO.
3. Use-case calls domain rules + ports.
4. Use-case returns result object/state delta.
5. Renderer adapter updates DOM from view model.

Hard rule:
- Domain and use-case layers do not import DOM or `window` APIs directly.

## 8. Concrete Rules to Enforce Each Principle

### SOLID rules
- `domain/*` and `usecases/*` must be side-effect free.
- Any module touching `document`, `window`, file handles, timers, or storage belongs in `adapters/*` or `ui/*`.
- Use-cases accept dependencies as params (`createLoadFiles({ fileSystem, parser, renderer })`).

### DRY + AHA rules
- No shared utility extraction until there is stable repeated behavior.
- Extract only invariant logic, not control flow that is still changing.
- Record postponed abstractions in lightweight ADR notes.

### KISS rules
- Max one orchestration level in use-cases.
- Avoid generic frameworks inside app code.
- Prefer explicit state transitions over implicit mutation cascades.

### Composition rules
- Reuse by function composition and module imports.
- Avoid inheritance for UI behavior reuse.
- Favor small collaborators injected into orchestrators.

### Testability rules
- Every use-case has unit tests with fake ports.
- Every adapter has contract/integration tests.
- At least one end-to-end flow per critical user scenario.

## 9. Testing Strategy for This Stack

### Test Pyramid (practical)
- Unit tests (majority): domain rules + use-cases with fake ports.
- Integration tests: real DOM adapter + jsdom/happy-dom; real parser + fixture files.
- E2E tests: critical happy-path and key failure-path flows in real browser.

### What to test at each level

Unit:
- File filtering and ordering invariants.
- Validation behavior and error mapping.
- Use-case orchestration decisions.

Integration:
- DOM updates from view model.
- Adapter behavior around browser API edge cases.

E2E:
- Select folder/file -> load -> reorder -> save -> reload.
- Error handling for invalid order file.

### Mocking guidance
- Mock external boundaries, not internal behavior.
- Prefer fakes/stubs for ports over deep mocks of internal modules.
- Reset/restore mocks between tests.

## 10. Client-Side File-App Specific Risks and Design Responses

### 10.1 Browser compatibility risk
- `showDirectoryPicker()` and File System Access support are still uneven across browsers [7][9].
- Design with capability detection and fallback:
  - Primary: File System Access API.
  - Fallback: `<input type="file" webkitdirectory multiple>` and download-based export.

### 10.2 Security risk (DOM/XSS)
- Treat file-derived text as untrusted.
- Use safe DOM sinks (`textContent`, `createElement`, `appendChild`) over HTML injection [14].
- Avoid `eval`, `new Function`, and string-based timers for untrusted content [14][15].

### 10.3 Memory/performance risk
- Revoke blob URLs when media/cards are removed [10][11].
- For heavy compute/parsing, consider Web Workers [12].
- Transfer large buffers to workers where possible [13].

### 10.4 Permission/session behavior
- File handle permissions may not persist as expected across sessions [7][8].
- Always handle permission re-check and re-request paths.

## 11. Phased Refactor Plan (if starting from monolith)

Phase 1: Stabilize seams
- Extract pure logic from controller into `domain/rules.js`.
- Add unit tests for extracted logic.

Phase 2: Introduce ports
- Wrap file API and storage API in adapters.
- Convert core flows to use injected dependencies.

Phase 3: Split use-cases
- Create one module per user intent (load, apply order, save, delete).
- Move orchestration out of UI handlers.

Phase 4: Harden tests
- Add integration tests for renderer and adapters.
- Add targeted E2E for top user journeys.

Phase 5: Simplify abstractions (AHA pass)
- Remove unused extension points.
- Merge abstractions that did not prove value.

## 12. Review Checklist (Use on Every PR)

- Does each changed module have one clear reason to change?
- Is any browser API call leaking into domain/use-case code?
- Did we duplicate stable business knowledge in more than one place?
- Did we introduce abstraction before repeated patterns stabilized?
- Can behavior be tested without a real browser for most changed logic?
- Are file-derived strings rendered safely?
- Are blob URLs revoked and long tasks isolated from UI thread?

## 13. Final Guidance

For pure HTML/CSS/JS local-file apps, the winning strategy is:
- Keep core logic pure and small.
- Push side effects to adapters.
- Prefer composition and explicit wiring.
- Balance DRY with AHA to avoid premature architecture.
- Use tests as architectural enforcement, not just bug nets.

That combination gives the best long-term maintainability under SOLID/DRY/KISS/AHA while staying lightweight and framework-free.

## Sources

1. MDN, JavaScript modules: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
2. MDN, import maps: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap
3. Can I use, JavaScript modules via script tag: https://caniuse.com/es6-module
4. Can I use, Import maps: https://caniuse.com/import-maps
5. MDN, File API (overview): https://developer.mozilla.org/en-US/docs/Web/API/File_API
6. MDN, Using files from web applications: https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications
7. MDN, showDirectoryPicker(): https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
8. MDN, File System API: https://developer.mozilla.org/docs/Web/API/File_System_API
9. Can I use, File System Access API: https://caniuse.com/native-filesystem-api
10. MDN, URL.createObjectURL(): https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static
11. MDN, blob: URLs and memory management: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob
12. MDN, Using Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
13. MDN, Transferable objects: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
14. OWASP, DOM Based XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html
15. W3C, Content Security Policy Level 3: https://www.w3.org/TR/CSP3/
16. React docs (legacy), Composition vs Inheritance: https://legacy.reactjs.org/docs/composition-vs-inheritance.html
17. MDN, Inheritance and the prototype chain: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain
18. Robert C. Martin, Single Responsibility Principle: https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html
19. Robert C. Martin, Open Closed Principle: https://blog.cleancoder.com/uncle-bob/2014/05/12/TheOpenClosedPrinciple.html
20. Martin Fowler, Dependency Injection: https://martinfowler.com/articles/injection.html
21. Wikipedia, Don't Repeat Yourself (attributes DRY to Hunt/Thomas): https://en.wikipedia.org/wiki/Don%27t_repeat_yourself
22. Kent C. Dodds, AHA Programming: https://kentcdodds.com/blog/aha-programming
23. Martin Fowler, YAGNI: https://martinfowler.com/bliki/Yagni.html
24. Martin Fowler, Beck Design Rules: https://martinfowler.com/bliki/BeckDesignRules.html
25. Testing Library, Guiding Principles: https://testing-library.com/docs/guiding-principles
26. Testing Library docs (avoid implementation details): https://testing-library.com/docs/
27. Vitest, Mocking guide: https://vitest.dev/guide/mocking
28. Vitest, Features/isolation: https://vitest.dev/guide/features
29. Vitest, Improving performance and isolation: https://vitest.dev/guide/improving-performance.html
30. Google Testing Blog, Don't Overuse Mocks: https://testing.googleblog.com/2013/05/testing-on-toilet-dont-overuse-mocks.html
