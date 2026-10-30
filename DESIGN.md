---
name: Clip Sandbox
description: A focused, cinematic workbench for managing and expanding a personal clip collection.
colors:
  booth-black: "#0b0f14"
  rail-navy: "#0f172a"
  screen-silver: "#e5e7eb"
  quiet-slate: "#94a3b8"
  projector-blue: "#7aa2f7"
  warning-red: "#ef4444"
  warning-red-text: "#f87171"
  ready-green: "#22c55e"
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "normal"
    letterSpacing: "normal"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "normal"
    letterSpacing: "normal"
  label:
    fontFamily: "Arial, sans-serif"
    fontSize: "13.3333px"
    fontWeight: 600
    lineHeight: "normal"
    letterSpacing: "0.2px"
rounded:
  menu-item: "8px"
  media: "10px"
  control: "12px"
  card: "14px"
  dialog: "16px"
  zoom: "18px"
  status: "999px"
spacing:
  tight: "6px"
  compact: "8px"
  standard: "10px"
  control-block: "12px"
  canvas: "14px"
  toolbar-inline: "16px"
  dialog: "18px"
components:
  button-standard:
    textColor: "{colors.screen-silver}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-primary:
    textColor: "{colors.screen-silver}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-destructive:
    textColor: "{colors.screen-silver}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  collection-selector:
    backgroundColor: "{colors.rail-navy}"
    textColor: "{colors.projector-blue}"
    rounded: "{rounded.control}"
    padding: "8px 34px 8px 12px"
  clip-card:
    backgroundColor: "{colors.rail-navy}"
    textColor: "{colors.screen-silver}"
    rounded: "{rounded.card}"
---

# Design System: Clip Sandbox

## Overview

**Creative North Star: "The Screening Room Workbench"**

Clip Sandbox is a low-light working environment in which the moving image is the material and the interface is the bench around it. The visual system should feel cinematic because it protects attention from glare and distraction, but practical because every surface exists to support repeated sorting, reviewing, and clip-making actions.

The incumbent interface combines booth-black space, blue-black working surfaces, screen-silver text, and a single projector-blue accent. Rounded controls and ambient shadows give frequently handled elements a tactile presence, while the media field remains quiet and visually dominant. This is an operational tool, not entertainment browsing: atmosphere supports concentration rather than spectacle.

**Key Characteristics:**

- Media-first dark canvas with minimal visual competition.
- Compact, tactile controls grouped into a persistent workbench rail.
- One cool blue accent reserved for primary action, active context, focus, and selection.
- Rounded blue-black surfaces with restrained borders and ambient depth.
- Dense but calm spatial rhythm suited to long review sessions.

## Colors

The palette evokes a dark screening booth: nearly black room surfaces, cool navy equipment, silvered interface text, and a controlled blue projection signal.

### Primary

- **Projector Blue** (`#7aa2f7`): identifies the active collection, focus treatment, selection rings, drag targets, and the primary-action family.

### Neutral

- **Booth Black** (`#0b0f14`): the application canvas and default low-glare environment.
- **Rail Navy** (`#0f172a`): toolbars, cards, dialogs, and elevated working surfaces.
- **Screen Silver** (`#e5e7eb`): primary labels and high-priority interface text.
- **Quiet Slate** (`#94a3b8`): counts, hints, supporting copy, and low-priority borders.

### Status

- **Ready Green** (`#22c55e`): progress and success state on the compact activity indicator, and the lock icon of a locked capture range.
- **Warning Red** (`#ef4444`): destructive actions, errors, and missing-entry conflicts, as fills and borders.
- **Warning Red text** (`#f87171`): the destructive-text variant for red words on dark surfaces, such as destructive menu commands and failed-extraction lines; it reaches at least 4.5:1 on the lightest menu-row surface where Warning Red does not.

### Named Rules

**The Single Projector Rule.** Projector Blue is the only general-purpose accent; use it to locate the current action or state, not to decorate every surface.

**The Black Frame Rule.** Video itself sits on true black or near-black so letterboxing and varying source dimensions recede instead of becoming new UI shapes.

## Typography

**Display Font:** None; the system deliberately has no promotional display register.
**Body Font:** System UI stack with Segoe UI preferred on Windows.
**Label Font:** Chromium's incumbent Arial control rendering.

**Character:** Typography is compact, neutral, and legible at utility scale. Hierarchy comes primarily from weight, size, color, and placement rather than from multiple type families or expressive display styling.

