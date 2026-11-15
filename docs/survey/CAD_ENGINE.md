# Survey Studio plan editor

The plan editor is the Plan step of a project: [`plan-editor.tsx`](../../src/components/survey/plan-editor.tsx), drawn with [`sheet-svg.tsx`](../../src/components/survey/sheet-svg.tsx). It edits the drawing document, never a coordinate. This document describes what it does after stage 190, and what a full CAD editor still needs (planned for stage 195).

## What it edits

| Kind of edit | Examples | Effect on measurements |
| --- | --- | --- |
| **Presentation** | Label offsets, layer visibility and locks | None. The sheet's figures stay as computed |
| **Sheet fields and settings** | Plan number, dates, lot, location, boundary descriptions, legend, remarks, paper, orientation, scale, overleaf, permit box, the responsible surveyor | None on geometry. Scale and paper change where the drawing sits on paper |
| **Boundary and features** | The order of boundary points, buildings, walls, fences, drains, road edges, utilities | Changes which points are joined, so the computed legs and area change. Done on the Boundary step, not in the plan editor |
| **Points** | | Never. Imported points can't be edited anywhere; a correction is a new import with new point numbers |

The editor's footer says so: "Labels move on paper only: no coordinate changes."

## How it renders

- The editor holds the document in state and runs `buildPlan` in the browser after every change, with the same engine the server and the PDF use.
- It draws the front page of the composed sheet scene (`plan.sheet.pages[0]`) as one SVG in sheet millimetres (`viewBox`). The overleaf pages are composed but not shown in the editor; they appear in the PDF.
- On screen the colours come from the design tokens; the PDF prints in fixed black and greys (see [PLAN_SHEET_SPECIFICATION.md](PLAN_SHEET_SPECIFICATION.md)).
- Hidden layers are dropped twice: `composeSheet` skips them when it draws the model, and `SheetSvg` skips any item on a layer in its `hidden` set.
- The preview drops the DRAFT line only when the version is approved **and** nothing has changed since loading it. Any unsaved edit puts DRAFT back. An approved, unedited version shows the surveyor's details from the approval record (as they were when the surveyor approved), like the PDF; once edited, the preview uses the named surveyor's current profile.

## Pan and zoom

The view is a rectangle on the sheet, `[x, y, width, height]` in millimetres. It starts as the whole page, and resets to the whole page when paper or orientation changes.

| Input | Does |
| --- | --- |
| Drag anywhere (mouse, pen or one finger) | Pans, once the pointer has moved more than 3 px |
| Mouse wheel | Zooms by 1.18 per notch, about the pointer |
| Two fingers | Pinch zoom, about the view's centre |
| Zoom in and Zoom out buttons, `+` or `=` and `-` | Zoom by 1.25 and 0.8, about the view's centre |
| Whole sheet button, `0` | Shows the whole page |
| Arrow keys | Pan by 8% of the view's width |

Zoom is limited to a view between 8 mm and 1.2 times the page width. The canvas has `role="application"`, takes keyboard focus, and has an `aria-label` that lists these controls. Pointer capture keeps a drag going when the pointer leaves the canvas, where the browser allows it.

## Selection

A press and release without moving more than 3 px selects what was pressed and opens the Selected panel. Pressing empty paper clears the selection, as does `Escape`.

Every drawing primitive carries an `entity` tag from the composer:

| Entity | Selected panel shows |
| --- | --- |
| `leg:<i>` | Bearing (DMS to 0.1″), quadrant bearing, distance to 0.1 mm. "Computed from the two points' coordinates. To change it, import corrected points." |
| `pt:<id>`, `mark:<id>` | Easting and northing to 0.1 mm, elevation, code. "Imported, so it can't be edited here. Its label can be moved." |
| `boundary`, `lot`, `lot-extent` | Extent in A-R-P, hectares to 6 decimals, m² to 3, perimeter, the number of legs. "Grid area by the coordinate method." |
| `feature:<id>` | Its points and whether it is a closed outline or an open line. "Change features on the Boundary step." |
| `north`, `scalebar`, `checkline` | Nothing; the panel asks to tap a line, point or label |

The selected path gets a translucent accent halo; a selected point is drawn at 1.8 times its radius; selected text turns the accent colour. Paths take pointer events on their stroke, or on their painted area when filled.

## Moving labels

