# Component-library candidates for the application shell

Research date: 2026-09-06. Milestone: MS1 of the [execution plan](../plans/application-shell-and-global-surfaces-exec-plan.md). Status: candidate selection for review, not dependency adoption.

## Purpose and method

The acceptance goal for MS1 is a source-backed, architecture-compatible shortlist that covers the shell and likely future controls, with explicit reasons for keeping or excluding every researched candidate. No packages were installed, gallery elements copied, or application behavior changed.

Orientation used the [architecture map](../agent-docs/agent-architecture-map.md), [spec](../specs/application-shell-and-global-surfaces-spec.md), [PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md), [coding-quality.md](../../coding-quality.md), `package.json`, and `electron/main.cjs`. The current renderer uses TypeScript emitted as browser modules, static HTML/CSS, and class-backed controls; it has no UI framework or bundler. Electron loads a local file with context isolation enabled and Node integration disabled. A candidate must preserve those boundaries. Web Components may have their own implementation runtime without requiring a renderer framework migration, but dependency resolution and local asset packaging still need MS2 proof.

Discovery began with the mandatory Astryx, Semantic UI, and UIverse candidates and the three seed leads, then searched across Web Components, unstyled behavior, traditional CSS/JS systems, and focused primitives. The broader query was `framework agnostic accessible UI components vanilla javascript headless Zag Floating UI FAST Lion alternatives`. Official catalogs and repository links expanded the comparison to Lion, FAST, Zag, Bootstrap, Floating UI, and SortableJS. Shoelace was checked as Web Awesome's predecessor. This is a deliberately bounded longlist of 13 external candidates plus the local baseline, not an exhaustive directory of every UI project.

Primary-source checks used official documentation, GitHub repository/release/issue pages and the public REST API, and npm registry metadata. Registry `dist-tags.latest` and its publication time are distinguished from the newest monorepo release, prereleases, and default-branch commits. Checks were read-only. Tavily search failed with a stored-session refresh error; web search and direct primary-source reads supplied the evidence. GitHub's anonymous API later hit its shared rate limit; no missing observations were treated as positive evidence.

Evidence vocabulary: **observed** means a source actually states or exposes the fact, **claim** means an upstream quality assertion not tested here, and **inference** means our assessment. Confidence is high for directly verified compatibility/license facts, medium for comparative fit, and low for unsupported operational quality. Stars are approximate discoverability signals, not adoption counts or quality scores. A recent commit does not establish release health; a closed issue does not prove a fix or a support SLA. Missing security files mean only that the checked locations did not contain a policy.

Detailed official-source records for nominated candidates and Web Component seed leads are linked in [mandatory-candidate evidence](component-library-mandatory-evidence.md) and [Web Component evidence](component-library-web-components-evidence.md). They are part of this report's evidence, not separate recommendations.

## Complete control inventory

| Control / component coverage | Immediate shell or existing use | Later need / evaluation question |
|---|---|---|
| Hierarchical tree/navigation | Empty Pipelines host only; app-screen navigation now | Pipelines and nested collections: selection, expansion, keyboard traversal, long names |
| Foldable or split panels | Two independent hosts and reveal rails | Width reclamation, interrupted reversal, reduced motion; a splitter alone does not implement fold choreography |
| Drag/drop targets | Preserve existing clip reorder | Future pipeline/collection targets; distinguish DOM reorder from filesystem operations and keyboard alternatives |
| Buttons and icon buttons | Commands, panel folds, Settings, utilities | Accessible names, disabled/busy states, compact hit areas |
| Selects and searchable comboboxes | Existing collection selector; screen selector | Search and metadata filtering; asynchronous results and long labels |
| Switches, checkboxes and radios | Single-clip audio default | Explicit checked state, keyboard activation, failure rollback |
| Fields and validation | Full pipeline path and choose-folder action | Metadata editing, search, numeric parameters; native folder dialog remains an adapter concern |
| Dialogs | Existing save/delete flows | Focus containment, return focus, nested/protected surface policy |
| Menus | Existing Actions/context menus | Submenus, disabled commands, pointer and keyboard behavior |
| Popovers / anchored utility panels | Keyboard map and Activity and Errors | Collision handling, exclusivity, focus transfer, viewport changes |
| Tooltips | Icon-only utility hints | Hover and focus parity; no essential information available only on hover |
| Status/progress and error presentation | Busy/success/error indicator, retained history | Recovery, details, copy, retry and unresolved retention stay local application behavior |
| Tabs / segmented controls | Potential screen navigation presentation | Do not replace the screen-registration contract with library routing |
| Virtualized lists or grids | Not required to replace current mounted video grid | Large clip/search lists; preserve media identity and playback before considering virtualization |
| Keyboard-command surfaces | Read-only contextual map with static `kbd` tokens | Future discoverability; no remapping or command palette added by this plan |
| Media-editor primitives | No movie editor in this milestone | Slider/range slider, number input, timeline marks, progress; exact frame/range semantics remain application-owned |
| Scroll regions / disclosure | Activity overflow and technical details | Arrow/Page/Home/End navigation and overflow cues without visible scrollbar gutter |

