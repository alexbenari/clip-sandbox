# Feature Spec: First-Class Clip and Collection Grid Architecture

## 1. Summary

Refactor the current clip-grid architecture so the app has:

1. a first-class `Clip` model for one clip,
2. a first-class mutable `ClipCollection` model for one ordered collection of clips,
3. a dedicated `ClipCollectionGrid` UI component that owns display and interaction for one collection.

The goal is not to change user-facing behavior first. The goal is to make the existing app behavior rest on clearer boundaries so future work such as zoom integration, clip-level features, collection editing, and richer view modes can be implemented without relying on DOM elements as part of the model.

## 2. Problem

Today the app has collection semantics, but they are spread across state arrays, DOM order, and UI datasets instead of being owned by explicit model objects.

Current problems:

1. a clip is not a first-class app object; it is represented indirectly by a mix of `File`, filename strings, object URLs, and DOM elements,
2. the current working collection is represented indirectly by `folderFiles`, `activeCollectionNames`, and current grid state rather than by one first-class collection object,
3. selection is stored as a selected DOM element rather than a stable clip identity,
4. reorder behavior mutates the DOM first and then syncs model state back from the DOM,
5. grid rendering and interaction are spread across `dom-factory`, `drag-drop-controller`, `layout-controller`, fullscreen logic, and `app-controller.js`.

This weakens encapsulation and makes it harder to reason about clip identity, collection identity, and the boundary between model and UI.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Introduce a first-class `Clip` model with stable app identity.
2. Introduce a first-class mutable `ClipCollection` model that owns ordered collection contents.
3. Replace DOM-element identity for selection with clip-id identity.
4. Introduce a `ClipCollectionGrid` UI component/controller that owns rendering and interaction for one collection view.
5. Keep zoom, save/load, and fullscreen behavior working while moving them onto the new model boundaries.
6. Reduce the amount of clip/collection logic embedded directly in `src/app/app-controller.js`.

### 3.2 Non-Goals

1. No new user-visible collection feature is required in this refactor beyond preserving current behavior.
2. No decision yet on ES classes versus factory functions; the architecture should be expressed clearly enough to allow that implementation choice later.
3. No multi-folder collection support.
4. No new persistence format.
5. No immediate redesign of fullscreen layout logic beyond adapting it to the new boundaries.

## 4. Core Concepts

### 4.1 Clip

A `Clip` is the app-level representation of one local video clip.

A clip must include:

1. `id`: a generated stable runtime identifier,
2. `name`: the filename,
3. `file`: the browser `File` object for the clip,
4. `durationSec`: known duration if available, otherwise unset until metadata is loaded.

A clip does not own:

1. a DOM element,
2. selection state,
3. grid position,
4. an object URL as part of the pure clip model.

### 4.2 ClipCollection

A `ClipCollection` is one mutable ordered collection of clips.

A collection must include:

1. `name`: the collection name,
2. ordered clip ids,
3. clip lookup by id.

A collection owns collection-level operations such as:

1. returning ordered clips,
2. looking up one clip by id,
3. replacing the current order from a full ordered clip-id list,
4. removing a clip,
5. serializing clip names in collection order for save behavior.

A collection does not own:

1. DOM state,
2. layout behavior,
3. persistence side effects such as writing files.

### 4.3 ClipCollectionGrid

A `ClipCollectionGrid` is the dedicated UI component/controller for displaying and interacting with one `ClipCollection`.

The grid owns:

1. rendering clip cards,
2. maintaining the mapping between clip ids and DOM elements,
3. selection UI,
4. drag/drop reorder UI,
5. clip-card event wiring,
6. runtime object URL lifecycle needed by rendered video elements.

The grid emits app-level events such as:

1. selection changed,
2. order changed,
3. open clip requested,
4. remove clip requested.

### 4.4 App Orchestration Layer

The app orchestration layer remains responsible for composing major subsystems such as:

1. folder load and collection-file load,
2. save behavior,
3. zoom overlay,
4. fullscreen behavior,
5. status messaging.

It should not be the place where clip-card rendering or collection-grid interaction details live.

## 5. User and Developer Stories

1. As a developer, I can reason about one clip without inspecting DOM datasets.
2. As a developer, I can reason about the current collection without scraping the grid DOM.
3. As a developer, I can add clip-level features like zoom, selection, compare, or metadata display against explicit clip identity.
4. As a developer, I can treat the main grid as a reusable UI component boundary, similar in spirit to the zoom overlay.
5. As a user, I still get the same visible clip-grid behavior during and after the refactor.

## 6. Functional Requirements

### 6.1 Clip Model Requirements

The clip model must:

1. be created from loaded browser `File` objects,
2. have a generated runtime id that does not depend on a DOM element,
3. expose filename and duration data needed by the UI,
4. preserve access to the underlying `File` object.

The clip model must not require:

1. a path string,
2. a file-system handle,
3. a DOM node reference.

### 6.2 Collection Model Requirements

The collection model must:

1. own ordered membership as ordered clip ids,
2. support replacing its order from a full new ordered clip-id list,
3. support removal by clip id,
4. expose ordered clip names for save behavior,
5. remain mutable in this first refactor pass.

The collection model must not:

1. derive its order from DOM order,
2. embed file-writing behavior,
3. depend on layout or rendering code.

### 6.3 Grid Component Requirements

The grid component must:

1. render cards from a `ClipCollection`,
2. treat clip id rather than DOM element as the stable identity,
3. own clip-card selection UI,
4. own drag/drop interaction and produce a full new ordered clip-id list when order changes,
5. own runtime object URLs for displayed clips,
6. clean up object URLs when cards/grid are destroyed or replaced.