- A text item can be dragged when the editor isn't read-only, it has an entity, its layer isn't `SHEET` or locked, and it isn't the north point, the scale bar or the check line.
- The drag adds the movement, in sheet millimetres, to `labelOffsets[entity]`, clamped to ±200 mm (the schema's limit).
- The composer adds the offset to that entity's label when it next composes. The geometry never moves (skill rule 7), and the composer never moves a label by itself: overlaps are reported as `LABELS_OVERLAP` for a person to fix.
- "Put the label back" in the Selected panel deletes the entity's offset.
- Label offsets apply to the sheet only. The DXF places its text from the geometry and ignores them.

## Undo and redo

The editor keeps a history of whole documents in memory: a stack, the current index, the index that matches the last saved version, and the key and time of the last edit.

- Every change goes through `update(change, key?)`, which clones the current document, applies the change and pushes the result, dropping any redo entries.
- **Coalescing.** An edit with the same key as the previous one, within 1.5 s, and after the last save, replaces the top entry instead of adding one. Each text field has its own key, so typing a word is one undo step. A label drag uses the key `drag:<entity>:<startX>:<startY>`, so one continuous drag is one step.
- Undo: the button, `Ctrl+Z` or `Cmd+Z`. Redo: the button, `Ctrl+Shift+Z`, `Ctrl+Y` or the `Cmd` equivalents. Both end coalescing.
- The editor is dirty when the current index isn't the saved one. Undoing back to the saved index makes it clean again; if the saved entry has been cut from the stack by a new branch, the editor stays dirty until the next save.
- While dirty, leaving the page asks first (`beforeunload`).
- The history resets after a save: the page reloads the project and mounts a new editor for the new version (`key={data.drawing.version}`).

## Layers

The 14 layers of `LAYER_IDS` in [`document.ts`](../../src/core/survey/document.ts). The Layers panel lists 13 of them, every one but `TITLE`:

| Layer | Label | What the composer puts on it |
| --- | --- | --- |
| `BOUNDARY` | Boundary | The parcel's ring |
| `POINTS` | Boundary points | A small circle at each boundary vertex |
| `POINT_NUMBERS` | Point numbers | The point numbers |
| `DIMENSIONS` | Bearings and distances | One label per leg |
| `LOT_TEXT` | Lot and extent | "Lot <n>" and the A-R-P extent at the centroid |
| `BOUNDARY_MARKS` | Boundary marks | Each boundary point's code |
| `BUILDINGS`, `WALLS`, `FENCES`, `DRAINS`, `ROADS`, `UTILITIES` | Buildings, Walls, Fences, Drains, Roads, Utilities | Features and their codes |
| `TEXT` | Text | Nothing on the sheet yet; the DXF puts its notes here |
| `TITLE` | (not listed) | The north point, the scale bar, the check line, and the panel and overleaf text |

The sheet frame and panel rules are on a separate `SHEET` layer that the panel doesn't list either.

- **Show and hide** sets `layers[l].visible`. Every layer except `TITLE` and `TEXT` is checked by the composer, so hiding it removes its items from the scene: from the preview, the PDF and the label-overlap check. In the DXF the layer is written switched off (a negative colour) with its entities kept.
- **Lock** sets `layers[l].locked`. A locked layer's labels can't be dragged. Nothing else is editable on the canvas, so a lock has no other effect yet.
- Both are document edits, saved with the version and undoable.
- `TITLE` can't be hidden or locked. The north point, scale bar, check line and title block always print, so the editor never hides them either: it leaves `TITLE` out of the Layers panel and out of the set it passes to `SheetSvg`, even if a stored document marks it hidden. The preview and the PDF show the same sheet.

## The Sheet panel

Paper (A4, A3, A2), orientation, scale (the suggested scale or any of `STANDARD_SCALES`), the overleaf schedule, and the development permit box (for UDA areas). Then the plan fields, the boundary descriptions ("What adjoins each side, as you found it. Farbaek never fills these in."), the references (the legend: edit, remove, add up to 30, or start again from the examples), and the responsible surveyor, chosen from members who have entered their details.

## Saving

"Save version" (or `Ctrl+S` / `Cmd+S` on the canvas) calls `saveSurveyDrawingAction` with the version the editor started from. The server checks the document and inserts the next version; if someone saved first, it refuses with `VERSION_CONFLICT` and asks for a reload. The status line shows "Saving…", "Unsaved changes" or "Version N".

## The Boundary step

[`boundary-editor.tsx`](../../src/components/survey/boundary-editor.tsx) is the other editing surface:
- **The boundary** is typed as point numbers in order, separated by spaces, commas or semicolons. Unknown numbers are listed and stop the save. The legs table, extent, perimeter and the ring problems (crossing, a repeated point, two points on one spot, fewer than three points) update as you type. It never closes or reorders the ring.
- **Features** are added by kind, code (up to 12 characters) and point numbers in order. A closed outline needs three or more points. Features can be removed.
- "Save boundary and features" saves a new version with the note "Boundary and features".

## Read-only

The Sample project, the demo workspace, a workspace with writes off, and viewers get the editor with every control disabled and the reason shown in the toolbar. `update` does nothing in read-only mode, so pan, zoom and selection still work but nothing changes.

## Not built yet

Planned for stage 195 (full CAD tools) unless another stage is named:

- drawing or editing geometry on the canvas, and choosing boundary points by tapping them (the boundary is typed today);
- snapping, measuring, and construction aids;
- free text, dimension and symbol entities placed by hand;
- moving several labels at once, rotating a label, or nudging one with the keyboard;
- a custom scale (the schema accepts any whole scale from 1:50 to 1:100,000, but the editor offers only the standard scales);
- controls for the precision settings (`perchDecimals`, `secondDecimals`, `distanceDecimals`), which keep their defaults;
- a preview of the overleaf pages in the editor;
- opening or comparing an older version (History lists versions; the project page always shows the latest);
- a Canvas or WebGL renderer for large drawings. The research suggests SVG is slow around 10,000 entities and names Konva 10.9.1 as a candidate; any new dependency needs the owner's approval;
- importing a DXF or a scanned plan as a backdrop.
