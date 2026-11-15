# Survey Studio testing strategy

The survey skill's rule 13: prove it twice. Every calculation is tested against known answers worked out by hand or by an independent method, and every export is read back by something other than the code that wrote it. All test data is synthetic and says so (skill rule 14); no real client survey is in a test.

## The test files

| File | What it covers |
| --- | --- |
| [`src/core/survey/engine.test.ts`](../../src/core/survey/engine.test.ts) | Units and A-R-P, bearings and DMS, typed bearings, planar geometry |
| [`src/core/survey/plan.test.ts`](../../src/core/survey/plan.test.ts) | The importers, parcels and checks, traverse misclosure, the plan sheet and label overlaps, the DXF, CSV and GeoJSON writers |
| [`src/server/survey/pdf.test.ts`](../../src/server/survey/pdf.test.ts) | The PDF read back as bytes: version, page size, print scaling, fonts, page count, true scale |
| [`src/components/survey/sample-plan.test.ts`](../../src/components/survey/sample-plan.test.ts) | The Sample sheet shown on the home page and `/survey`: its close-up window and the engine's figures |
| [`tests/db/survey-studio.test.ts`](../../tests/db/survey-studio.test.ts) | The migration on PGlite: roles, row level security, immutability, versions, approval, exports, archiving |

The synthetic data is in [`src/core/survey/fixtures.ts`](../../src/core/survey/fixtures.ts) (`SAMPLE_POINTS`, `sampleDocument()`, `SAMPLE_AREA_M2`) and inline in the tests.

## Known-answer tests

### Units ([`engine.test.ts`](../../src/core/survey/engine.test.ts))

- Every constant derives from the 0.9144 m yard (square yard, perch, rood, acre; the acre is 4 roods and 4,840 square yards).
- Conversions round-trip for 0.5, 1, 12.75 and 3,333.333 in every unit.
- A-R-P: one acre is `1A 0R 0P`; an acre, a rood and 12.5 perches split exactly; **39.999 perches at two decimals is `0A 1R 0P`**; 1A 2R 7.255P formats as `1A 2R 7.26P`; 10 perches at one decimal is `0A 0R 10.0P`.
- Negative and NaN areas throw.
- Rounding half away from zero without float residue: 2.675 to 2.68, 1.005 to 1.01, −2.5 to −3.
- In [`plan.test.ts`](../../src/core/survey/plan.test.ts): 1 ha is `2A 1R 35.3686P` at four decimals and `2A 1R 35.37P` at two (the NIST Handbook 44 values), and three acres are three acres.

### Bearings

- The four cardinal directions are exactly 0, 90, 180 and 270; the four quadrant diagonals are 45, 135, 225 and 315; zero deltas give null.
- Wrap: 360 and −0 become 0, −90 becomes 270, 725 becomes 5. A delta of −1e-9 east of north is just under 360, and +1e-9 just over 0.
- DMS with carry: `045°30′00″`, `123°45′12″`, **10°59′59.6″ becomes `011°00′00″`**, **359°59′59.6″ becomes `000°00′00″`**, and 0.0001234° at one decimal is `000°00′00.4″`. Quadrant: 135° is `S 45°00′00″ E` and 300.5° is `N 59°30′00″ W`.
- Typed bearings in every notation, and refusals for empty text, letters, 61 minutes, 400°, a quadrant angle of 95° and 75 seconds.
- Bearing and distance back to deltas, and round trips at 0, 37.25, 90, 181, 270 and 359.5 degrees.

### Geometry

- A 30 × 20 m rectangle at E 500,000, N 600,000: area 600 m² and perimeter 100 m, at full SLD99-sized coordinates.
- A concave L of six vertices: exactly 600 m². A 3-4-5 triangle: 6 m², and a distance of 5.
- **A second method:** each area agrees with an independent trapezoid-rule area written in the test.
- Ring direction, a repeated closing vertex accepted, self-intersection of a bow tie and none for simple rings, a zero-length leg of 0.2 mm found, the rectangle's centroid at its middle, interior angles of 90° and an L summing to 720° with one of 270°.

### The Sample parcel and an exact second computation

The Sample's five boundary points have millimetre coordinates. `SAMPLE_AREA_M2 = 1311.118096` was computed outside the engine with the coordinate method in exact integer millimetres (BigInt): twice the area is 2,622,236,192 mm², so the area is 1,311,118,096 mm², which is 1,311.118096 m² exactly. That computation isn't in the repository; the fixture records its result and method, and was reproduced for these notes with a short BigInt script giving the same twice-area. The test checks `computeParcel`'s float64 area against it to six decimals, and the sheet's extent text against the same figure.

Further Sample answers, in [`sample-plan.test.ts`](../../src/components/survey/sample-plan.test.ts): five legs; the first leg, point 1 to point 2, is `083°21′41″` and `31.78` m; the area is `1,311.12` m² and `0A 1R 11.84P`.

