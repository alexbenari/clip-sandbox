# Web-component ecosystem evidence: Web Awesome, Spectrum, and Vaadin

Research date: **2026-09-06**
Scope: evidence packet for Milestone 1 of the application-shell plan. This is source gathering, not an adoption decision. No package was installed and no component was run, bundled, styled, or tested in Electron.

## Method and confidence

The comparison uses vendor documentation, vendor-owned source repositories, GitHub release and activity pages, and npm registry metadata. Repository/release facts were checked live on 2026-09-06. Component coverage means that an official component or documented primitive was found; it does not mean the component satisfies Clip Sandbox's behavior, visual, performance, or accessibility acceptance criteria.

Confidence labels:

- **High**: directly stated by a current official page, source file, release, or package record.
- **Medium**: a bounded inference from multiple official facts, such as offline Electron plausibility from local npm imports and supported Chromium.
- **Low/unknown**: no direct official proof was found, or a sample is too small to generalize.

GitHub issue and pull-request observations are deliberately samples, not service-level statistics. Star and fork counts are point-in-time community signals, not quality measures.

## Coverage snapshot

| Need | Web Awesome 3 | Spectrum Web Components (first generation) | Vaadin Web Components 25 |
|---|---|---|---|
| Hierarchical tree/navigation | Free stable Tree/Tree Item | Sidenav, but no tree component found in the catalog | Tree Grid (hierarchical tabular data); Side Nav |
| Foldable/split panels | Free stable Split Panel; Drawer/Details | Split View is resizable, collapsible, and keyboard operable | Split Layout; responsive Master-Detail Layout |
| Drag/drop targets | No general free dropzone found; File Input is Pro | Dropzone | Upload and Grid/Tree Grid drag-and-drop; no general-purpose dropzone found |
| Buttons/icon buttons | Button and icon support | Button, Action Button, Clear/Close buttons | Button and icon components |
| Select/searchable combobox | Select is free; Combobox is Pro | Picker, Search, Combobox | Select, Combo Box, Multi-Select Combo Box |
| Switch/fields/forms | Broad form set; some advanced fields are Pro | Broad fields, checkbox/radio, switch, picker set | Very broad enterprise form set |
| Menus | Dropdown with keyboard navigation, submenus, checkable items | Menu and Action Menu | Context Menu, Menu Bar, List Box |
| Popovers/tooltips | Popover, Popup, Tooltip | Overlay/trigger APIs, Popover, Tooltip | Popover, Tooltip |
| Dialogs | Dialog and Drawer | Dialog, Alert Dialog, Modal/Tray primitives | Dialog and Confirm Dialog |
| Status/progress | Badge, Callout, Progress Bar/Ring, Spinner, Toast | Alert Banner, Status Light, Meter, Progress Bar/Circle, Toast | Notification, Message List, Progress Bar |
| Tabs | Tab Group | Tabs and Tabs Overflow | Tabs and Tab Sheet |
| Virtualized list/grid | Free Scroller is overflow assistance, not virtualization; virtualized Data Grid is Pro and experimental | Table documents virtualized mode; no standalone virtual-list component found | Grid and free Virtual List; Tree Grid uses Grid |
| Media/editor primitives | Animated Image, Comparison, Carousel, Zoomable Frame are free; Video/Playlist are Pro and experimental | Asset, Thumbnail, Slider, color controls; no audio/video player found | Slider, Upload, Grid DnD; no audio/video player found |
| Dedicated command palette | None found | None found | None found |