The grid component must not:

1. become the persistence layer for collections,
2. become the source of truth for collection state independent of the model,
3. require bootstrap to know per-card DOM details.

### 6.4 Selection Rules

Selection should be owned at the UI level by the grid component.

Required behavior:

1. the grid manages selected-card visuals and card interaction,
2. app-level coordination uses selected clip id rather than a selected DOM node,
3. features such as zoom open by keyboard consume clip identity rather than a thumb element.

### 6.5 Object URL Rules

Object URLs are runtime browser resources for rendering local files in `<video>` elements.

Required ownership:

1. object URLs are created from a clip's `File`,
2. object URL lifecycle is owned by the grid component or a grid-internal clip-view helper,
3. object URLs are not part of the pure `Clip` model,
4. URLs must be revoked when no longer needed.

### 6.6 Bootstrap Responsibilities After Refactor

`src/app/app-controller.js` should still:

1. create clips and initial collections from loaded files,
2. compose the grid, zoom overlay, fullscreen session, and persistence flows,
3. respond to grid-emitted events by updating the collection model,
4. hand selected/open clip identity to zoom and other higher-level features.

`src/app/app-controller.js` should no longer:

1. store selected DOM elements as app state,
2. reconstruct collection order by scraping `grid.children`,
3. own card-level event wiring.

## 7. UX and Behavior Preservation

### 7.1 Clip Grid Behavior

This refactor should preserve the current visible grid behavior, including:

1. clip cards render with video and filename/duration label,
2. click selects,
3. drag/drop reorders,
4. delete removes the selected clip,
5. zoom can still open for a selected or double-clicked clip,
6. count and layout continue to update as expected.

### 7.2 Zoom Integration

Zoom requests should move to clip identity rather than thumb-element identity.

Required direction:

1. the grid emits clip id or clip object when zoom is requested,
2. the app orchestration layer resolves the requested clip from the collection model,
3. the reusable zoom overlay component may continue to consume a playable media source rather than the domain `Clip` object directly,
4. app-level zoom behavior must no longer depend on thumb DOM identity.
### 7.3 Save and Load Integration

Save/load behavior should work through the collection model.

Required direction:

1. loading files creates clips and an initial collection,
2. loading a collection file is treated as opening a collection and replacing the current collection with the one described by the file,
3. if the file describes the same collection that is already displayed, the result is effectively a reload of that collection,
4. save serializes the collection model's ordered clip names,
5. no save flow should depend on DOM order as the source of truth.
## 8. Architecture Impact

### 8.1 Expected Module Direction

Expected major architectural pieces after the refactor:

- `src/domain/clip-model.*`
  - owns the clip shape and clip-creation rules.
- `src/domain/clip-collection.*`
  - owns ordered collection contents and collection operations.
- `src/ui/clip-collection-grid-controller.*`
  - owns rendering and interaction for one collection grid.
- `src/app/app-controller.js`
  - composes the new model/controller pieces with zoom, fullscreen, and persistence.

Exact file naming may vary, but these responsibilities must be explicit.

### 8.2 Existing Modules Likely to Change

Expected impact on current files:

- `src/state/app-state.js`
  - replace selected thumb element state with selected clip identity or remove redundant state if the grid component can own it cleanly.
- `src/ui/dom-factory.js`
  - likely absorbed into the new grid component or reduced to a grid-internal helper.
- `src/ui/drag-drop-controller.js`
  - likely folded into the new grid component.
- `src/ui/layout-controller.js`
  - may remain separate in the first pass as a layout-focused helper used by the grid.
- `src/app/app-controller.js`
  - should shrink in clip/grid-specific responsibilities.

### 8.3 Collection Mutation Strategy

The collection model is mutable in this refactor.

Rationale:

1. it fits the current app structure better,
2. it avoids introducing immutability patterns as a second architectural shift during the same refactor,
3. it keeps the migration simpler while still improving boundaries substantially.

## 9. Testing Requirements

### 9.1 Domain-Level Tests

Add or update tests to cover:

1. clip creation rules,
2. collection ordering behavior,
3. collection removal behavior,
4. collection serialization behavior.

### 9.2 Grid Component Tests

Add or update tests to cover:

1. rendering a collection,
2. selection by clip id,
3. reorder emitting a full new order,
4. runtime object URL cleanup,
5. integration points for open/remove actions.

Because a large architecture refactor is likely to invalidate some low-level unit tests while behavior is being moved across module boundaries, implementation should begin by reviewing existing E2E coverage for grid, collection, zoom, delete, save/load, and fullscreen behavior. If coverage is missing for the behaviors most likely to be destabilized by the refactor, new E2E tests should be added before major structural edits begin.
### 9.3 Regression Coverage

Existing app-level behavior must remain covered for:

1. load folder,
2. save collection,
3. collection-file load,
4. drag reorder,
5. delete selected clip,
6. zoom behavior,
7. fullscreen behavior.

The execution plan should begin by reviewing current E2E coverage, strengthening it where needed for the most refactor-sensitive behaviors, and running the full suite before structural work starts.
## 10. Acceptance Criteria

This refactor is complete when:

1. clips have stable app identity independent of DOM nodes,
2. the current working collection is represented by a first-class collection model rather than by DOM order plus arrays of names,
3. the grid is implemented as a dedicated UI component/controller boundary,
4. selection and zoom targeting no longer depend on storing a selected thumb DOM element in app state,
5. save/load behavior operates through the collection model,
6. existing user-visible grid, zoom, save/load, and fullscreen behaviors continue to pass regression tests.




