# UI Code Design Guidelines

## Purpose and scope

- These guidelines apply to the user interface of long-lived applications: the code that shows things to the user, takes their input, and runs the flows that input starts.
- They are written for class-based UI code without a component framework (DOM plus TypeScript in the examples).
- They extend `coding-quality.md`. Its general rules (ownership, cohesion, naming, comments, test reliability) apply to UI code too; this document adds only what is specific to UI. A repository that adopts this document must also adopt `coding-quality.md`, because this document relies on its general rules.
- The rules do not depend on one application. The examples use class and event names from the application they were drawn from; they illustrate a rule and are not names to reuse.

## Terms

- Typed event: a named notification with a declared payload type, for example `selectionRequested` carrying a filename. In the example convention, subscribers register with `on(name, handler)` and receive a function that unsubscribes them; any mechanism with the same guarantees will do.
- Narrow interface: an interface that lists only the members its consumer uses. The consumer declares it next to itself; the class that satisfies it does not import it, because TypeScript checks only that the shape matches.
- Composition root: the one place that builds the application's objects and connects them.

## Roles

The roles below cover the classes found in an application's UI and the layers just behind it. A class that does the work of two roles should be split. Code that fits none of them follows `coding-quality.md` alone.

| Role | Owns | Never |
|---|---|---|
| Control | One part of the page: its elements, its DOM listeners, its display text and its local state. Reports what the user did as events. | Decides what the application does next, reaches into another control's elements, or reports failures outside its own part of the page. |
| Screen | One workspace: which controls it shows, its initial focus, and what happens when it gains or loses the user's attention. | Contains flow logic. |
| Shell | Which screen is active, switching between screens, and the parts of the window shared by all screens. Passes activation, resizing and key presses to the active screen. | Contains rules for a specific screen. |
| Workflow | One user flow, such as opening a folder or saving a collection. Listens to control events, calls domain code, application services and adapters, and tells controls what to show. | Imports anything from the UI layer, or touches page elements. |
| Query component | The answer to one question that other parts ask, such as "may the user leave this screen now?" | Starts flows or changes state. |
| Application service | Application state or work that workflows use and that outlives a single flow, such as the working copy of the open folder or a running extraction. | Touches page elements, imports anything from the UI layer, or starts flows on its own initiative. |
| Stateless class | A calculation or text selection with no state, such as layout rules or label formatting, used by controls or workflows. | Holds state or touches page elements. |
| Domain model | Business rules and state, as described in `coding-quality.md`. | Knows about the UI or about storage formats. |
| Adapter | Access to the platform: desktop APIs, file system, clock, full screen. | Contains business rules. |
| Application event component (named `…Controller`; see Naming) | Listening to application-wide window and document events (key presses, full-screen changes, page hide) and passing each to the one component that handles it. | Decides what an event means for a screen. |
| Composition root (named `…Controller`; see Naming) | Building all of the above, connecting them, and starting the application. | Anything else. |

## Composition root

- The composition root builds, connects and starts. It contains no flow logic, no decisions, no display text and no element ids.
- It may connect an application-wide event directly to the calls it triggers, as long as no condition or state is involved (when the Settings button is pressed: close the open utility panel, then show the Settings screen). Anything that needs a condition belongs in a workflow.
- Build in dependency order. Usually that means adapters and application services, then controls and screens, then the shell, then workflows; an application service that uses a control is built after it. Start last, and keep starting (the first screen activation) separate from construction, so that no event fires before every listener is subscribed.
- Do not bind late. No field is assigned after construction, no value is asserted to exist with `!`, and no callback refers to something built later. The one allowed exception is a genuine dependency loop between two components: close it with a single typed callback and a comment saying why.
- Pass whole objects. Never pick methods out of an object or pass bound methods (`grid.computeGrid.bind(grid)`); the receiver declares a narrow interface and gets the object.
- Pass logical identifiers (`'activity'`, a screen id), never text the user will see.
- An optional platform service is created through a factory that returns `null` when the platform lacks it (`tryCreate(window)`). The application then disables the features that need it instead of failing to start.
- Shut down in the reverse order of use: first stop input (application events and the shell), then dispose workflows, then dispose controls.

## Controls

