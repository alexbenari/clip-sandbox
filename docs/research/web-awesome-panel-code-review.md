# Web Awesome Split Panel code-quality assessment

2026-09-07. Reviewed against coding-quality.md. **Readable, focused component, but not ready for unconditional adoption.** Our integration has a motion blocker, and a separate upstream property-change defect is reproducible. These findings do not establish that the whole library is unreliable.

## Evidence boundary

Reviewed exact installed `@awesome.me/webawesome@3.12.0`: Split Panel implementation, styles, drag helper and declarations. Registry gitHead: `867eb4a60839217eadeec0f6237962a02b56185b`. Implementation chunk `dist/chunks/chunk.JMBAF4TD.js` SHA-256: `B5D4B4737ABC42162097C1E0ECBFAD9FBD2E3230B905F0633320BCAD2C297988`.

The [public documentation](https://webawesome.com/docs/components/split-panel) documents nesting and primary-panel sizing. Source references below use the [installed implementation](../../sandbox/component-library-evaluation/node_modules/@awesome.me/webawesome/dist/chunks/chunk.JMBAF4TD.js). This is a distribution-code review, not a full dependency audit. Retrieval of upstream source/tests at the registry revision failed; upstream test quality remains unassessed.

## Findings

| Priority and finding | Evidence and implication |
|---|---|
| **Adoption blocker: animated nesting perturbs the untouched panel** | Fold only the left: the right grows from 240 to 260.53 pixels before returning. Pixel/percentage conversion and resize updates interact with our host grid-track transition. This is an integration incompatibility, not evidence that unanimated nesting is broken. Endpoint-only tests missed it. |
| **Upstream defect: dynamic orientation retains the wrong pixel size** | A 600 x 300 host with primary start=150 pixels renders 150 wide horizontally, then 75 high after setting orientation to vertical. Its size handler watches `vertical` rather than the declared `orientation`. Reproduced without our animation. Current panels stay horizontal; this is outside our current path but lowers confidence in property-change coverage. |
| **Enabled-divider accessibility gap** | The rendered separator has no `aria-orientation`, including a side-by-side layout whose divider is vertical. Our probe confirms the absence. The pilot disables divider interaction and uses named buttons, so its keyboard tests do not establish complete splitter accessibility. |
| **Qualified lifecycle/drag risks** | Observation starts after an asynchronous update, without a visible connected-state guard; disconnect unobserves. The used drag helper cleans document listeners on pointerup but has no pointercancel/removal cleanup. These are source risks, not reproduced pilot defects; drag is disabled here. |

Run `npm --prefix sandbox/component-library-evaluation run test:motion` to reproduce the first two findings and record [source-probes.json](../../sandbox/component-library-evaluation/artifacts/source-probes.json). It intentionally exits nonzero on the untouched-width contract. Independent runs measured approximately 20.52 and 20.53 pixels of excess width, beyond rounding tolerance. No library patch or workaround was added.

## Strengths and ownership cost

- One cohesive Lit element owns sizing, divider interaction and resize response. Helpers isolate localization, property watching, clamping and dragging.
- Public slots, typed properties and styling surfaces allow integration without package patches or an application-framework migration. Styles are scoped.
- Layout uses browser grid rather than a bespoke animation scheduler; primary-side handling is explicit.
- Our adapter remains one local presentation class reused for both sides. Receiving each panel element prevents nested selectors binding another panel's controls.

The main complexity is reciprocal synchronization of percentage, pixel and cached-pixel positions. That increases the state space, particularly during animated nesting. Fold state, rails, focus, accessibility hiding and motion remain ours. CSS interpolation assumes the host retains an animatable grid-template shape; this is not a dedicated public animation API.

Our adapter is proportionate for a spike, with fixture dimensions and document-lifetime listeners. Production lifecycle handling and focus inside nested shadow-root controls remain untested. No material deviation from coding-quality.md is needed for this isolated fixture; no production boundary changed.

## Decision

Do not accept this panel integration yet. A narrowly scoped public-API/CSS correction could be evaluated against the failing motion assertion. If it needs custom animation machinery or source patches, use the preselected fallback. Do not lengthen durations to conceal extra movement. Broader catalog coverage is assessed [separately](web-awesome-coverage-evidence.md).