### Hierarchy

- **Title** (700, `18px`, normal line-height): dialog headings and the strongest local hierarchy.
- **Body** (400, `16px`, normal line-height): default application copy.
- **Control Label** (600, `13.3333px`, `0.2px` letter-spacing): compact buttons and operational commands.
- **Collection Context** (700, `15px`, `0.03em` letter-spacing): the centered active collection selector.
- **Supporting Label** (400, `12–14px`, normal tracking): clip filenames, counts, hints, validation, and activity history.
- **Machine Detail** (monospace stack, `13px` where used): filenames and conflict/delete previews that must preserve exact characters.

### Named Rules

**The Utility Voice Rule.** Use sentence case and direct verbs; do not introduce editorial headlines, all-caps command chrome, or ornamental type into the operating interface.

## Layout

The main screen is a persistent workbench rail above a media-first canvas. The toolbar is sticky, wraps when necessary, and uses a compact `10px` gap with `12px 16px` padding. At central command-host widths of at least `850px`, the active collection selector is centered on its own row. At narrower widths it shares the final row with the clip count. All four commands retain icons and text, wrapping above the selector when needed.

The clip field uses a dense responsive grid whose column count and cell height are computed from the available viewport and the clips' intrinsic dimensions. The canvas uses `14px` padding and a `10px` gap. Cards remain mounted across collection changes when possible, preserving media continuity. Fullscreen removes the workbench rail and surface decoration so only the clip field remains.

Dialogs are compact rather than page-like, generally constrained to `420–520px` and centered over a dimmed, lightly blurred backdrop. Menus attach to their invoking control or pointer location and stay within a `12px` viewport margin.

## Elevation & Depth

Depth is ambient rather than dramatic. Blue-black tonal layers establish the primary hierarchy; shadows separate handled or temporary surfaces from the booth-black canvas. Backdrop blur is reserved for the persistent rail and modal backdrops, never for the video field.

### Shadow Vocabulary

- **Handled Surface** (`0 8px 24px rgba(0,0,0,.35)`): buttons, selectors, cards, and inline panels.
- **Floating Utility** (`0 18px 38px rgba(0,0,0,.35)`): context menus and activity history.
- **Focused Viewing** (`0 20px 60px rgba(0,0,0,.45)`): the zoom frame only.

### Named Rules

**The Ambient Booth Rule.** Shadows create separation without looking illuminated; avoid white highlights, glossy reflections, and conspicuous floating-card stacks.

## Shapes

The system uses gently rounded rectangles with a clear scale: `8px` for menu items, `10px` for media and fields, `12px` for controls, `14px` for clip cards and floating status panels, `16px` for dialogs, and `18px` for the zoom frame. A fully round `999px` shape is reserved for the activity-status light.

Borders are one-pixel cool-slate strokes at low opacity. Media is clipped inside its containing card with slightly tighter corners than the outer surface, creating a practical inset-frame effect.

**The Nested Radius Rule.** Inner media and fields use a smaller radius than their containing card or dialog; do not stack identical rounded rectangles inside one another.

## Components

### Buttons

Buttons feel compact and tactile rather than flat or oversized.

- **Shape:** gently rounded control corners (`12px`) with `10px 14px` padding.
- **Primary:** Screen Silver text over a deep blue vertical gradient; reserved for the initiating action or safe confirmation.
- **Secondary:** Screen Silver text over a dark slate-to-navy gradient.
- **Destructive:** Screen Silver text over a deep Warning Red vertical gradient (Warning Red mixed with black, 70% to 45%), same shape and padding as Primary. Reserved for confirming an action that removes files from the folder, such as Move to Recycle Bin or Replace when saving a refined clip; never used for safe confirmations.
- **Hover / Focus / Active:** a small brightness increase on hover, a one-pixel downward press on activation, and a visible Projector Blue focus outline where explicitly styled.
- **Disabled:** reduced opacity (`.45–.5`) without changing the component's silhouette.

### Navigation

The toolbar is the application's workbench rail: a translucent Rail Navy layer with mild blur, a faint lower border, compact action groups, a centered collection selector, and status anchored to the far edge. It may wrap, but it must not become a conventional application sidebar without an explicit surface-level decision.

### Collection Selector