- A control finds or creates its own elements. Give it a factory such as `MainToolbarControl.fromDocument(document, { appText })`. When the same control is used more than once, give each use a named factory (`GifRangesPanelControl.forCollectionRefinement(session, options)`) rather than a parameter that selects behavior.
- The composition root passes the document, or a root element, plus behavior: validators, a text service, callbacks. It never passes a control's inner elements, attributes or labels.
- The factory decides which parts are required. A missing required part fails at once with a message that names it; a missing optional part disables only what depends on it.
- A control decides which text it shows and where, including accessible labels. Wording used only by that control lives in the control. Wording shared across the application (counts, product terms, messages several parts use) comes from a text service injected into the control. The composition root passes the text service, never the text itself.
- When another component needs to describe the control (for example a menu or utility registry that needs its label and trigger), the control provides that description.
- A control binds and unbinds the listeners on its own elements. Window and document events that concern the whole application (key presses, full-screen changes, page hide) belong to the application event component, not to individual controls. A control that must react to its own size observes its own element rather than the window.
- A control that must react to interaction outside itself while open (closing on an outside click, on focus leaving it or on Escape, or repositioning when the window is resized) may listen on its own element's document and window. It removes those listeners in `dispose()`. Application shortcuts still arrive through the application event component.
- A control puts itself into a consistent initial state when it is built: a dialog starts closed, a list starts empty. Nothing else resets it at startup.
- A control reports what the user did as typed events, named after the user's intent: `browseRequested`, `selectionRequested(filename)`, `orderChanged(ids)`. An event says what happened, not what should happen next.
- Workflows tell a control what to show through methods such as `render(state)`, `open()` or `close()`. A control never decides application flow.
- A control shows a problem inside its own part of the page, such as a validation message under a dialog's input. It does not report failures anywhere else (an activity log, notifications, a diagnostics file): it emits a failure event (`failed`, `metadataFailed`) and an application component decides how to report it.
- A control may keep the browser's default behavior when nothing listens to one of its events, for example letting the native context menu appear. This needs an event source that can tell its owner whether anything is subscribed to an event (`hasSubscribers(name)` in the example convention). Only the owning control asks; no other component needs to know.
- Keep clearing apart from ending: `clear()` resets what a control shows and may be called while the application runs; `dispose()` ends the control's life and releases its listeners and observers.
- Calculations a control needs that hold no state (layout rules, label formatting) belong in a stateless class the control uses; see Roles.

## Screens and the shell

