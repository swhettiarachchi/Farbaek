# Survey Studio plan sheet specification

A plan sheet is built in two steps. A versioned **template** (data) says how the sheet looks. `composeSheet` turns a template, a drawing version and the points into a **sheet scene**: drawing primitives in millimetres that the SVG preview, the PDF writer and the checks all read (ADR 0201). Code: [`template.ts`](../../src/core/survey/sheet/template.ts), [`scene.ts`](../../src/core/survey/sheet/scene.ts), [`compose.ts`](../../src/core/survey/sheet/compose.ts).

## The template: `SRI_LANKA_CADASTRAL_V1`

`id: "lk-cadastral"`, `version: 1`, name "Sri Lankan land survey plan". It follows the sections in the owner's brief for a Sri Lankan land survey plan. The reference plan image wasn't available when it was made; the layout is a starting template, and where no official source sets a wording, the wording is a caption a surveyor can change in a later stage (see the status table below). `TEMPLATES` lists this one template.

| Setting | Value (mm) |
| --- | --- |
| Margin, paper edge to frame | A4 8, A3 10, A2 12 |
| Text sizes | title 5, heading 2.6, body 2.4, small 1.9, label 2.2, table body 2.2 |
| Line weights | frame 0.6, boundary 0.5, feature 0.3, panel 0.25, thin 0.18 |
| Landscape side panel width | 30% of the page width, kept between 96 and 140 |
| Portrait bottom band height | 34% of the page height, kept between 92 and 170 |

Captions: "PLAN No.", "Lot", "Plan of the land called", "Situated at", "Extent", "Computed from coordinates", "Stated extent", "Boundaries", "North by", "East by", "South by", "West by", "References" (the legend), "Survey", "Surveyed on", "Plan date", "Previous plans", "Remarks", "Licensed surveyor", "Signature", "Seal", "For the development permit", "Grid", "Overleaf schedule", "Coordinates of boundary points", "Bearings and distances", "Area".

The drawing document doesn't yet record which template or template version it used; `buildPlan` always uses this one.

## Paper

`PAPER_SIZES`: A4 210 × 297, A3 297 × 420, A2 420 × 594 mm, in landscape or portrait. A new project starts on A3 landscape.

## The sheet scene

[`scene.ts`](../../src/core/survey/sheet/scene.ts):
- **Units and axes.** Millimetres on paper, origin at the top-left corner, y downward.
- **Primitives.** `path` (points, closed, stroke width in mm, colour, optional fill and dash pattern in mm), `text` (position, size in mm, regular or bold, sans or mono, anchor start, middle or end, rotation in degrees clockwise about its position, colour) and `circle`.
- **Colours** are names: `ink`, `muted`, `faint`, `red`, `paper`. The renderer chooses the actual colour.
- **Tags.** Every primitive has a layer (one of the 14 drawing layers, or `SHEET`) and, where it belongs to a drawing entity, an `entity` id for selection.
- **Pages.** A list of pages, each with its size and role, `front` or `overleaf`.
- **Model to paper.** `toPage(viewport, e, n)`: one metre on the ground is `1000 / scale` mm on paper, about the viewport's centre, with north up. `toModel` is the inverse, for clicks.
- **Text width.** `textWidth` adds up each character's advance width in em, then multiplies by the size and by 1.04:
  - **Geist:** advances measured from `android/app/src/main/assets/fonts/geist.ttf` with fontkit, for printable ASCII (U+0020 to U+007E) and the survey symbols ° ′ ″ ² × – ’;
  - **Geist Mono:** 0.6 em for every character;
  - **anything else:** 0.7 em.

  The 4% margin, applied to all text, covers the stroke that draws bold, so wrapping and the overflow and overlap checks err toward "too long". Capitals are wide in Geist: 31 of "WM" alternating overflow an A4 landscape panel (tested). `wrap` breaks at spaces and keeps an over-long word whole; such a word then counts as overflow.

## The front page

### Frame, panel and drawing area

- The frame is a rectangle at the margin.
- **Landscape:** a vertical rule cuts a side panel off the right; the panel is one column. **Portrait:** a horizontal rule cuts a band off the bottom, split into two columns at the page's centre; the panels are shared between them, the first half (rounded up) on the left.
- The drawing area (the viewport) is the rest, inset 6 mm from the frame and the panel. For A3 landscape that is a 126 mm panel and a 262 × 265 mm drawing area.

### The drawing

All of it at the plan's exact scale, centred on the middle of the drawn points' extent:

