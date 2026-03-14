# Feature Spec: Reusable Zoom Overlay Component

## 1. Summary

Refactor the existing zoom overlay into a reusable UI component that works out of the box in a new host page without copying zoom-specific CSS from the main app shell.

The feature includes:

1. a reusable zoom overlay controller with built-in default styling,
2. a prototype host page at `sandbox/zoom-demo.html` that opens `sandbox/hand-closes-curtain.mp4` in the same overlay used by the main app,
3. developer-facing documentation that explains how another app can integrate the component.

The prototype is not just a demo artifact. It is the primary architecture probe for validating the component boundary.

## 2. Problem

The current zoom overlay logic is mostly isolated in `src/ui/zoom-overlay-controller.js`, but its default presentation still depends on CSS declared in `index.html`.

That creates two integration problems:

1. a new host page cannot reuse the zoom overlay by importing the controller alone,
2. the real integration contract is split across JavaScript and page-level CSS instead of being owned by one component boundary.

This weakens confidence that the zoom feature is encapsulated as a reusable component.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Make the zoom overlay usable by a new host page with no copied zoom CSS.
2. Keep the runtime integration contract minimal and explicit.
3. Preserve the current user-visible zoom behavior in the main app.
4. Prove the reuse story with a concrete host page in `sandbox/zoom-demo.html`.
5. Produce developer-facing documentation that explains the integration contract and expected host responsibilities.

### 3.2 Non-Goals

1. No new zoom product behavior beyond what already shipped unless required by the encapsulation refactor.
2. No theming or style override API in this pass.
3. No migration to Shadow DOM in this pass.
4. No attempt to make the component framework-specific.
5. No redesign of fullscreen behavior beyond preserving existing coordination.

## 4. Core Concepts

### 4.1 Zoom Overlay Controller

The JavaScript module that owns:

1. lazy creation of overlay DOM,
2. zoom video lifecycle,
3. outside-click close behavior,
4. default style installation.

### 4.2 Host Page

Any page that wants to reuse the zoom overlay component.

In this feature, there are two hosts:

1. `index.html` in the main app,
2. `sandbox/zoom-demo.html` as the prototype integration page.

### 4.3 Default Component Styles

The built-in visual rules required for the zoom overlay to render correctly and responsively without host-provided zoom CSS.

These styles include at minimum:

1. overlay viewport positioning,
2. centered frame layout,
3. responsive sizing,
4. zoom video sizing behavior.

## 5. User and Developer Stories

1. As an app user, I can still open zoom in the main app and get the same visual and behavioral result as before.
2. As a developer, I can reuse the zoom overlay in another page by importing the controller and calling it directly.
3. As a developer, I do not need to copy hidden CSS contracts from `index.html`.
4. As a developer, I can read one concise integration document and understand what the component owns versus what the host owns.
5. As a reviewer, I can inspect `sandbox/zoom-demo.html` and quickly see what a new client must do to adopt the component.

## 6. Functional Requirements

### 6.1 Reusable Integration Contract

The reusable component contract for a host page must be:

1. provide a mount element,
2. create the controller,
3. call `open({ src, name })` with a playable video source.

The host must not need to:

1. add zoom-specific CSS rules,
2. create the internal overlay DOM structure,
3. manage overlay-local state.

### 6.2 Default Style Ownership

The zoom component must install its own default styles automatically.

Required behavior:

1. default styles are installed lazily when the controller is created or first used,
2. styles are added at most once per document,
3. styles are sufficient for the component to render correctly in both the main app and the demo page,
4. the main app must no longer rely on duplicated zoom CSS in `index.html`.

### 6.3 Main App Behavior Preservation

The refactor must preserve existing zoom behavior in the main app, including:

1. open from double-click,
2. open from `Z` on selected clip,
3. playback from the beginning,
4. audio enabled in zoom,
5. outside-click close,
6. `Escape` close,
7. fullscreen closing zoom first.

### 6.4 Demo Page

Add a new page at `sandbox/zoom-demo.html`.

The demo page must:

