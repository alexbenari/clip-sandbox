# Feature Requests

## Design
- `ClipCollectionLoader`: file-level logic where the input is a folder and the output is a `ClipCollection`.

## Grid Mode

### Collections

- On folder selection, all collection files (txt files with filename per line) are enumertaed
  - each appears as an item under the current collecion name
  - when clicked it opens that collection
- move to collection
  - Right click on selected -> move to collection
  - Right click on selected -> move to new collection
- Allow naming a collection when saving.
- Support saving as a new collection.
- Allow selecting a range of clips and deleting them.
- Allow selecting a range of clips and starting a new collection.
- Allow selecting a range of clips and moving them to an existing collection.
- Allow renaming a collection.
- If the user loads a new collection and the existing one has changes, prompt whether to save first.
- Support displaying multiple collections and moving between them, perhaps with internal tabs.
- Refresh from folder: reload the collection according to the collection file.
- Add a startup window for the no-collection state: a centered set of buttons. Sketch it.

### Clip Display

- Hitting `m` mutes or unmutes a clip. Design question: should this be encapsulated at the clip display level (`card`, `grid`, `zoom`), and what should be shared across them?
- Compare mode:
  - Compare two clips by opening them in side-by-side zoom and synchronizing their start.
  - The `s` key or a resync button starts them again together from zero.
- Control the number of clips on the grid via collection paging.
  - Add navigation to previous and next screens on the sides as needed.
  - Add a count showing total items and current screen position (`x/y`).

### App

- Add a keyboard map icon in the top bar. When clicked, open a small panel showing all key mappings and their descriptions.
- Add a `?` icon that opens a panel with a brief textual explanation of the main app features, one per row.

## FS Mode

- Rename to `Present` mode.
- Support multiple display modes and allow selecting them dynamically by mode name.

### General

- Toggle metadata display. Default should be off.
- Select number of slots, both through a keyboard shortcut and explicit UI.

### Modes

#### Collection View

- Select number of slots.
- Show and allow navigating back and forth through collection screens, each showing `X` videos according to the selected slot count.

#### Randomizer

- Select number of slots.
- The number of slots is fixed and clips change randomly within those slots.
- Optional: leave the last slot empty. Default should be off.

#### Cinema

- Show a single large clip in the center.
- Content is the concatenation of all clips in the order defined by the collection file.

## Share

- Allow sending a link to a gallery of clips.

## Other

- Support GIF files and other formats.