| Item | How it is drawn |
| --- | --- |
| Features | Paths at 0.3 mm. Fences dashed 1.6 / 0.8 mm, drains 3 / 1 mm |
| Feature codes | A closed feature (a building): at the average of its vertices. An open feature (a wall, fence or drain): parallel to its longest segment, on the side toward the lot, so a wall along a boundary leg never covers that leg's bearing label |
| Boundary | The ring at 0.5 mm, closed when it has three or more vertices |
| Leg labels | `<bearing DMS>  <distance>` (two spaces), parallel to the leg, turned to read upright, with the nearer edge 1.1 mm clear of the line, outside the lot. Outside is taken from the ring's direction on the page, not from the centroid, so it holds for concave lots too (the centroid is the fallback when the ring has no area) |
| Boundary points | Circles of 0.7 mm radius, filled with paper |
| Point numbers | Bold, 2.8 mm out from the point, away from the lot's centroid |
| Mark codes | The point's code in `muted`, one line further out than its number: above or below it when the point faces up or down the page, below it when the point faces sideways. Never over the point |
| Lot text | "Lot <n>" in bold at body size × 1.35, and the A-R-P extent under it, at the centroid. Only for a simple ring of three or more points |
| North point | Top right of the drawing area: a filled arrow, "N", and "Grid north" (or "Site grid north" for local coordinates) |
| Scale bar | Bottom left: four alternating segments of a round length (1, 2, 5 or 10 times a power of ten metres), ticks at 0, the half (with as many decimals as it needs, up to two, so half of 5 m reads 2.5) and the full length in m, and "Scale 1:N" in bold |
| 100 mm check line | Top left, when the drawing area is at least 104 mm wide: a 100 mm line with end ticks and "100 mm when printed at actual size" |

Label offsets from the document are added to the label's position. Nothing else ever moves a label or the geometry.

### The panels

In this order, each closed by a thin rule:

1. **Title.** "PLAN No. <number>", "Lot <lot>" when set, "Plan of the land called <name>", "Situated at <village>, <GN> GN Division, <DS> DS Division, <district> District, <province> Province" (the parts that are filled in). Then, in red, unless this exact version is approved: **"DRAFT. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet."**
2. **Extent.** The A-R-P extent in bold, "<ha> ha, <m²> m²" (4 and 2 decimals), and "Computed from coordinates (coordinate method)." When the boundary isn't a simple ring of three or more points: "Not computed: the boundary isn't complete." Then "Stated extent: …" when one is entered.
3. **Boundaries.** "North by", "East by", "South by", "West by", each with what the surveyor typed.
4. **References.** Each legend code and meaning. While the legend is still exactly the brief's examples, a red line: "Starting examples, not yet reviewed by the surveyor."
5. **Survey.** "Surveyed on", "Plan date", "Previous plans", and "Remarks" when set.
6. **Licensed surveyor.** The chosen surveyor's name in bold, designation, "Registration: …", address and contact, exactly as they entered them; or "Not chosen yet." Then an empty **Signature** box (15 mm high) and an empty **Seal** box (18 × 30 mm), to sign and stamp by hand.
7. **Development permit box**, only when the setting is on: a 75 × 50 mm box captioned "For the development permit" (UDA regulation 9(p), for plans in UDA-declared areas).
8. **Notes**, in `muted`:
   - the CRS: "Grid: SLD99 / Sri Lanka Grid 1999 (EPSG:5235). Confirmed by <name> on <date>." or "Not confirmed by a person.", or "Coordinates: Local coordinates (not georeferenced).", or "Coordinate system: not set.";
   - the bearing convention and "Distances are horizontal grid distances in metres.";
   - "Scale 1:N on A3. Print at 100% (actual size): fitting to the page changes the scale.";
   - "Prepared with Farbaek Survey Studio (survey-engine/1.0.0)."

An empty field prints as a dotted line (`..........................`), so a missing value is visible and never filled in for the surveyor.

## Overleaf pages

Composed when the `overleaf` setting is on (the default) and there is a parcel. Each page has the frame, "PLAN No. <number>" at the top left and "Overleaf schedule" at the top right. Then:

1. **Coordinates of boundary points:** Point, Easting (m), Northing (m), Elevation (m), Code. Coordinates to 3 decimals, numbers in Geist Mono.
2. **Bearings and distances:** From, To, Bearing, Distance (m).
3. **Area:** "Area by the coordinate method on grid coordinates: <m²> m², <ha> ha, <A-R-P>." (m² to 3, ha to 6 decimals); "Perimeter <m> m over <n> legs."; "1 perch = 25.29285264 m² (from the international yard); 40 perches = 1 rood; 4 roods = 1 acre."; the stated extent "(as given, not computed)" when entered; the bearing convention; "Computed by survey-engine/1.0.0."

Rows are 1.55 × the table text size apart. A table that reaches the bottom continues on a new overleaf page with its header repeated; a heading that would leave fewer than three rows on the page starts a new page.

## Scale policy

- **Standard scales** (`STANDARD_SCALES`): 1:100, 200, 250, 500, 1,000, 1,250, 2,000, 2,500, 4,000, 5,000 and 10,000.
- **The suggestion** (`suggestScale`): the largest standard scale (smallest denominator) at which the drawn points' extent fits 80% of the drawing area's width and height. The extent covers the boundary and every feature point.
- **The person decides.** `settings.scale` overrides the suggestion. The drawing is never shrunk to fit: if the chosen scale doesn't fit, `DRAWING_OFF_SHEET` blocks export and suggests the scale that fits.
- **Drawing scale is not printer scaling.** The sheet states its scale, carries a scale bar and the 100 mm check line, and tells people to print at 100% (actual size). The PDF asks viewers not to scale it when printing (`/PrintScaling /None`); viewers may ignore that, so nothing claims the sheet will print at scale. The Export step repeats the print guide.