The future rows drive breadth assessment, not authorization to implement those features. Neither a tree nor a catalog count is a sufficient shortlist criterion. No general UI library is expected to own prepared-review identity, playback, extraction, persistence, or application error retention.

## Classification and longlist

Classes: **R** cohesive styled runtime system; **W** framework-agnostic Web Components; **H** headless/behavior primitives; **C** copy-and-own source/gallery; **S** specialized component; **N** native/local baseline. A candidate can span categories.

| Candidate | Class / ownership | Disposition and reason | Confidence |
|---|---|---|---|
| Web Awesome | W/R; packaged upstream controls | Full MS2 contender: broad ready-made control family, theming hooks, no application-framework migration. Confirm free versus paid coverage and asset packaging. | Medium pending spike |
| Spectrum Web Components | W/R; Adobe packages | Full MS2 contender: coherent accessibility-oriented creative-tool system; compare density and cost of normalizing Adobe visual conventions. | Medium pending spike |
| Zag | H; upstream machines plus locally owned DOM/styles | Full MS2 contender: broad unstyled behavior and published vanilla adapter; substantially different control-ownership tradeoff. Vanilla documentation and major-version transition are risks. | Medium |
| Lion | W/H; upstream base classes plus locally owned styled subclasses | Reserve contender: strong form/overlay foundation and design freedom; more local composition work and narrower editing/navigation breadth than the initial three. Not excluded for lacking a tree. | Medium |
| Vaadin Web Components | W/R; upstream packages, mixed free/commercial catalog | Reserve / targeted future data-component contender: strong complex fields and data components; weigh commercial boundaries and visual normalization against lighter shell needs. | Medium |
| Astryx | R/C; React system with source ejection | Required research retained; no runtime spike under the framework-free constraint. Source ownership does not remove React runtime assumptions. | High on architecture gate |
| Semantic UI | R; global CSS/JS framework | Required research retained; defer: jQuery-era integration, slow core release history, broad styling surface and accessibility validation burden. | High compatibility facts, medium fit |
| UIverse | C; independently contributed copied elements | Required research retained; reference-only / potential named exception. Not one governed accessible runtime ecosystem; every copied element needs individual license and behavior checks. | High ownership facts |
| Shoelace | W/R; legacy upstream family | Do not create a second predecessor spike beside Web Awesome; migration/maintenance history is evidence for the successor's evaluation. | High on duplication rationale |
| FAST | W/H; element-authoring runtime, older ready-made catalog | Defer: current FAST Element is an authoring layer, while the published `fast-components` catalog is old. Not equivalent to a current turnkey control suite. | High version distinction |
| Bootstrap | R; CSS plus vanilla JS | Defer: mature general-purpose forms/dialog/menu baseline, but whole-page styles and custom complex-control work give a weaker workbench fit. No tree-only exclusion. | Medium |
| Floating UI DOM | S/H; upstream positioning, local interaction ownership | Conditional focused MS2 exception if chosen primary/local positioning fails collision cases; not a complete accessibility or component system. | High scope, medium need |
| SortableJS | S; upstream pointer/touch sorting | Defer to future drag/drop scope: existing reorder already works, and keyboard accessibility is unresolved in sampled upstream discussion. | Medium |
| Native HTML/CSS and local controllers | N; project owns all composed behavior | Mandatory full MS2 baseline. Best direct architectural fit and visual control; complex interaction QA and maintenance remain ours. | High fit; behavior unproven |

