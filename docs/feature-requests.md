- design
  - reusable componenet: clip card
  - reusable component: clip grid
- "grid mode" mode
  - Collections
    - open collection in a new tab, and tab name = name of the collection
    - startup window (when no collection): a set of buttons in the center of the screen (sketch it)
    - allow naming a collection when saving
    - allow renaming a collection
    - allow selecting a range of clips
  - Clip display 
    - hitting m mutes/unmutes a clip: design - should be encapsulated at the clip display level (card? grid? zoom? what is common to all three?) 
    - Compare mode: compare two clips by opening them in side-by-side zoom and synchronizing their start
    -  control number of clips on grid, add arrows for prev/next screens on the sides as needed, add count of how many out of how many (5-10/23 etc)
    -  refresh from folder: reloads the collection according to the order file

- "FS"" mode
  - rename to "Present" mode
  - Support for multiple display modes - allow selecting dynamically by mode name
  FS general (for all views): 
    - toggle metadata display (default is off)
    - select num slots (kb shortcut but also explicit in ui)
    - Modes
      - Collection view
        - select num slots: shows and allows navigating back and forth through the collection screems which hace X vidfeo each (according to num slots) 
      - Randomizer
        - select num slots: number is fixed -> they change randomly within these slots
        - optional: leave last slot emppty (off by default)
      - Cinema: 
        - single clip in the center, large. Content is concatenation of all clips in the order they are in the order file

-Share: allow sending a link to a gallery of clips
  
- Code quality
  - Match code design to concepts: order mode, display mode, display scheme