## What the composer reports

| Code | Severity | Blocks | When |
| --- | --- | --- | --- |
| `SCALE_TOO_LARGE_AREA` | error | export | No standard scale fits and none is chosen |
| `DRAWING_OFF_SHEET` | error | export | The drawing at the chosen scale is wider or taller than the drawing area |
| `TEXT_OVERFLOW` | error | export | A panel's text doesn't fit its column, or one word too long to wrap is wider than the column |
| `TEXT_SCRIPT_NOT_SUPPORTED` | error | export | Text on any page has a character from U+0900 to U+0DFF, which the embedded fonts can't draw |
| `LABELS_OVERLAP` | warning | nothing | Two drawing labels, or a label and a boundary point, cover each other |
| `LABEL_LONGER_THAN_LEG` | information | nothing | A leg's label is longer than 1.05 × the leg on paper |

Messages and actions: [VALIDATION_SPECIFICATION.md](VALIDATION_SPECIFICATION.md).

**How overlaps are found** (`overlappingLabels`): each drawing label (any text not on `TITLE` or `SHEET`) gets an estimated outline: its measured `textWidth`, from 0.72 × size above the baseline to 0.2 × size below, inset 0.15 mm, turned with the text. Each boundary point gets a square of its radius. Pairs whose outlines cover each other, by a separating-axis test on the two quadrilaterals, are reported. Lines aren't tested, only labels and points.

## Renderers

| Renderer | Reads | Colours |
| --- | --- | --- |
| [`sheet-svg.tsx`](../../src/components/survey/sheet-svg.tsx) | One page, in a `viewBox` in mm | Design tokens: `ink` is `--color-ink`, `muted` `--color-ink-2`, `faint` `--color-ink-3`, `red` `--color-failed`, `paper` `--color-surface`. Geist and Geist Mono from the page |
| [`pdf.ts`](../../src/server/survey/pdf.ts) | Every page | Fixed: `ink` #000000, `muted` #4a4a4a, `faint` #8a8a8a, `red` #b3261e, `paper` #ffffff. Embedded Geist subsets |

The PDF details are in [IMPORT_EXPORT_SPECIFICATION.md](IMPORT_EXPORT_SPECIFICATION.md). On the home page and `/survey`, `SheetSvg` draws the Sample sheet with `draw`, which adds the CSS classes that make lines draw themselves and text fade in, never under reduced motion.

## What each sheet item rests on

From [STANDARDS_RESEARCH.md](STANDARDS_RESEARCH.md), all sources accessed 15 November 2026.

| Item | Source status | In the template |
| --- | --- | --- |
| Certification by a registered licensed surveyor | verified_official (Survey Act s.13) | No certificate wording. The DRAFT line, and empty Signature and Seal boxes |
| Scale and north point | verified_official for UDA plans (reg. 9(c)) | Always drawn |
| International A-series metric sheet | verified_official for UDA plans (reg. 9(q)) | A4, A3, A2 |
| 7.5 cm × 5 cm development permit box on the front page | verified_official for UDA plans (reg. 9(p)) | Optional setting, off by default |
| Previous plans referenced, or a note that none exist | verified_official for UDA plans (reg. 9(j)) | The Previous plans field, and the `SHEET_PREVIOUS_PLANS` finding |
| Boundaries in black | verified_official for UDA plans (reg. 9(i)) | The PDF draws the boundary in black. Previous boundaries in red are not supported |
| Geo-coordinates of at least four boundary meeting points | verified_official for UDA plans (reg. 9(n)) | The overleaf lists the grid coordinates of every boundary point. Whether grid coordinates meet "Geo coordinates" is not verified |
| Schedule of boundaries ("North by" and so on) | Convention in non-binding LSC guidance; the exact wording not verified | Captions; the surveyor types each side |
| Location block (village, GN, DS, district, province) | not_verified as a plan rule | Optional fields |
| Boundary-mark legend (MW, CP, St, NF and others) | not_verified | Starting examples from the owner's brief, flagged on the sheet and by `LEGEND_UNREVIEWED` until changed |
| Seal or stamp, licence number on the sheet | not_verified | An empty Seal box; the registration as the surveyor entered it |
| Extent in hectares or m² on the sheet | not_verified | Shown with the A-R-P extent as computed figures |
| Plan language | not_verified | English only |

## Not built yet

- Sinhala and Tamil text (planned; needs fonts with those scripts and a shaping test, see the roadmap).
- Choosing among templates, editing captions, or a UDA submission profile (planned).
- A certificate block with wording, a licence year or accreditation status.
- Previous boundaries superimposed in red, street lines, building lines, access widths and drainage flow arrows (UDA regulation 9 items).
