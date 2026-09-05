# Feature Requests

## Next up
- UI structure
  - gif extractor, gif pipeline, gif browser (future), gif composer (future): which UI best faciliates this?
  - pipelines side panel: find component - tree view, collapsanle side panel
  - gif extractor -> extracted clips side panel (a generic clip display side panel?)
  - implement gif extractor: control handoff (D:\tmp\dev\clip-sandbox\spikes\native-frame-identity-playback\docs\frame-scrub-supporting-player-control-integration-handoof.md)

## Features

### Design and code quality
- add `better-result` for error 
- Code review flow -> put in place [find a good one or add my own instructions]
-  make error log usable: 
   -  one line message, timestamp, module, error message
   -  save in available folder
   -  allow viewing in the ui
   -  place in log folder, not in the pipeline folder as now
-  app/app-controller.js is still huge. Understand why and if and what can be done.
   - runAddToCollection

### Bugs
- In the workspace window, the collection drop down selection overrides the info text on the top bar. Find a place for the info text (perhaps collapsable panel)
- Delete from disk when in collection -> gets error message that collection is out of sync. Remove ffrom collection(s) instead
- bugs under /code-reviews folder

### App
- Add a keyboard map icon in the top bar. When clicked, open a small panel showing all key mappings and their descriptions.
- Add a `?` icon that opens a panel with a brief textual explanation of the main app features, one per row.
- Share collection: allow sending a link to a gallery of clips.
- Add general settings panel: 
  - default audio = on/off
  - movie cache folder location + cleanup
  - default pipelines location: the default location where a new pipeline is opened. 

### Quick Actions
Some quick manipulations on videos that generate new videos in the same collection named: [orig-name]-[action]-[serial]
- trim from start/end to current frame
- slow by X%
- remove background / extract just a specific object/character from the video
- Actions UX
  - Progress when generating video
  - After generation show in compare mode
  
## Pipelines
### Pipeline management sidebar
- Pipelines are viewable via a side-panel tree view 
- Copy clip/s to pipeline -> drag to that pipeline in the sidebar (supports multi-select)
- Create a new pipeline -> creates a physical folder names the same as the pipeline
### New pipeline from movie
- Select a movie file => A new pipeline is created under the main pipelines folder. Its default name is a cleanup version of the movie name (remove all codex info and such).
- The movie is opened in the player control in clip creation mode

## Movie Edit mode
Allows generating clips from a longer movie.
- editor control: D:\tmp\dev\clip-sandbox\spikes\native-frame-identity-playback\docs\frame-scrub-supporting-player-control-integration-handoof.md
- viewer with support for as-you-watch actions
  - q,w,a: start-stop-capture
    - As the movie plays, when a is pressed a clip is created from the timestaps between q and a
      - new clip is added to the current pipeline with a default name: [start-stop]
    - q,w can be pressed multiple times, only last one before x was pressed counts
    - graphic indication of current start and stop ts + thumbnail. Clicking a resets start and stop
    - a -> if clip boundaries are illegal: either start.stop missing or stop is before start -> nothing happens
- Movie edit mode is initiated from within a pipeline
- Allow captuuring frames and enhancing them

### Gif composition mode
A workspace for creating compositions of gifs
- select gifs (across pipelines, optionally by metadata search like all close ups of a woman etc)
- move each gif to its location + resize + shift by #degrees + opacity

## Collection Mode (a.k.a Grid Mode)

### Clip Display
- Control the number of clips on the grid via collection paging.
  - User can choose to display fewer items on the screen and thus potentially introduce paging
    - done using a button which changes the display in steps (e.g. each step makes the clips 20% larger)
    - a change potentially introduces paging to git all the video into that size
  - Paging
    - Add navigation to previous and next screens on the sides as needed.
    - Add a count showing total items and current screen position (`x/y`).

#### Zoom mode
- Respct `display titles` setting
- Allow making it full screen and back
- Compare mode:
  - Compare two clips by opening them in side-by-side zoom and synchronizing their start.
  - The `s` key or a resync button starts them again together from zero.
- Playback control
  - Pause/Play (toggle using spacebar)
  - frame by frame (fwd/bwd arrows)

### Collections
- ctrl+s saves the collection
- Delete collection -> removes the collection file and any references to it
- Open in file explorer -> opens the current pipeline folder in file explorer
- Rename collection
- Startup window for the no-collection state: a centered set of buttons

## Video
### Metadata
A video can have various types of metadata
- Notes: e.g. editing ideas, pipelienes to consider adding to etc, .
  - Notes viewing and editing: 
  - access notes by either 
    - selecting the video and "n" key
    - when mouse hovers there appears a small notes floating overlay icon at the bottom cornere of the video and clicking it.opens md file or shows them in a list inside the app
  - Notes appear as a small dialog with the list of notes
    - A note can be edited, added or deleted
    - Is there a standalone simpel md editor component to be reused?
- Design: each video has notes associated with it, this is a cross-collection association.
- Trail: Per video maintain a tree of its descendants 
  - cross-pipeline: videos can be added to other pipelines. This is a copy operation: copies evolve separately in different pipelines. 
  - editing: video can be created from other videos, e.g. loopify etc. 
- Content: scenes, objects (as word cloud?), camera movements: all with with timestamps
- Where is all the video metadata stored? sqlite? md files such as [video-name].md? 
    - after which size does sqlite start to break? 

#### Metadata examples
- name, length
- shot type: longshot, closeup, static/moving camera
- camera motion: ltr, rtl, up, dpwn, zoom, pan etc, camera speed
- objects: person, hands, etc

## Other
- Support GIF files -> postpone, more complex since app is wired for video files, especially full screen mode

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


