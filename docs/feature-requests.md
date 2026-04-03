# Feature Requests

## Design
- bootstrap 
  - different name (app-controller?) and state as part of this new class
  - remove non-orchstration code
- business logic -> move functionality into domain when needed (e.g. collection-anme.js?)
- layout controller and rules -> fold into grid controller when applicable, leave FS for future
-  `ClipCollectionLoader`: file-level logic where the input is a folder and the output is a `ClipCollection`.
-  Reusable UI components imported from a separate library: zoom view and rclick menu

## Grid Mode

### Collections
- Allow renaming a collection.
- Add a startup window for the no-collection state: a centered set of buttons. Sketch it.
- support gif format

### Clip Display

- Compare mode:
  - Compare two clips by opening them in side-by-side zoom and synchronizing their start.
  - The `s` key or a resync button starts them again together from zero.
- Control the number of clips on the grid via collection paging.
  - Add navigation to previous and next screens on the sides as needed.
  - Add a count showing total items and current screen position (`x/y`).

### App
- Add a keyboard map icon in the top bar. When clicked, open a small panel showing all key mappings and their descriptions.
- Add a `?` icon that opens a panel with a brief textual explanation of the main app features, one per row.## Share

- Allow sending a link to a gallery of clips.

## Other

- Support GIF files and other formats.
- Add general settings panel: 
  - default audio = on/off

## Presentation mode (aka FS Mode)
- Rename to `Present` mode.
- Acces from drop down menu with play like arrow
  - Click on arrow -> default presentation mode
  - Drop down -> other presentation modes
  - Within present mode, there is a access to a config pane for presentation settings of that mode

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


