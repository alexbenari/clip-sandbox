- "order" mode
  - When loading an order file:
    - if there are missing clips, prompt and based on the user response either:
      - display without them
      - put them at the end with a special border (pink)
  -  Zoom on highlighted clip (Z key or dbl click) displays it larger on top of the order window. Clicking anywhere outside the clip closes the large display.
  -  control number of clips on grid, add arrows for prev/next screens on the sides as needed, add count of how many out of how many (5-10/23 etc)
  -  refresh from folder: considers also the order file

- "FS"" mode
  Support for multiple display modes - allow selecting dynamically by mode name
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