The active collection is the calm focal control. It uses Projector Blue text, a low-opacity blue border, bold `15px` type, a restrained text glow, and a compact custom chevron. On narrow layouts it expands to the rail width rather than truncating the action groups further. While the view has unsaved changes, a quiet `12px` Quiet Slate "Unsaved" label with a small Projector Blue dot sits inside the selector before the chevron, and a primary Save command appears last in the Collection command row.

### Clip Cards

Clip cards are practical inset viewing frames. They use a navy vertical gradient, a faint cool border, `14px` corners, and ambient shadow. The video scales up or down to fill the card, contained on true black, so a source smaller than its card letterboxes in black instead of floating inside the navy frame; the same holds in Collection full screen. Filenames sit over a bottom fade in small Screen Silver text; hiding titles removes only that overlay and the source glyph. A clip that came from a movie through Clip Sandbox carries a quiet source glyph in its top-left corner: a 16px 1.6px-stroke film icon in Quiet Slate on a small translucent Booth Black backing, whose tooltip names the movie; other clips carry no mark. Selection is communicated by a `3px` Projector Blue ring, while drag targeting uses a dashed blue inset border. Keyboard focus is a separate `2px` Projector Blue outline set `5px` outside the card, shown only for keyboard focus, so it reads apart from the selection ring.

### Dialogs and Fields

Dialogs use near-opaque Rail Navy, `16px` corners, a low-opacity blue or red border according to intent, and a dimmed blurred backdrop. Text fields and selects use a darker inset surface, `10px` corners, a subtle slate border, inherited type, and full available width. Placeholder text is Quiet Slate at full strength. Destructive dialogs preserve the same shape language and change semantic color rather than adopting a separate visual style.

### Context Menus

Context menus are compact floating utilities with `12px` outer corners, `8px` padding, a near-opaque booth-dark surface, and the Floating Utility shadow. Menu rows have `8px` corners, left-aligned text, optional `16px` inline SVG icons, and the standard secondary-button gradient without their own shadow. An entry that opens an editing mode, such as Refine, sits first, above a one-pixel slate divider. A destructive command sits last, below a one-pixel slate divider, in Warning Red text (`#f87171`) with a 1.6px-stroke trash icon; the same rule applies to the toolbar Actions menu. A disabled row that has a reason shows it as a second line in `12px` Quiet Slate at full strength, so it reads without hovering while the label stays dimmed.

### Activity Indicator

Activity is a compact, labeled status control with a 34px pointer target and stable minimum width. The dot and text communicate Ready, Working, or the unresolved-error count; the accessible name and tooltip carry the same meaning. Only the progress dot pulses. Errors take precedence and remain discoverable when auto-opening would interrupt protected focus. Notes, such as ignored unknown settings, appear only in the history: they neither count as errors nor open the panel.

### Movie Review Player

GIF Extraction and Refine Gif share one player, which Zoom edit mode also borrows in a picture-only look (see Zoom Edit Mode). Its picture is a true-black `16:9` frame, capped at `1100px` wide, that shrinks to the height left over after the transport, the capture row and, on Refine Gif, the whole two-endpoint workbench, so these stay in the first viewport down to a `900 × 700` window with the Clips panel open. The capture row and workbench actions wrap rather than clip. The player's Projector Blue focus ring appears only for keyboard focus and hides after a click on the picture until the next key. Refine Gif states its next step once, in the workbench; its command bar carries only Back, the range identity and its movie, and Cancel extraction while a batch runs. In the Clips panel, Projector Blue marks only the selected range: exact ranges have no colored border, inexact ranges a dashed Quiet Slate border beside their inexact label, a locked range a Ready Green lock icon and an unlocked one a Quiet Slate lock, and extraction results read in Quiet Slate.

### Scrollbars

Where a surface can still overflow, such as the GIF screens in a small window or the keyboard map, the scrollbar stays visible: thin, Quiet Slate at low opacity on a transparent track.

### Zoom Frame

Zoom is a centered, media-only viewing surface constrained to roughly two-thirds of the viewport and capped at `1200px × 820px`. It uses true black, `18px` corners, a faint cool border, and the strongest ambient shadow in the system. The surrounding overlay remains transparent so zoom reads as focus, not navigation to another screen.

### Zoom Edit Mode

Zoom edit mode edits the zoomed clip in place, inside the same Zoom frame; nothing else on screen changes. The frame holds a column: the movie review player in its picture-only look on top, filling the frame on true black with no `16:9` cap, and one hint line below it. The picture-only look has no progress bar, transport, readiness text, empty state or busy indicator: there is no timeline and there are no buttons, because every action is a key.