- The shell decides which screen is active and calls that screen's hooks: activation and deactivation, initial focus, the start and end of a workspace resize, and key presses. Only the active screen receives them. Key presses reach the shell from the application event component.
- The shell has no rules for particular screens. When a shell element needs screen-specific handling (a Settings button), the shell reports it as an event and the composition root or a workflow handles it.
- A screen forwards its hooks to the controls it owns. For example, a screen with a grid passes workspace resizes to that grid, so no other part needs to know that this screen has a grid. When a workflow handles a hook instead (the screen's keyboard shortcuts), the screen reports it as an event.
- An overlay that belongs to a screen is closed when another screen becomes active. The workflow that runs the overlay listens for the screen change and closes it, so the overlay control does not need to know about screens.

## How parts communicate

Choose the mechanism by what the sender needs:

| Situation | Mechanism |
|---|---|
| A control reports something the user did | A typed event. Any number of workflows may subscribe; the control does not know who listens. |
| A caller needs the outcome of an interaction, such as the answer to a dialog | A call that returns the outcome, for example as a promise, offered by the workflow that runs the interaction. The dialog control itself reports `confirmed` and `cancelled` as events; the workflow turns them into the outcome. Every way the interaction can end (confirm, cancel, Escape, closing by other means, disposal) settles it. |
| A component needs an answer to a question | A query component, injected. Not an event, and not a workflow. |
| A reply belongs to one request, such as the item chosen from a menu that was just opened | A callback passed with that request. |
| A workflow needs another workflow's work done | A direct call through a narrow interface. |
| The sender must wait for the work to finish, or must know it failed | A call, never an event. Events do not return results and do not order the work that follows them. |

- Use a returned outcome when the caller waits for one answer before its flow continues (a dialog). Use callbacks passed with the request when the request offers several independent choices that are each handled on the spot (the items of a context menu).
- Do not record a caller's intent in shared state for the completing component to inspect. A callee must not know which caller's flow it resumes.
- Do not add a central registry or startup check of which events are handled. A missing subscription shows up as a control that does nothing, so every user flow needs a test that exercises it.

## Workflows

- One workflow class per user flow, named after the flow (`FolderSelectionWorkflow`, `CollectionSaveWorkflow`).
- A workflow receives all its dependencies in its constructor, subscribes to the events it handles there, and keeps the unsubscribe functions. `dispose()` unsubscribes and settles anything still waiting.
- A workflow declares the narrow interfaces it consumes, next to itself, with the `I` prefix (`IUnsavedChangesPrompt`, `IEventSource<{ browseRequested: void }>`). It imports nothing from the UI layer, not even types; the controls satisfy those interfaces without importing them.
- Dependencies point from the UI layer to the application layer, never back. A type that both layers use (a description of a keyboard shortcut, a captured frame) lives in the application layer or the domain, where the UI may import it.
- A workflow owns the state of its flow, such as a pending action or a counter that lets it ignore the result of an asynchronous step the user has since superseded.
- A workflow may read domain state to drive the flow. It does not take over domain rules just because it coordinates a flow, and it does not contain rendering logic.
- Reading domain state alone does not make code a workflow. Code that only formats or shows domain state belongs to a control or a stateless class.

## Reporting and errors

- Reporting follows the layer. Workflows and other application components receive a reporter object in their constructor. Controls emit failure events, and one application component decides whether each failure is shown to the user or only logged.
- There is no global reporter.
- A message shown to the user says what failed and what the user can do about it.

## Testing UI code

The general rules in `coding-quality.md` ("Test reliability") apply. In addition:

- Before restructuring UI code, record its current behavior in tests that drive the real page, so the restructuring can be checked against them.
- Test each workflow on its own against simple fakes of the narrow interfaces it declares.
- Test each control factory against the application's real page markup, so a renamed or removed element fails a test.
- Test `dispose()` by showing that events no longer have any effect, not by counting subscribers.
- Check user-visible behavior in the running application. For a restructuring, compare what the user sees before and after.

## Naming

- Control: `…Control`. The shell is the control for the window's shared parts, so it is `…ShellControl`.
- Screen: `…Screen`. Workflow: `…Workflow`, named after the user flow.
- Query component: a name that states the question or rule (`RefineScreenLeavePolicy`, `NewCollectionNameCheck`).
- Application service: a name for what it holds or does. Give each suffix one meaning across the application; do not use the same suffix (for example `…Session`) for a working copy, a coordinator and a draft.
- Stateless class: a name for what it computes (`DisplayLayoutRules`, `ClipLabelFormatter`).
- Adapter: `…Adapter` for a class that wraps a platform API (`FullscreenAdapter`). A platform-backed implementation of a service interface is named after the platform and the service (`ElectronFileSystemService`).
- Application event component and composition root: `…Controller` is kept for these two application-level coordinators (`ApplicationEventController`, `AppController`). Do not use it for UI parts, where it would suggest coordination a control never does, or for a helper that a control or screen uses (a keyboard handler, a playback scheduler); name such a helper for what it does.
- Name events after what happened: `…Requested` for the user's intent (`browseRequested`), `…Changed` for a change of state (`selectionChanged`), `confirmed` and `cancelled` for a dialog's answer, `…Pressed` for raw input a screen passes on (`keyPressed`), and `failed` or `…Failed` for a failure (`playbackFailed`).

## Rejected alternatives

- Workflows written as closures or nested classes inside the composition root: they have no explicit dependencies and depend on declaration order.
- Connecting controls to workflows after construction through late-bound callbacks or a wiring registry: ownership becomes implicit and order-dependent.
- One constructor callback per control action instead of events: it ties each control to one consumer, so swapping the control means reproducing every call.
- Workflows answering queries for other components: a question has one owner, separate from the flows that ask it.
- A startup check that every event has a subscriber: it only covered events someone remembered to list, so it could not catch the case it was meant for.
- The composition root reading page elements and passing them to controls: every markup change then touches the composition root.
- A global reporter: a hidden dependency that tests must reset.