Coverage sources: [Web Awesome component catalog](https://webawesome.com/docs/components) (accessed 2026-09-06), [Web Awesome Data Grid](https://webawesome.com/docs/components/data-grid) (Pro, experimental, since 3.11; accessed 2026-09-06), [Spectrum catalog](https://opensource.adobe.com/spectrum-web-components/) (accessed 2026-09-06), [Spectrum Split View](https://opensource.adobe.com/spectrum-web-components/components/split-view/) (accessed 2026-09-06), [Spectrum Table](https://opensource.adobe.com/spectrum-web-components/components/table/) (accessed 2026-09-06), [Vaadin catalog](https://vaadin.com/docs/latest/components) (accessed 2026-09-06), [Vaadin repository component/license list](https://github.com/vaadin/web-components) (accessed 2026-09-06), and [Vaadin Virtual List](https://vaadin.com/docs/latest/components/virtual-list) (accessed 2026-09-06).

## Web Awesome

### Runtime, framework, and ownership

Web Awesome is a framework-friendly Web Component system built with Lit. The official repository says it works with all frameworks and is built by the Font Awesome organization; npm package metadata for `@awesome.me/webawesome` 3.12.0 lists Lit and Floating UI among runtime dependencies. Consumers can import individual component modules, use an autoloader, or self-host the distribution. Evidence: [official repository](https://github.com/shoelace-style/webawesome), [installation](https://webawesome.com/docs/), and [Split Panel import examples](https://webawesome.com/docs/components/split-panel) (accessed 2026-09-06). **Confidence: high.**

Ownership is a cohesive runtime library: consumers own their application markup and theme overrides, while Fonticons/Font Awesome owns the component implementation. It is not a copy-and-own gallery. **Confidence: high.**

### Breadth and fit questions

The current catalog advertises more than 80 components. Its free line has unusually direct matches for this shell: Tree, Split Panel, Dialog, Drawer, tabs, dropdowns, popover/popup, tooltip, progress, switches, fields, and several media-adjacent elements. However, three potentially important items cross the paid boundary: Combobox, the virtualized Data Grid, and Video/Video Playlist. Data Grid and Video are also marked experimental, so their presence should not be treated as stable coverage. The free Scroller improves discovery and accessibility of overflow but is not documented as a virtualization engine. Evidence: [catalog](https://webawesome.com/docs/components), [Tree](https://webawesome.com/docs/components/tree/), [Split Panel](https://webawesome.com/docs/components/split-panel), [Data Grid](https://webawesome.com/docs/components/data-grid), and [Video](https://webawesome.com/docs/components/video) (accessed 2026-09-06). **Confidence: high.**

No official waveform, timeline/scrubber, frame strip, range-selection, or NLE-style media primitive was found. Slider, Comparison, Zoomable Frame, Resize Observer, and Intersection Observer are possible building blocks, not evidence of editor semantics. **Confidence: high for catalog absence; medium for the inference.**

### Theming

Web Awesome exposes themes, design tokens, CSS custom properties, CSS parts, light/dark modes, and component-level customization. The default and Shoelace themes are free; several additional themes and theme-building assets are Pro. This appears mechanically compatible with Clip Sandbox's custom dark palette and radius/spacing vocabulary, but the cost and fragility of overriding all selected components remain untested. Evidence: [theming overview](https://webawesome.com/docs/theming-overview), [customizing and theming](https://webawesome.com/docs/customizing/), and [visual tests](https://webawesome.com/docs/resources/visual-tests) (accessed 2026-09-06). **Confidence: high for mechanisms; unknown for achieved visual fidelity.**

### Accessibility: claim versus proof

The vendor avoids a blanket compliance claim and describes accessibility as ongoing work. Contributor rules require at least one automated accessibility assertion per component scenario and note that the check covers only visible/rendered DOM, so multiple tests may be needed. That is stronger evidence than marketing copy, but it is not a published VPAT, WCAG conformance table, or independent audit. Evidence: [accessibility commitment](https://webawesome.com/docs/resources/accessibility) and [contributing/testing rules](https://webawesome.com/docs/resources/contributing) (accessed 2026-09-06). **Confidence: high for process evidence; unknown for Clip Sandbox behavior and complete WCAG conformance.**

### License and commercial boundary

The free repository and `@awesome.me/webawesome` package are MIT licensed. Pro components/assets use a separate seat-based commercial agreement. The Pro terms allow integration into applications, restrict standalone redistribution, distinguish perpetual and limited plans, and state that some limited plans may prohibit use after subscription termination. The exact plan and rights therefore need legal/procurement review before a Pro component is treated as durable product infrastructure. Evidence: [repository license](https://github.com/shoelace-style/webawesome/blob/next/LICENSE.md), [Pro license](https://webawesome.com/license/pro/), and [catalog Pro labels](https://webawesome.com/docs/components) (accessed 2026-09-06). **Confidence: high; this is a factual summary, not legal advice.**

### Governance, activity, responsiveness, and security

The repository is owned by `shoelace-style` and identifies Font Awesome as the builder. On 2026-09-06 the GitHub API reported about 1.3k stars, 189 forks, and recent commits on 2026-09-02 and 2026-09-01. The latest stable package/repository release found was **3.12.0**, published **2026-08-21**; the docs footer also showed 3.12.0. Evidence: [repository](https://github.com/shoelace-style/webawesome), [v3.12.0 release](https://github.com/shoelace-style/webawesome/releases/tag/v3.12.0), [recent commit f1981f7](https://github.com/shoelace-style/webawesome/commit/f1981f73d9c53977108da7d30ed90c6a3eda8145), and [npm package](https://www.npmjs.com/package/@awesome.me/webawesome/v/3.12.0) (checked 2026-09-06). **Confidence: high.**

Responsiveness sample: issue [#2527](https://github.com/shoelace-style/webawesome/issues/2527) opened 2026-06-20; maintainer PR [#2529](https://github.com/shoelace-style/webawesome/pull/2529) was reviewed and merged on 2026-06-22, closing the issue. This demonstrates a two-day response for one small visual bug, not a general response-time guarantee. **Confidence: high for the sample; low for generalization.**

The repository has a public [security policy](https://github.com/shoelace-style/webawesome/security/policy) directing private reports to Font Awesome support and promising updates, but it gives no numeric acknowledgement or remediation target. **Confidence: high.**

Documentation is extensive, searchable, versioned in its footer, and includes per-component API/import/style sections, framework guidance, changelog, visual tests, and contribution guidance. GitHub Discussions and the repository provide public community channels. **Confidence: high for presence; unknown for support quality at scale.**

### Upgrade history and Shoelace relationship

Shoelace is the legacy predecessor and is now explicitly sunset: its repository accepts no new issues or feature work and directs users to Web Awesome. Web Awesome 3 changes package/tag names and behavior, and ships a dedicated migration guide plus a compatibility-oriented `shoelace` theme. The current changelog records significant changes to dropdown composition, theme scoping, component custom properties, and Split Panel's orientation API. This is a real migration, not merely a rebrand. Evidence: [sunset Shoelace repository](https://github.com/shoelace-style/shoelace), [Web Awesome releases](https://github.com/shoelace-style/webawesome/releases), [migration guide](https://webawesome.com/docs/resources/migrating-from-shoelace), and [changelog](https://webawesome.com/docs/resources/changelog) (accessed 2026-09-06). **Confidence: high.**

### Offline Electron plausibility

The npm/self-hosted import path and documented system icon library make a network-free renderer bundle plausible. Default icons can otherwise use a resolver that fetches remote assets, so a spike must verify base-path and icon resolution with networking disabled. Pro components also require confirming how licensed packages and assets are delivered and whether any runtime authentication occurs. No Electron/CSP/package test was performed. **Confidence: medium.**

## Adobe Spectrum Web Components

### Runtime, framework, and ownership

The broad published line uses standards-based custom elements, TypeScript, and LitElement and is documented as usable with any framework or no framework. Components are individually importable npm packages and can also be consumed through a bundle. Adobe's repository says a core Adobe Design Engineering team develops the project, primarily for Adobe product teams, while accepting outside contributions. Evidence: [official documentation](https://opensource.adobe.com/spectrum-web-components/), [getting started](https://opensource.adobe.com/spectrum-web-components/getting-started/), [development guide](https://opensource.adobe.com/spectrum-web-components/guides/adding-component/), and [repository](https://github.com/adobe/spectrum-web-components) (accessed 2026-09-06). **Confidence: high.**

Ownership is a cohesive runtime implementation of Adobe Spectrum, not a headless or copy-and-own system. **Confidence: high.**

### Breadth and fit questions

The first-generation `sp-*` catalog covers most ordinary shell needs: buttons, combobox/search/picker, form controls, menus/action menus, overlay triggers, popovers, dialogs, dropzone, progress/status, tabs, side navigation, and a resizable/collapsible Split View whose separator is keyboard operable. The Table supports a documented virtualized mode. No tree component was found; Sidenav is hierarchical navigation only if application composition supplies that behavior, and Table is not documented as a tree grid. No audio/video player, timeline, waveform, or media transport was found. Asset, Thumbnail, Slider, color controls, and action surfaces are only lower-level editor building blocks. Evidence: [catalog](https://opensource.adobe.com/spectrum-web-components/), [Split View](https://opensource.adobe.com/spectrum-web-components/components/split-view/), and [Table](https://opensource.adobe.com/spectrum-web-components/components/table/) (accessed 2026-09-06). **Confidence: high.**

### Theming

`sp-theme` supplies scoped Spectrum design tokens and manages system, light/dark color, scale, and directionality. The documented systems are Spectrum, Express, and Spectrum 2. CSS custom properties exist, but the implementation is intentionally an expression of Adobe's design system, and the styling guide separates generated Spectrum CSS from system overrides. Reproducing Clip Sandbox's distinctive navy gradients, radii, compact density, and single projector-blue rule may therefore require more than token substitution; that is a spike question, not a proven mismatch. Evidence: [Theme API](https://opensource.adobe.com/spectrum-web-components/tools/theme/api/), [styles/token documentation](https://opensource.adobe.com/spectrum-web-components/tools/styles/), and [styling guide](https://opensource.adobe.com/spectrum-web-components/guides/styling-components/) (accessed 2026-09-06). **Confidence: high for mechanisms; medium for fit concern.**

### Accessibility: claim versus proof

Adobe labels the library “accessible by default” and describes keyboard, screen-reader, and contrast support. Stronger proof exists in the repository: dedicated Playwright accessibility configurations, per-component accessibility sections, Storybook scenarios, and release notes that name WCAG/axe fixes. For example, Table documents accessible labels and keyboard behavior for virtualized selection. These are test/process artifacts, not an independent conformance report, and current open issues include keyboard and overlay defects. Evidence: [homepage claim](https://opensource.adobe.com/spectrum-web-components/), [Playwright accessibility configuration](https://github.com/adobe/spectrum-web-components/blob/main/playwright.a11y.config.ts), [Table accessibility](https://opensource.adobe.com/spectrum-web-components/components/table/), and [open issues](https://github.com/adobe/spectrum-web-components/issues) (accessed 2026-09-06). **Confidence: high for evidence presence; unknown for complete conformance and Clip Sandbox composition.**

### License

The repository and almost all checked first-generation component packages are Apache-2.0 and publicly usable, including commercial applications. One notable metadata exception is the required/recommended `@spectrum-web-components/theme` package, whose npm and current source `package.json` declare **ISC**, while the repository root is Apache-2.0. Both are permissive, but an adoption record should capture the actual package-level license set rather than saying the entire dependency graph is uniformly Apache-2.0. No paid component tier was found. Evidence: [root license](https://github.com/adobe/spectrum-web-components/blob/main/LICENSE), [npm bundle](https://www.npmjs.com/package/@spectrum-web-components/bundle/v/1.12.2), and [theme package source](https://github.com/adobe/spectrum-web-components/blob/main/1st-gen/tools/theme/package.json) (checked 2026-09-06). **Confidence: high.**

### Governance, activity, responsiveness, and security

On 2026-09-06 the GitHub API reported about 1.5k stars, 261 forks, and commits through 2026-09-04. The latest stable first-generation GitHub release and npm bundle found were **1.12.2**, released **2026-07-06**. The documentation built from `main` already displayed 1.12.3 on some component pages while npm still returned 1.12.2, so documentation version text is not a safe stable-release oracle. Evidence: [v1.12.2 release](https://github.com/adobe/spectrum-web-components/releases/tag/v1.12.2), [recent commit 655df6c](https://github.com/adobe/spectrum-web-components/commit/655df6c24b639add5ed13d4e6fe805404ff90858), [npm bundle](https://www.npmjs.com/package/@spectrum-web-components/bundle/v/1.12.2), and [Split View docs](https://opensource.adobe.com/spectrum-web-components/components/split-view/) (checked 2026-09-06). **Confidence: high.**

Responsiveness sample: release PR [#6470](https://github.com/adobe/spectrum-web-components/pull/6470) received code-owner review and approval and merged on 2026-07-06. Conversely, Windows Dropzone issue [#6251](https://github.com/adobe/spectrum-web-components/issues/6251), opened 2026-05-08, still appeared open on 2026-09-06 even though its body references a fix PR; the issue's status/linkage is internally inconsistent. The public issue list also shows accessibility/menu/overlay reports open for weeks or months. This mixed sample supports active triage and merging but not consistently fast public issue closure. **Confidence: high for samples; low for generalization.**

The repository has a public [security policy](https://github.com/adobe/spectrum-web-components/security/policy) routing reports to Adobe's private vulnerability process and disclosure policy. It does not state a component-specific response target. **Confidence: high.**

Documentation has per-component examples/API/changelog, Storybook, migration and deprecation guides, support/compatibility rules, and a public issue/discussion surface. The repository explicitly says internal Adobe teams are the primary users, which is a meaningful adoption signal but does not quantify external community usage. **Confidence: high.**

### Upgrade history and generation transition

The stable first-generation line reached 1.0 on 2024-10-31 and adopted semantic versioning; official guides cover the earlier Lit 2 migration, Overlay API changes, Spectrum 2 tokens, and component removals/deprecations. More materially, the same repository now carries two independently versioned generations: first-generation `@spectrum-web-components/*` / `sp-*` packages and second-generation `@adobe/spectrum-wc` / `swc-*`. Adobe provides a Gen1-to-Gen2 coexistence/migration skill, and the release guide publishes the two generations separately. Current pull requests show substantial Gen2 component migration work. Therefore, first-generation breadth is proven, while second-generation breadth, release maturity, and final migration cost remain unknown and must be evaluated separately. Evidence: [1.0 migration](https://opensource.adobe.com/spectrum-web-components/migrations/2024-10-31%20%281.0.0%29/), [support/versioning policy](https://opensource.adobe.com/spectrum-web-components/support-and-compatibility/), [Gen1-to-Gen2 guidance](https://opensource.adobe.com/spectrum-web-components/build-with-ai/), [release strategy](https://github.com/adobe/spectrum-web-components/blob/main/CONTRIBUTOR-DOCS/01_contributor-guides/06_releasing-swc.md), and [current pull requests](https://github.com/adobe/spectrum-web-components/pulls) (accessed 2026-09-06). **Confidence: high.**

### Offline Electron plausibility

Individual npm imports and local theme modules make a fully bundled, offline renderer plausible, and the library targets modern browser standards compatible in principle with Electron's Chromium renderer. A spike must still verify the exact generation, tree-shaking/bundle behavior, font/icon asset paths, custom-element registration conflicts, CSP, and whether Spectrum 2/Gen2 requires different packaging. No Electron or offline test was performed. **Confidence: medium.**

## Vaadin Web Components

### Runtime, framework, and ownership

Vaadin's client-side components are standards-based custom elements implemented with Lit and published as individual `@vaadin/*` npm packages. The official docs expose TypeScript APIs/source and Lit examples alongside React and Java/Flow examples. This means the components can be consumed without adopting the server-side Java framework, although Vaadin's documentation and product lifecycle are broader than the standalone client packages. Evidence: [repository](https://github.com/vaadin/web-components), [component catalog](https://vaadin.com/docs/latest/components), [Tree Grid](https://vaadin.com/docs/latest/components/tree-grid), and [version comparison](https://vaadin.com/docs/latest/upgrading/version-comparison) (accessed 2026-09-06). **Confidence: high.**

Ownership is a company-governed runtime component suite with both open-source core and commercial Pro components. **Confidence: high.**

### Breadth and fit questions

Vaadin has the strongest data-heavy coverage of these three: Grid, Tree Grid, free Virtual List, rich form controls, menus, dialogs, notifications, progress, tabs, Upload, and draggable Split Layout. Master-Detail Layout adds a responsive two-surface pattern. Tree Grid supports hierarchical expandable data and documented drag/drop; it is heavier and more tabular than a simple application tree. No dedicated audio/video player, timeline, waveform, or command palette was found. Evidence: [component catalog](https://vaadin.com/docs/latest/components), [repository component list](https://github.com/vaadin/web-components), [Tree Grid](https://vaadin.com/docs/latest/components/tree-grid), [Virtual List](https://vaadin.com/docs/latest/components/virtual-list), and [Split Layout](https://vaadin.com/docs/latest/components/split-layout) (accessed 2026-09-06). **Confidence: high.**

### Theming

Official pages describe global CSS properties, component style properties, utility classes, and custom CSS; current examples offer Lumo and Aura themes. Vaadin 25 changed unthemed base styles substantially and moved closer to native CSS styling, while dropping Material theme support. The mechanisms are broad, but matching Clip Sandbox's compact cinematic language rather than retaining an enterprise-app visual character is untested. Evidence: [components overview](https://vaadin.com/components), [component catalog styling section](https://vaadin.com/docs/latest/components), and [Vaadin 24-to-25 upgrade guide](https://vaadin.com/docs/latest/upgrading) (accessed 2026-09-06). **Confidence: high for mechanisms and upgrade facts; unknown for visual fidelity.**

### Accessibility: claim versus proof

Vaadin says components are designed for WCAG 2.1 AA. Its evidence is unusually concrete: manual screen-reader testing during development, annual holistic testing by TetraLogical, named Windows/macOS screen-reader/browser combinations, and a public per-component table that distinguishes pass, fail, minor, note, and i18n limitations. The page also lists exclusions and says components cannot guarantee application-level accessibility. A recent PR sample fixed NVDA/Chromium naming for draggable Grid cells and included recorded assistive-technology output. Evidence: [accessibility program and status table](https://vaadin.com/accessibility) and [Grid accessibility PR #12135](https://github.com/vaadin/web-components/pull/12135) (accessed 2026-09-06). **Confidence: high for process and disclosed status; unknown for Clip Sandbox composition.**

### License and commercial boundary

The repository lists core components under Apache-2.0. Pro components are under Vaadin Commercial License and Service Terms; the current list includes Board, Charts, CRUD, Dashboard, Grid Pro, Map, and Rich Text Editor. Vaadin's licensing guide says core is free even for commercial projects, while commercial components/tools require a license for development and production builds. Commercial use can require online validation or an offline license key. Core Grid, Tree Grid functionality within Grid, Split Layout, and Virtual List are represented by Apache-2.0 npm packages; do not infer that similarly named Pro products such as Grid Pro are free. Evidence: [repository license split](https://github.com/vaadin/web-components), [license validation guide](https://vaadin.com/docs/latest/flow/configuration/licenses), and [pricing FAQ](https://vaadin.com/pricing/faq) (accessed 2026-09-06). **Confidence: high; factual summary only.**

### Governance, activity, responsiveness, and security

The repository is governed by Vaadin Ltd. On 2026-09-06 the GitHub API reported about 581 stars, 102 forks, and commits through 2026-09-05. The latest synchronized stable component release found was **25.2.10**, released **2026-09-03**; npm returned 25.2.10 for `@vaadin/button`, `@vaadin/grid`, `@vaadin/split-layout`, and `@vaadin/virtual-list`. There is no `@vaadin/web-components` umbrella package, so version claims should reference actual component packages or the monorepo release. Evidence: [v25.2.10 release](https://github.com/vaadin/web-components/releases/tag/v25.2.10), [recent commit d09dd06](https://github.com/vaadin/web-components/commit/d09dd06288c2bad73f33e489406abb1e5237c8df), and [npm Grid 25.2.10](https://www.npmjs.com/package/@vaadin/grid/v/25.2.10) (checked 2026-09-06). **Confidence: high.**

Responsiveness sample: accessibility fix PR [#12135](https://github.com/vaadin/web-components/pull/12135) was opened 2026-07-14, reviewed, and merged 2026-07-15; automated backport PR [#12143](https://github.com/vaadin/web-components/pull/12143) merged the same day into 25.2. This shows fast handling and maintained-branch backporting for one accessibility defect, not a general response guarantee. The open-issue count is large because the monorepo spans many packages and versions; it is not meaningful by itself. **Confidence: high for sample; low for generalization.**

Vaadin has a repository [security policy](https://github.com/vaadin/web-components/security/policy) and company [PSIRT policy/advisory index](https://vaadin.com/security). The company commits to acknowledging vulnerability reports within three business days and publishes advisories through its security page, GitHub advisories, and registered-user email where applicable. **Confidence: high.**

Documentation is broad and includes TypeScript/Java API links, Lit/React/Flow examples, styling pages, best-practice guidance, accessibility status, release notes, upgrade guides, roadmap, forum, Discord, and Stack Overflow routes. This is a strong documentation/support signal, though much content assumes the full Vaadin platform and must be filtered for standalone Web Component use. **Confidence: high.**

### Upgrade history

Vaadin has a long multi-generation history from GWT widgets through Polymer and Lit components. Vaadin 25 retains Lit Web Components but changes its platform baseline and theming: Material theme was removed, base styles changed significantly, and custom themes based on those styles may need heavy refactoring. The roadmap identifies Vaadin 24 as an older long-term-supported line whose free maintenance ended in June 2026, with extended maintenance sold separately. For a standalone Electron consumer, not every Java/platform migration item applies, but component CSS and package-major changes do. Evidence: [version comparison](https://vaadin.com/docs/latest/upgrading/version-comparison), [upgrade guide](https://vaadin.com/docs/latest/upgrading), and [roadmap/maintenance](https://vaadin.com/roadmap) (accessed 2026-09-06). **Confidence: high.**

### Offline Electron plausibility

Open-source component packages are local npm dependencies with browser-side Lit runtime, so offline Electron bundling is plausible. Commercial components introduce license validation and documented offline-key procedures, making them operationally different. A spike must verify that chosen core packages do not pull full Flow/Hilla assumptions, that theme/icon assets resolve locally, and that Grid/Tree Grid behavior and bundle cost are acceptable in Electron. No installation, bundle analysis, or offline run was performed. **Confidence: medium.**

## Cross-library facts that must survive synthesis

1. **Coverage is tier-sensitive.** Web Awesome's searchable Combobox, virtualized Data Grid, and Video are Pro; its latter two are experimental. Vaadin's core is Apache-2.0 but several advanced products are commercial. Spectrum has no paid tier found, but its required theme package declares ISC while most components and the repository are Apache-2.0.
2. **Spectrum must be versioned by generation.** First-generation `sp-*` breadth is demonstrated; second-generation `swc-*` is a separate package line under active migration. A prototype that does not name the generation would answer the wrong lifecycle question.
3. **None supplies a full media-editor surface.** Web Awesome has the only documented video wrapper, and it is Pro/experimental; none supplies waveform, frame-strip, exact-frame, or clip-range semantics.
4. **Accessibility evidence differs.** Vaadin publishes independent annual testing and a component status matrix; Web Awesome documents automated component checks and limits its claim; Spectrum has automated suites and detailed component guidance but also visible open a11y defects. None of this proves the composed Clip Sandbox shell.
5. **Offline suitability is plausible, not tested.** All have npm/local paths, but asset resolution, CSP, bundle size, licensing behavior, custom-element conflicts, and Electron keyboard/focus behavior remain spike obligations.

## Explicit unknowns for later evaluation

- Actual installed and compressed dependency cost for a cherry-picked representative set from each library.
- Whether each library can match `DESIGN.md` without brittle deep overrides or breaking the single-accent and compact-density rules.
- Shadow-DOM focus restoration, `inert`, Escape ordering, global utility exclusivity, reduced-motion transitions, and fullscreen teardown in the repository's real Electron version.
- Large-list performance and dynamic-height behavior using Clip Sandbox data; “virtualized” documentation is not performance proof.
- Windows assistive-technology behavior for the exact composed dialogs, menus, trees/grids, splitters, and history surfaces.
- Pro package acquisition/update/offline mechanics for Web Awesome, and whether any Pro capability would actually be required after comparing native/local alternatives.
- Spectrum Gen2's current stable version, component completeness, migration timing, and suitability relative to the mature Gen1 line.
- Vaadin core-only dependency closure and whether platform-oriented documentation obscures client-only constraints.