The hint line is the mode's only text. It is a band of Booth Black under the picture with a one-pixel slate top border, `8px 14px` padding and `13px` type. The keys sit on the left in Quiet Slate; a status sits on the right in Screen Silver and is announced politely to assistive technology; the two wrap rather than clip, and the status takes no space when empty. Wording lives in `src/app/zoom-edit-mode-text.ts`, and key names come from the same constants as the bindings:

- **Keys** are short verb pairs joined by middle dots: "Q start · W end · A/S jump · Z loop · L loopify · X save · Esc leave". While saving they read only "Esc cancel saving".
- **Ongoing work** is a short phrase ending in an ellipsis: "Finding the source movie…", "Preparing the movie around this clip…", "Making the loop preview: 120 of 300 frames…", "Saving: encoded 120 of 300 frames…".
- **Staged edits** are named by their menu labels joined by a plus, then what the combination costs, when the hint has nothing more urgent to say: "Refine + Loopify staged · saved without sound".
- **A key that cannot act** changes nothing and says why in full sentences, then what to do, naming keys: "This frame is after the end, so it cannot be the start. Go back, or set a later end with W first." Limits are stated plainly: "Extending stops one minute past the clip’s original start and end." A clip that can only be trimmed says so and why: "No source movie was chosen, so this clip can be trimmed but not extended."

Statuses use no error color; failures that need recovery go to Activity, and the hint line keeps only what the user can act on now. A loop preview that could not be made says so until the next key, with the way on: "The loop preview could not be made. Press Z to loop the range forward only."

With Loopify staged, Z shows what would be saved: a low-resolution preview, forward then backward, silent and looping, laid over the picture in the same frame with no chrome of its own. While it is being made the exact picture stays and the hint line shows the progress; Z again returns to the exact picture, and any other key does too.

Zoom's edit menu lists the mode's edits, Refine then Loopify, each an entry into the mode (Loopify enters with Loopify staged).

Saving asks in a compact confirmation dialog whose title names the clip by its staged edits ("Save the refined clip", "Save the looped clip", "Save the refined and looped clip") and whose sentence names the clip, explains both choices and ends with any loss ("The looped clip is saved without sound."). Its actions read Cancel, Replace (Destructive, because the original goes to the Recycle Bin) and Keep both (Primary, focused on open). Leaving with staged edits asks in the same compact dialog shape: the question names what would be lost without frame numbers ("Discard the new start and end?", "Discard Loopify and the new start?"), the note says the clip file stays as it is, and the actions read Keep editing and Discard.

## Do's and Don'ts

### Do:

- **Do** keep video and clip imagery visually dominant over controls and container decoration.
- **Do** use Projector Blue for active context, focus, primary action, selection, or direct manipulation feedback.
- **Do** preserve the compact `8–18px` spacing and radius vocabulary when introducing new components.
- **Do** express errors and destructive actions through Warning Red while retaining the shared component structure.
- **Do** let fullscreen and focused-view modes remove interface chrome rather than restyle the media.

### Don't:

- **Don't** turn the interface into a streaming catalog with poster-scale artwork, promotional banners, or entertainment-browsing patterns.
- **Don't** introduce light canvases, white cards, glossy highlights, or broad decorative gradients into the low-glare working environment.
- **Don't** use Projector Blue as general decoration or add competing accent hues outside semantic status states.
- **Don't** introduce oversized headings, ornamental display type, or marketing-style copy into operational screens.
- **Don't** add dashboard panels, metrics, or navigation structures unless a real workflow requires them.


### Application shell refinement

The global bar orders Activity, a separator, then the adjacent keyboard and Settings icon controls, followed by native-caption separation. Local 1.6px-stroke SVG icons use currentColor. Handled surfaces use `#141f30` and inset surfaces `#0c131f` as restrained Rail Navy tonal layers, with `rgba(148,163,184,.2)` borders. Utility headers include explicit Close controls. A side panel with nothing for the active screen is removed together with its rail, and the workspace takes its width: the Clips panel appears only on the GIF screens. Pipelines tree group headings use the Supporting Label style in Quiet Slate. Keyboard group headings distinguish Grid, Zoom, Zoom edit, Fullscreen and Global; keycaps remain static. The Settings surface contains only the two implemented preferences, with a 22px local title and left-to-right filesystem field. Small keycaps use a 6px radius within the 14px utility surface.
