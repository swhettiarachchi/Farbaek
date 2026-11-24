# ADR 0275: Plans over several sheets

- **Status:** accepted (stage 268, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0201 (one sheet scene for the preview, the PDF and the checks), ADR 0242 (labels placed together), ADR 0259 (leader lines).
- **Changes:** a sheet setting, `severalSheets`; the panel and classic layouts; the plan editor. No migration, no new dependency.

## Context

The owner's brief lists multi-sheet layout among what AutoSurvey doesn't do. A long or large land at the scale the surveyor needs (1:500 for a strip of lots, say) doesn't fit one sheet. Until now that was an error that stopped the export, and the only remedies were a smaller scale or larger paper. Survey practice draws such a plan over several sheets at the chosen scale, each joined to the next by a match line, with a key to the sheets.

## Decision

**A drawing that doesn't fit one sheet at the scale chosen can be drawn over several sheets at that scale, when the surveyor asks for it.**

- **The setting:** "Over several sheets when the drawing doesn't fit at this scale" on the Sheet tab, offered only with a scale chosen (Automatic picks one that fits). Absent unless chosen, so earlier plans and approvals are unchanged.
- **The grid:** sheets side by side with no overlap, each the drawing area's size at the scale, the grid centred on the drawing's extent and filled to 94% at its outside edges. Grid places that show nothing are left out. Sheets are numbered north-west first along each row. Twelve at most (`SHEETS_TOO_MANY` stops the export past that: the scale is what's wrong).
- **Never shrunk, never moved:** every sheet is drawn at the chosen scale with its own viewport. The drawing is cut at the drawing area's edge:
  - lines and outlines are cut where they cross it into the pieces inside, with their own points kept exactly;
  - points, circles and small filled symbols are kept whole when their centre is inside, else left to the neighbouring sheet;
  - words are placed inside each sheet's area by the label solver (its bounds are the area), and kept on the sheet where they stand.
  A line that crosses an edge is drawn up to it on both sheets, so nothing between them is lost.
- **Match lines:** a dashed line along each edge another sheet continues, with "Continued on sheet N" just inside it. Their places are reserved before any label is placed, so no label covers them.
- **The key to the sheets:** the grid of sheets, numbered, with this one shaded and outlined more heavily. On the panel layout it's a panel ("Sheet 2 of 4"); on the classic layout it stands in the strip right of the drawing, under the north needle.
- **Everything else on each sheet:** the title block, the panel or the Reference, the scale, the north, the check line and the plot stamp are on every sheet. The boundaries schedule overleaf covers the whole plan, once.
- **The checks:** each sheet's labels are checked on their own page; what the sheets' drawing noted (labels off the sheet, walls drawn as the boundary, cramped lot labels) is said once. `SHEETS_SPLIT` says how many sheets, as information.
- **The editor:** a plan over several sheets shows one sheet at a time, with a press for each; dragging and tapping use that sheet's viewport.
- **The DXF** is model space and unchanged: one drawing, whole.

## Consequences

- A strip of twelve 40 m lots at 1:500 on A3 is drawn over four sheets, on both layouts, with nothing overlapping.
- **Not yet:**
  - overlapping sheets (some offices repeat a margin on each side of a match line);
  - a sheet's own north or scale placed to avoid the drawing (they keep their fixed places);
  - sheets of different scales, and insets;
  - the DXF's paper space with one layout per sheet.

## Verified

- `tiles.test.ts` (19 cases): the grid; lines cut at the edge with their own points kept, a line leaving and coming back in two pieces, outlines opened only when cut; words, points and symbols kept by where they stand; match lines only where a sheet continues; the key; and on both layouts a strip too long for one sheet: refused unless asked, then drawn over several sheets with every corner on some sheet where its own viewport puts it, no boundary past a sheet's drawing area, and no overlapping labels; more than twelve sheets refused; a drawing that fits stays on one sheet.
- The one-sheet path is unchanged: every earlier sheet test passes, and the owner's real job (classic layout) draws byte for byte as before.
- **Looked at:** the strip's four sheets on both layouts, drawn to PNG.