## Broader candidate evidence

All version, commit, and sample dates below were retrieved on 2026-09-06. Package versions are research anchors, not production pins. These observations complement the two linked detailed evidence files.

### Nominated and seed candidate anchors

| Candidate | Observed package/license anchor | Lifecycle or scope qualification |
|---|---|---|
| Astryx | `@astryxdesign/core` 0.5.2, 2026-08-30; MIT; React/React DOM >=19 and StyleX peers | Public beta; ejection copies React source, not framework-free controls. [Registry](https://registry.npmjs.org/@astryxdesign%2Fcore) |
| Semantic UI | `semantic-ui` 2.5.0, 2022-10-06; MIT | Interactive modules use jQuery; global CSS and old install tooling need separate cost review. [Registry](https://registry.npmjs.org/semantic-ui) |
| UIverse | Gallery / Galaxy MIT source; no unified runtime version | Website-mediated curation and copied-source maintenance; archive cadence does not establish current site cadence. [Official archive](https://github.com/uiverse-io/galaxy) |
| Web Awesome | `@awesome.me/webawesome` 3.12.0, 2026-08-21; MIT package | Free package license does not settle Pro-component or third-party asset rights. [Registry](https://registry.npmjs.org/@awesome.me%2Fwebawesome) |
| Spectrum | `@spectrum-web-components/button` 1.12.2, 2026-07-06; Apache-2.0 | Gen1 and Gen2 have separate package groups and lifecycles; compare stable Gen1 without attributing Gen2 features to it. [Registry](https://registry.npmjs.org/@spectrum-web-components%2Fbutton), [official release guide](https://github.com/adobe/spectrum-web-components/blob/main/CONTRIBUTOR-DOCS/01_contributor-guides/06_releasing-swc.md) |
| Vaadin | `@vaadin/button` 25.2.10, 2026-09-03; Apache-2.0 | A free button package does not establish free use of the whole catalog. Check each actual component's license. [Registry](https://registry.npmjs.org/@vaadin%2Fbutton) |

The linked evidence records cover each candidate's component coverage, theming, accessibility, governance, release/commit cadence, issue/PR samples, security policy, documentation, community signals, upgrades and offline plausibility. Root independently rechecked the package anchors above, Astryx's React requirement, Galaxy's copy/PR policy, selected issue/PR evidence, and Spectrum's generation boundary. No source assertion is substituted for application QA.

### Lion

- **Runtime, breadth, theming:** [official repository](https://github.com/ing-bank/lion) exposes Lit-based ES modules and extendable Web Component classes. [Catalog](https://lion.js.org/components/) includes forms, combobox/select, dialog, tooltip, tabs and collapsible building blocks. Styling is intentionally minimal; Clip Sandbox would own styled subclasses and unsupported shell/media pieces. Framework-free Electron use is plausible, not tested.
- **Accessibility and documentation:** [principles](https://lion.js.org/guides/principles/) and [homepage](https://lion.js.org/) describe automated accessibility checks and manual screen-reader testing. This is stronger process evidence than an unlabeled marketing badge, not proof of our composed controls. Guides explain extension, but the README records documentation migration and an existing collapsible-demo error; evaluate example reliability.
- **License, governance, adoption:** ING's public repository; MIT per repository and [registry](https://registry.npmjs.org/@lion%2Fui). About 1,962 stars at retrieval; no verified production-user count. Institutional provenance is not a support guarantee. No `SECURITY.md` was found at root or `.github` on the default branch; policy/support assurance remains unverified.
- **Release and maintenance:** `@lion/ui` 0.21.1 published 2026-09-04; preceding 0.21.0 on 2026-08-20; default-branch commit 2026-09-04. [Releases](https://github.com/ing-bank/lion/releases). Still pre-1.0. [Keyboard date-picker issue #2418](https://github.com/ing-bank/lion/issues/2418) opened 2024-11-22 and closed 2026-09-04 with six comments: maintenance exists, but this sample took almost two years to close, not evidence of fast resolution.
- **Upgrade/dependency cost:** the current aggregate UI package declares Lit, Popper, localization and specialized form dependencies; imported cost must be measured rather than inferred from the aggregate dependency list. Confidence: high observed facts; medium reserve decision.

### Zag

- **Runtime, component coverage, ownership:** [repository](https://github.com/chakra-ui/zag) and [catalog](https://zagjs.com/overview/introduction) expose state-machine behavior including tree, splitter, menus, combobox, dialog, popover, switch, tabs, progress and range/media-adjacent controls. Local controllers still own DOM, styling and integration. [Vanilla example](https://github.com/chakra-ui/zag/tree/main/examples/vanilla-ts) and [adapter source](https://github.com/chakra-ui/zag/tree/main/packages/frameworks/vanilla) establish a real non-React path.
- **Theming/accessibility/docs:** unstyled behavior can use our tokens directly. Upstream claims accessibility-oriented interactions; [installation docs](https://zagjs.com/overview/installation) foreground React/Vue/Solid/Svelte and do not document the vanilla path equally well. MS2 must establish cleanup, subscriptions, attribute/event binding and focus semantics without introducing another UI framework. Catalog presence does not prove every component's vanilla example.
- **Governance/license/community:** Chakra organization, author Segun Adebayo named in adapter package; MIT; approximately 5,203 stars. This is an identifiable project with a concentration risk, not a formal support contract. Root and `.github/SECURITY.md` were absent in the checked branch; disclosure process remains unverified.
- **Releases/maintenance:** [vanilla registry](https://registry.npmjs.org/@zag-js%2Fvanilla) and [dialog registry](https://registry.npmjs.org/@zag-js%2Fdialog): stable 1.43.3 on 2026-08-20. Default-branch commit 2026-09-04; [releases](https://github.com/chakra-ui/zag/releases) also expose 2.0.0-next.2 packages dated 2026-08-31. Do not mix stable and next package families. [PR #3308](https://github.com/chakra-ui/zag/pull/3308), opened September 1 and updated September 6, is an automated next-release PR; it establishes release workflow activity, not human issue responsiveness. The sampled new issue had no comments; a reliable response rate is unknown.
- **Fit inference:** useful contender because unstyled broad behavior tests a different strategy from ready-made controls. Extra DOM glue and the upcoming major migration may outweigh styling savings. Local/offline bundling is plausible; no install or strict TypeScript test has run. Confidence: medium shortlist decision.

### FAST

- **Runtime/breadth/theming:** [current introduction](https://fast.design/docs/introduction) describes an element-authoring layer with templates and style composition. It is framework-independent but does not by itself supply ready-made accessible controls. Historical `fast-components` breadth must not be assigned to current `fast-element` as if they were one package.
- **Release evidence:** [element registry](https://registry.npmjs.org/@microsoft%2Ffast-element) reports 3.0.2, 2026-07-29; [components registry](https://registry.npmjs.org/@microsoft%2Ffast-components) reports 2.30.6, 2022-05-06, with dependencies on the older element/foundation generation. Default-branch commit 2026-09-01. The newest GitHub release sampled was a test harness, not a new control catalog. Docs retrieved still labeled their introduction 2.x; check version-matched migration documentation before any later evaluation.
- **Governance/license/security/community:** Microsoft-owned, about 9,671 stars. GitHub's license classifier returned `NOASSERTION`, but the [actual LICENSE](https://github.com/microsoft/fast/blob/main/LICENSE) says MIT, consistent with registry metadata. [Security policy](https://github.com/microsoft/fast/blob/main/SECURITY.md) routes disclosure to MSRC. [Dependency PR #7688](https://github.com/microsoft/fast/pull/7688) was open with one comment, not sufficient human-response evidence.
- **Inference:** plausible offline substrate if we were building a component platform, but it adds authoring machinery without resolving the immediate controls. Accessibility remains the component author's responsibility. Defer rather than confusing runtime activity with catalog maintenance. Confidence: high on package distinction, medium fit.

### Bootstrap

- **Runtime/coverage:** [repository](https://github.com/twbs/bootstrap) provides CSS and JavaScript controls; v5 no longer requires jQuery. Forms, switches, dialogs, menus, popovers/tooltips, progress, tabs and collapse cover ordinary shell controls; searchable combobox, virtualized media grid, rich tree and editor behavior still require other/local work. [Migration guide](https://getbootstrap.com/docs/5.3/migration/) documents substantial v4-to-v5 changes.
- **Theming/accessibility:** [CSS variables](https://getbootstrap.com/docs/5.3/customize/css-variables/) and Sass allow customization, but global styling needs containment. [Accessibility guidance](https://getbootstrap.com/docs/5.3/getting-started/accessibility/) explicitly puts semantic implementation and contrast responsibility on authors. Documentation is broad and versioned; it does not certify the final dark-theme application.
- **License/governance/security:** MIT code, Bootstrap team/open contributions, approximately 174,725 stars. [Security policy](https://github.com/twbs/bootstrap/blob/main/SECURITY.md) specifies private email reporting. Documentation/assets have their own notices; do not copy branding or assume the code license covers every asset.
- **Release/maintenance:** [registry](https://registry.npmjs.org/bootstrap) and [release](https://github.com/twbs/bootstrap/releases/tag/v5.3.8): 5.3.8 on 2025-08-26; preceding 5.3.7 on 2025-06-17; default-branch commit 2026-09-01. Recent commits alongside a year-old stable release do not imply abandonment. [PR #42909](https://github.com/twbs/bootstrap/pull/42909) closed seconds after opening with no comments; this is not evidence of thoughtful review or a fix. Human issue responsiveness remains insufficiently sampled.
- **Fit inference:** offline local distribution plausible; dropdown/popover paths involve Popper. Mature broad alternative but weaker design containment and specialized workbench coverage than shortlisted options. Confidence: medium exclusion from initial spikes.

### Floating UI DOM

- **Scope/runtime:** [getting started](https://floating-ui.com/docs/getting-started) explicitly separates vanilla DOM positioning from React interaction helpers. `@floating-ui/dom` anchors and avoids viewport collisions; it does not supply focus traps, accessible menus, fields, trees, panels or error history. Visuals and lifecycle remain local.
- **Ownership/license/docs:** independent Floating UI project; MIT [repository](https://github.com/floating-ui/floating-ui), approximately 32,723 stars, modular API docs and a [Popper migration guide](https://floating-ui.com/docs/migration). Dependency-specific ownership is narrower than a whole suite. Root and `.github/SECURITY.md` absent in checked branch; formal response policy unknown.
- **Release/maintenance:** [registry](https://registry.npmjs.org/@floating-ui%2Fdom): 1.8.0 on 2026-07-11; default-branch commit 2026-08-26. [Issue #3502](https://github.com/floating-ui/floating-ui/issues/3502) opened September 3 and closed September 4 with one comment, showing recent handling of a positioning-performance report; closure alone does not prove a shipped correction.
- **Fit inference:** strong named exception if collision handling defeats local/native or primary-library utilities. Plausible local/offline module, with core/utils dependencies; cost and Electron behavior unmeasured. No reason to add it if the primary already solves positioning. Confidence: high scope, medium conditional recommendation.

### SortableJS

- **Runtime/coverage/theming:** [official repository](https://github.com/SortableJS/Sortable) exposes framework-free drag sorting, groups, handles and events. Local styles control ghost/selected classes. It is a specialized pointer/touch list primitive, not a tree, menu or accessible keyboard-command system. Do not equate its DOM movement with our durable reorder/file-operation rules.
- **License/governance/docs:** MIT; SortableJS community project, approximately 31,177 stars. Detailed options/events and framework integration links show mature documentation; maintainer continuity and response guarantees are unverified. No security file found in checked root or `.github` locations.
- **Release and maintenance:** [registry](https://registry.npmjs.org/sortablejs) and [releases](https://github.com/SortableJS/Sortable/releases): 1.15.7 on 2026-02-11, previous 1.15.6 on 2024-11-28; default-branch commit 2026-03-24. [Accessibility issue #1951](https://github.com/SortableJS/Sortable/issues/1951) remains open from 2020-10-28 with four comments. This is a specific unresolved accessibility concern, not proof that every use is inaccessible. Recent issue #2475 and PR #2476 were open without comments in the small sample.
- **Fit inference:** local/offline use plausible with no declared runtime dependencies. Do not displace existing reorder during shell work without a demonstrated component advantage and keyboard alternative. Revisit when actual cross-panel drag/drop is specified. Confidence: medium deferral.

### Native/local baseline

Native buttons, fields, select, checkbox/switch semantics, `dialog`, disclosure, CSS layout/transitions and local class-backed controls provide the baseline. Use [WAI-ARIA APG patterns](https://www.w3.org/WAI/ARIA/apg/patterns/) as behavioral references, not as a copy-and-ship widget library or conformance certificate. Complex tree/combobox/focus/virtualization behavior costs real local effort. No additional runtime/license/governance lifecycle is introduced; existing project and Electron/Chromium upgrade ownership remains. Accessibility, security, motion, issue response and migration quality are our responsibility. Offline plausibility is high because the current app already uses this shape; new shell behavior is untested.

### Shoelace legacy qualification

[Shoelace's official repository](https://github.com/shoelace-style/shoelace) was archived on 2026-05-14 and explicitly states that development and new issues/PRs belong at Web Awesome. Its [registry](https://registry.npmjs.org/@shoelace-style%2Fshoelace) still publishes MIT 2.20.1, dated 2025-03-11. It is a Lit-based, CSS-themable Web Component suite with forms, overlays and navigation, historical accessibility claims, documentation and a visible security-policy link. None establishes continuing fixes after sunset; current security response and recent pre-archive commit timing were not separately established. Local offline use remains technically plausible. Historical popularity and broad controls do not outweigh the explicit maintenance end for a new dependency. Migration changes packages, tag/event names and control APIs; use the [actual migration guide](https://webawesome.com/docs/resources/migrating-from-shoelace). Confidence: high exclusion based on upstream sunset, not on inferred inactivity.

## Shortlist for MS2 and stop gate

Proposed first comparison: **Web Awesome, Spectrum Web Components, Zag, and the native/local baseline**. This tests ready-made general controls, a cohesive creative-tool design system, unstyled behavior with local rendering, and zero-library implementation. **Lion and Vaadin** remain evidence-backed reserves if the initial candidates fail on style ownership, form quality or richer data requirements. **Floating UI DOM** is a conditional component exception, not a fourth primary ecosystem.

For each primary contender, MS2 must use the plan's same tree data, Settings controls, popover, dialog, menu, tooltip and status/progress scenario. Unsupported controls must be labeled local work with their implementation effort counted, not silently replaced by another library. Compare whole-ecosystem health separately from component quality. The common gate is framework-free/offline Electron operation, strict TypeScript integration, keyboard/focus behavior, visual normalization, package/import cost, and lifecycle stability. Research accessibility claims do not pass this gate.

Particular uncertainties to resolve:

1. Web Awesome: evaluate the free set explicitly. Combobox, Data Grid and Video are Pro (the latter two experimental); do not assume these future needs are covered by the MIT package. Verify local icon/assets and release/migration stability.
2. Spectrum: pin the generation explicitly. Stable Gen1 uses `@spectrum-web-components/*` and `<sp-*>`; the repository is developing Gen2 `@adobe/spectrum-wc` / `<swc-*>` separately. Test stable Gen1 as a migration-risk candidate, not proof of Gen2 maturity. Verify local font/icon delivery, density and token overrides without private CSS.
3. Zag: whether vanilla DOM wiring stays small and maintainable; use one stable package family and do not drift into 2.x prereleases.
4. Baseline: actual complexity of focus, keyboard navigation and collision handling, not just its zero package size.
5. All: interrupted transitions, reduced motion, nested/protected focus, screen switching, and avoiding mounted-video/grid disruption.

No weighted numeric ranking is claimed before comparable spikes. Prefer one primary ecosystem plus local controls. Any second runtime or copied element needs a named advantage, license/asset review, removal path, upgrade owner and proof that typography, color, radius, density, focus and motion fit `DESIGN.md`.

**Stop after MS1:** review this shortlist before starting installations or working spikes in MS2. MS3 shell sandbox and production milestones have not begun.