1. render a simple `Click to View` button,
2. render a mount element for the zoom component,
3. import only the zoom component module and any directly related component helpers,
4. open `sandbox/hand-closes-curtain.mp4` in the zoom overlay when the button is clicked,
5. avoid importing the main app bootstrap or unrelated app modules,
6. act as a readable example of third-party integration.

### 6.5 Developer Documentation

Add or update developer-facing documentation that explains:

1. where the reusable component lives,
2. what the host must provide,
3. what the component owns internally,
4. that default styles are installed automatically,
5. how the sandbox demo demonstrates the intended integration pattern.

The documentation should be written for engineers evaluating reuse, not end users.

## 7. UX Specification

### 7.1 Main App UX

The main app should look and behave materially the same as the currently shipped zoom overlay.

Minor visual drift is acceptable only if it comes from consolidating the component styles and does not change the intended layout model:

1. transparent full-screen overlay hit area,
2. centered zoom frame,
3. frame size near two thirds of viewport,
4. non-dimmed background.

### 7.2 Demo Page UX

The demo page should be intentionally minimal.

It should include:

1. a page title or short label indicating it is a zoom component demo,
2. one obvious action button,
3. no app toolbar, grid, selection, or fullscreen chrome unless directly needed for the demo.

The goal is to make the component dependency surface obvious.

## 8. Behavioral Rules

### 8.1 Style Installation

If multiple controllers are created in the same document:

1. the default stylesheet must still be injected only once,
2. all instances should reuse that shared stylesheet,
3. removing one controller must not remove styles needed by another active controller.

### 8.2 Overlay Lifecycle

The controller remains responsible for:

1. creating overlay DOM lazily,
2. replacing the zoomed video when reopened,
3. cleaning up the current video on close,
4. preserving the existing `isOpen()` behavior.

### 8.3 Host Independence

The demo page must prove that the controller does not depend on:

1. app state,
2. grid card markup,
3. selection state,
4. fullscreen session objects,
5. drag-drop handlers.

If any such dependency is discovered during implementation, it should be treated as an encapsulation finding and removed unless there is a compelling architectural reason to keep it.

## 9. Architecture Impact

### 9.1 Expected Ownership

Recommended ownership after the refactor:

- `src/ui/zoom-overlay-controller.js`
  - owns overlay DOM creation, video lifecycle, outside-click behavior, and default style installation.
- `index.html`
  - provides only a mount point for the zoom overlay in the main app shell.
- `src/app/bootstrap.js`
  - continues to orchestrate when zoom opens or closes, but does not own zoom styling.
- `sandbox/zoom-demo.html`
  - acts as an independent host example for the component.

### 9.2 Styling Strategy

This pass standardizes on automatic default style injection by the component itself.

Rationale:

1. it satisfies the out-of-the-box requirement directly,
2. it keeps the host contract minimal,
3. it turns the demo page into a valid proof of reuse instead of a partial copy of app shell styles.

### 9.3 Future Extension

This spec intentionally leaves future style customization open but does not define that API yet.

The implementation should avoid painting itself into a corner, but should not add speculative customization surface in this pass.

## 10. Testing Requirements

### 10.1 Controller Tests

Add or update controller-focused tests to cover:

1. default style installation,
2. single style injection across multiple controller instances,
3. preserved open/replace/close behavior.

### 10.2 Main App Regression Coverage

Existing zoom-related tests should continue to pass and prove that app behavior did not regress.

### 10.3 Demo Verification

The demo page must be manually or browser-test verified to confirm:

1. the button opens the zoom overlay,
2. the overlay uses component-owned styles without copied host CSS,
3. the demo page does not depend on main app bootstrap code.

## 11. Acceptance Criteria

This feature is complete when:

1. the main app zoom overlay still behaves as before,
2. `index.html` no longer owns the zoom overlay’s default CSS,
3. a new page at `sandbox/zoom-demo.html` can open the sample video in the zoom overlay,
4. the demo page imports only the zoom component layer and not the full app bootstrap,
5. developer-facing documentation explains how to integrate the component into another app,
6. tests covering the new component-style ownership pass.
