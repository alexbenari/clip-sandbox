---
version: 1
slug: "src-ui-refine-gif-screen-ts"
primary_target: "src/ui/refine-gif-screen.ts"
related_targets: ["src/ui/gif-ranges-panel-control.ts","index.html"]
---

Scope: Refine Gif contextual Operate screen; same Windows desktop workflow and shared player as GIF Extraction.

## Direction contract

THESIS: Review or resolve one captured range against exact frames without leaving the movie context; keep saved-clip editing in its separate future flow.

OWN-WORLD: Inherit the Screening Room Workbench: booth-black media field, rail-navy controls, screen-silver text, quiet slate support, and projector-blue only for current focus and action.

STORY: The user opens an inexact or exact captured range by Refine or double-click, sets either endpoint against displayed canonical frames, locks once, sees the same queue entry update, and explicitly extracts a changed revision when desired. An earlier extracted clip remains saved.

CONTROLS: Q/W stage exact Start/End from the displayed picture; A/S jump to staged exact endpoints; Z previews an eligible exact pair in the shared player; Space pauses into exact scrub and resumes the unchanged in-range loop; X commits the staged pair; E extracts only after commit. The loop is timestamp-driven and may be audible. Back discards staged changes, asking first (Keep editing or Discard) when a staged endpoint differs from the captured range. The Clips panel remains keyboard-focus stable when loop availability changes.

FIRST VIEWPORT: One dominant shared player above a compact two-endpoint workbench; Back and range identity live in the command bar, while the open Clips panel keeps queue context and selection visible.

FORM: Local extension of the approved balanced three-pane workbench; seed key `approved-existing-surface`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