### Traverse

A square of 100 m legs with a last leg of 99.98 m: five stations, a linear misclosure of 0.02 m and a precision of 399.98 ÷ 0.02.

## Importers

In [`plan.test.ts`](../../src/core/survey/plan.test.ts):
- delimiter and header detection on a PNEZD CSV, and the values read, including a description with spaces;
- PENZD with spaces and tabs, a file with no header, and PEN with tabs;
- bad rows reported by line and never repaired: a row whose thousands separators split it into extra columns (`EXTRA_COLUMNS`, never read as 6 and 000), a missing coordinate, a non-number;
- an exact duplicate kept once and a conflicting one dropped altogether, with the two issue codes;
- the code kept to its own column (a code in the middle, a column left out after it), taking the rest of the row only when it is the last column of a space-separated file ("Concrete post", "St wall corner"); the preview's column count is the usual row length (5 for a PNEZD file with one two-word description); an unquoted "Wall, masonry" in a CSV refused as `EXTRA_COLUMNS`; a 65-character code refused as `CODE_NOT_READABLE` with its line;
- refusals: thousands separators, exponents, a NUL character (`NOT_TEXT`) and a mapping without a northing (`MISSING_MAPPING`);
- format detection by name and by content;
- GeoJSON: WGS 84 refused with its reason; a file naming EPSG:5235 read with its point, coordinates, elevation and code; a file naming UTM 44N refused for an SLD99 project (their numbers overlap, so only the file's own code can tell), EPSG:4258 refused, any grid refused for a local project, and a 40-character point number refused rather than cut short.

## Checks

- The complete Sample has no error, no export block, and is blocked for approval with `LEGEND_UNREVIEWED` and `NO_SURVEYOR`.
- A crossing boundary gives `BOUNDARY_SELF_INTERSECTS` (which blocks export), and an unconfirmed CRS gives `CRS_NOT_CONFIRMED`.
- Swapped axes are noticed in the north of SLD99, where a swap leaves the easting range, and correctly not claimed near the grid's middle, where both orders are in range.
- Missing boundary points are reported, not skipped.
- Three points on a line give `BOUNDARY_NO_AREA`, which blocks export and approval. A bow tie, whose two halves cancel to no area, gives `BOUNDARY_SELF_INTERSECTS` and not `BOUNDARY_NO_AREA`.
- In [`engine.test.ts`](../../src/core/survey/engine.test.ts): a notch whose corner rests exactly on a one-kilometre leg at SLD99-sized whole-millimetre coordinates is a self-intersection, the same notch a centimetre clear is not, and a leg folding back along its neighbour is one.

## The plan sheet

- The suggested scale is used when none is chosen, with no error findings; a 10 m line is exactly `10 × 1000 / scale` mm on paper; `toModel` inverts `toPage`; `suggestScale` picks 1:200 for a 30 × 40 m extent in a 250 × 260 mm area and null when nothing fits.
- A3 landscape gives a 420 × 297 front page and one overleaf, and **every primitive lies inside its page**.
- The front page has "PLAN No. SAMPLE-1", the DRAFT line, the "Starting examples" note and the extent; **the check line is exactly 100 mm**.
- A chosen scale that doesn't fit (1:50 on A4) is kept, and `DRAWING_OFF_SHEET` reported: the drawing is never shrunk.
- An approved version drops the DRAFT line.
- **Labels:** the Sample has no `LABELS_OVERLAP`, and `overlappingLabels` finds nothing on its front page. The wall along leg 3 to 4 is labelled more than 2.2 mm from that leg's bearing label. Hand-made cases: an overlapping pair is reported; labels side by side, or one turned clear of the other, are not; a label over a point is reported. Moving one mark code onto another label gives a `LABELS_OVERLAP` warning that blocks nothing.
- At 1:100 the scale bar's ticks read `0`, `2.5` and `5 m`.
- With Geist's measured widths, a plan number of 31 alternating capitals ("WMWM…") on A4 gives `TEXT_OVERFLOW`, and so does a 40-character one; a Sinhala land name gives `TEXT_SCRIPT_NOT_SUPPORTED`, which blocks export.
- On a concave U-shaped lot, all eight bearing labels lie outside the lot (a point-in-polygon test on the page).
- `fmt` formats 1,311.12, 500,012.345 and −0.5.
- An empty document composes one page with no viewport.

## Exports read back independently

**DXF** (`plan.test.ts`): the Sample at 1:250 is written, then parsed by **dxf-parser 1.1.2**, a reader that shares no code with the writer.
- The file starts with the HEADER section and `$ACADVER AC1009`, ends with `EOF`, and contains only ASCII (with tabs and line breaks).
- The parsed layer table has BOUNDARY, POINTS, POINT_NUMBERS, DIMENSIONS, BUILDINGS and WALLS.
- The boundary polyline has five vertices, each within 1 mm of the parcel's coordinates, and is closed.
- The POINT_NUMBERS texts are 1 to 5; a DIMENSIONS text carries `%%d`; there are five POINT entities.

**CSV and GeoJSON** (`plan.test.ts`): the CSV header; a point named `=CMD()` with the code `+x` written as `'=CMD(),1,2,,'+x`; a point numbered `-1` written as `-1`, unchanged. The GeoJSON's `crs` names `urn:ogc:def:crs:EPSG::5235`, the parcel ring is closed, and its `area_m2` matches the exact Sample area.

**PDF** ([`pdf.test.ts`](../../src/server/survey/pdf.test.ts)): the Sample sheet rendered uncompressed and read as bytes:
- it starts `%PDF-1.7`;
- it contains `/PrintScaling /None`;
- its MediaBox is 420 × 297 mm in points;
- it has two pages (`/Type /Page`), at least two embedded TrueType fonts (`/FontFile2`), and no fallback to Helvetica;
- **true scale:** the boundary's first `m` and `l` operators sit exactly at the scene's positions times `MM_TO_PT`, and the drawn length equals the first leg's ground distance × 1000 ÷ scale × 72 ÷ 25.4, to six decimals;
- two renders of the same version are the same size ("is the same size for the same version").

## Database tests (PGlite)

[`tests/db/survey-studio.test.ts`](../../tests/db/survey-studio.test.ts) applies every migration to an in-process PGlite 0.5.8 database (`tests/db/harness.ts`), as the other database tests do. It runs:
- creating a cadastral project with its first version, its CRS confirmation and an audit event;
- refusing other plan types, other workspaces and viewers;
- clearing the CRS confirmation when the CRS changes, unless confirmed again;
- storing a source with the database's own hash and size, skipping exact repeats, and returning decimals exactly as imported;
- refusing, as a whole, an import that would change a stored point, including one with the same coordinates and a different code;
- refusing an import confirmed in a grid the project no longer has (`CRS_CHANGED`);
- refusing updates and deletes of points, and inserts of drawings, from the browser role;
- versions on top of the latest, a stale base refused, another workspace's project refused;
- approval only by the named surveyor with a profile, of the latest version, once; refused against a grid that changed (`CRS_CHANGED`); a grid change withdraws the approval with `crs_changed` and records how many in the audit event, after which the version can be approved again; re-confirming the same grid withdraws nothing; a later edit is a new, unapproved version;
- exports recorded by members and refused for non-members, a missing version and a suspended workspace, with an audit event;
- members see their own workspace's survey data and nothing of another's, and can't call the functions;
- an archived project takes no more imports and records no more exports.

## Browser checks

The stage plan lists these checks in a browser, with the demo build (`NEXT_PUBLIC_SUPABASE_URL=off`):
- the Sample project end to end at 1280 and 375 px: pan and zoom, a label drag with undo, the export downloads;
- `pnpm qa:responsive` and `pnpm qa:a11y` across the new routes;
- the home page section and `/survey` at 375 and 1280 px, with reduced motion;
- the PDF opened in two viewers, and printed at actual size with the check line measured.

The results, and what wasn't checked, are recorded in [`docs/stages/stage-190.md`](../stages/stage-190.md) under "Verified". That includes the PDF in two readers (Chrome's PDFium viewer and Xpdf's `pdftotext`), the demo build in the browser, `qa:responsive` and `qa:a11y` on `/` and `/survey`, and the real-database check that waits for production.

## Running them

The development PC has little memory: run one suite at a time and stop any dev server first.

```bash
pnpm test src/core/survey            # engine, importers, sheet, DXF, CSV, GeoJSON
pnpm test src/server/survey          # the PDF
pnpm test src/components/survey      # the Sample sheet
pnpm test tests/db/survey-studio     # the database
pnpm check                           # typecheck, lint, every test
```

`pnpm test` is `vitest run`, so a path narrows it to matching files.

## Gaps

- No automated check in a second PDF reader (pdf.js or pdf-lib) inside the test run, and no PDF/A validation. The two-reader check in the stage doc was done by hand.
- No ezdxf strict read and audit, and no opening of sample files in AutoCAD, LibreCAD or QCAD. The research recommends ezdxf as a CI gate.
- No PROJ test vectors, because nothing transforms coordinates yet.
- No property-based tests and no fuzzing of the importers.
- The traverse has one case, and `parseBearing` isn't used by a screen yet.
- The server actions, the export route and the screens have no tests of their own beyond the Sample sheet; the database tests cover the functions they call.
- The PDF determinism test compares sizes, not bytes.
- Sinhala and Tamil are only tested as refused (`TEXT_SCRIPT_NOT_SUPPORTED`); they aren't supported yet.
