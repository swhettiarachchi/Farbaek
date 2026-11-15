# Survey Studio import and export specification

Imports: [`src/core/survey/import/`](../../src/core/survey/import), the panel [`import-panel.tsx`](../../src/components/survey/import-panel.tsx) and `importSurveyPointsAction` in [`actions.ts`](../../src/app/app/survey/actions.ts). Exports: [`src/core/survey/export/`](../../src/core/survey/export), [`src/server/survey/pdf.ts`](../../src/server/survey/pdf.ts) and the export route (see [API_SPECIFICATION.md](API_SPECIFICATION.md)).

Files are untrusted input (skill rule 11). Nothing is guessed: not the column order, not the units, not the coordinate system.

## Import

### Formats

| Format | `ImportFormat` | Extensions offered | Reader |
| --- | --- | --- | --- |
| Point file (CSV or TXT) | `delimited` | `.csv`, `.txt`, `.pnezd`, `.penzd`, `.xyz`, `.asc` | [`delimited.ts`](../../src/core/survey/import/delimited.ts) |
| GeoJSON points | `geojson` | `.geojson`, `.json` | [`geojson.ts`](../../src/core/survey/import/geojson.ts) |

`detectFormat(fileName, text)` in [`detect.ts`](../../src/core/survey/import/detect.ts) chooses GeoJSON for a `.geojson` or `.json` name, or for text that starts with `{` and names `"type": "FeatureCollection"` or `"Feature"` in its first 4,000 characters; anything else is delimited. People can also paste points into the panel.

### Limits

`IMPORT_LIMITS`:

| Limit | Value |
| --- | --- |
| `maxBytes` | 2 MiB (2,097,152 bytes of UTF-8). The panel also checks the file size before reading it |
| `maxRows` | 20,000 rows or features |
| `maxPointIdLength` | 32 characters |
| `maxCodeLength` | 64 characters. A longer code is an error, never cut short |

The database adds its own limits: 20,000 points per project, and the same 2 MiB on the stored file (see [DATA_MODEL.md](DATA_MODEL.md)).

### Delimited files

**Lines.** A leading byte-order mark is dropped. Blank lines and lines starting with `#` are skipped. Line numbers count every line of the file, so a reported line number matches the file.

**Delimiter.** `previewDelimited` looks at the first 20 lines and suggests tab, comma or semicolon when every line has the same non-zero count of it; failing that, the first of those that appears at all; failing that, whitespace. The person can change it: commas, tabs, semicolons or spaces.

**Header.** The first row is taken as column names when fewer than two of its cells read as numbers. The person can change this too.

**Column count.** The preview offers as many columns as the file's **usual** row length: the most common length among the header and the first 50 rows (the longer one on a tie), not the widest row. One row with a description containing spaces doesn't add columns to the mapping.

**Quoted fields.** With a comma, tab or semicolon delimiter, a field that starts with `"` is quoted until the closing quote, and `""` inside it is a literal quote, so "Wall, masonry" in quotes stays one field. Unquoted, it is two cells, and the row is refused (see below).

**Column orders.** `COLUMN_ORDERS` (P point, N northing, E easting, Z elevation, D description or code):

| Preset | Columns |
| --- | --- |
| PNEZD | point, northing, easting, elevation, code |
| PENZD | point, easting, northing, elevation, code |
| PNEZ | point, northing, easting, elevation |
| PENZ | point, easting, northing, elevation |
| PNE | point, northing, easting |
| PEN | point, easting, northing |

The panel starts on PNEZD. Each column has its own role menu (point number, easting, northing, elevation, code or description, leave out), so any order can be mapped. A mapping needs a point, an easting and a northing column. Cells in a column mapped as "Leave out" are dropped, as asked.

**Each row, in this order:**
- It needs at least as many cells as the highest of the point, easting and northing columns (`WRONG_COLUMN_COUNT`).
- The point number must be present, at most 32 characters, with no control characters.
- Easting and northing must be plain numbers: an optional sign, digits and an optional decimal point. No thousands separators and no exponents: `6.0e5` is refused, and so is `600,004.210` in a semicolon-separated file.
- The elevation is optional; when a cell is there it must be a plain number.
- **A row with more cells than the mapping is refused** (`EXTRA_COLUMNS`), with its line, so no text is ever dropped without the person knowing. The message suggests quotes around text that contains the separator (or, in a space-separated file, making the code the last column), or mapping the extra columns. In an unquoted CSV, a thousands separator splits a number into extra cells, so it is refused this way rather than read as two numbers.
- The one exception: **in a space-separated file whose last mapped column is the code**, the extra words are the rest of the description and join the code, with spaces ("Concrete post", "St wall corner").
- Otherwise the code is its own cell, so a column mapped after the code never ends up in it.
- A code longer than 64 characters or with control characters is an error (`CODE_NOT_READABLE`): "Nothing is cut short for you."

**Units.** Metres only. The panel asks the person to confirm "These coordinates are in metres, in <CRS name>. Farbaek stores them exactly as written and never converts, moves or rounds them." The action accepts only `units: "metre"`. There is no conversion from feet.

**Repeated point numbers in one file:**

| Case | Result |
| --- | --- |
| Same E, N, Z and code as an earlier row | Warning `DUPLICATE_POINT_SAME`; the first row is kept |
| A different E, N, Z or code | Error `DUPLICATE_POINT_CONFLICT`; the point is dropped altogether, because Farbaek doesn't choose between them |

### GeoJSON points

- **WGS 84 is refused.** A file with no `crs` member, or one naming EPSG:4326, is RFC 7946 GeoJSON: longitude and latitude in degrees. Plans need projected metres and Farbaek doesn't transform coordinates yet, so the import stops with: "This GeoJSON is in WGS 84 longitude and latitude (the GeoJSON standard). Plans need projected grid coordinates in metres, and Farbaek doesn't transform coordinates yet. Export the points from your GIS in your survey grid as CSV, and import that."
- **Only the project's own grid is read.** A legacy `crs` member whose `properties.name` is `urn:ogc:def:crs:EPSG::<code>` or `EPSG:<code>` (4 to 6 digits), as QGIS and GDAL can write, names the file's grid. `parseGeoJsonPoints(text, projectEpsg)` reads the points only when that code is the project's EPSG code. Any other code is refused: "This file says its points are in EPSG:<code>, but this project is in EPSG:<code> (or in local coordinates). Farbaek doesn't transform coordinates. Export the points in the project's grid, or change the project's grid in its settings if the file is right." UTM zone 44N and SLD99 coordinates overlap in western Sri Lanka, so a wrong grid could otherwise pass unnoticed. A project in local coordinates can't import GeoJSON.
- The root must be a `FeatureCollection` or a single `Feature`, with at most 20,000 features.
- A feature that isn't a `Point` is left out with a warning (`MISSING_COORDINATE`). Coordinates that aren't finite numbers are an error (`NOT_A_NUMBER`). An optional third coordinate is the elevation.
- The point number comes from the property `point`, `Point`, `name`, `id` or `PNT`, in that order, or else the feature's position (1, 2, 3…). An empty number, one over 32 characters, or one with control characters is an error (`POINT_ID_TOO_LONG`). A number seen twice is an error (`DUPLICATE_POINT_CONFLICT`), whatever the coordinates.
- The code comes from `code`, `description` or `desc`, trimmed. One over 64 characters or with control characters is an error (`CODE_NOT_READABLE`); nothing is cut short.
- Every failure that stops the whole file (too large, not JSON, WGS 84, another grid, no features, too many) is reported with the code `NOT_TEXT` and its own message.

### Issue codes

| Code | Severity | Raised by | Meaning |
| --- | --- | --- | --- |
| `FILE_TOO_LARGE` | error | delimited | Over 2 MiB |
| `TOO_MANY_ROWS` | error | delimited | Over 20,000 rows |
| `NOT_TEXT` | error | delimited, GeoJSON | A NUL character (not a text file); for GeoJSON, any failure that stops the file |
| `NO_ROWS` | error | delimited | No rows after blank lines, comments and the header |
| `MISSING_MAPPING` | error | delimited | No point, easting or northing column chosen |
| `WRONG_COLUMN_COUNT` | error | delimited | A row has too few cells for the mapping |
| `MISSING_POINT_ID` | error | delimited | Empty point number |
| `POINT_ID_TOO_LONG` | error | both | Over 32 characters, or control characters; for GeoJSON also an empty number |
| `CODE_NOT_READABLE` | error | both | A code over 64 characters, or with control characters |
| `EXTRA_COLUMNS` | error | delimited | A row with more cells than the mapping, except extra words in a space-separated file whose last column is the code |
| `NOT_A_NUMBER` | error | both | A coordinate or elevation that isn't a plain number |
| `MISSING_COORDINATE` | error (delimited), warning (GeoJSON) | both | An empty easting or northing; for GeoJSON, a feature that isn't a point |
| `DUPLICATE_POINT_SAME` | warning | delimited | An exact repeat, kept once |
| `DUPLICATE_POINT_CONFLICT` | error | both | One point number with a different E, N, Z or code (delimited), or named twice (GeoJSON) |

### All or nothing

- The panel previews with the same reader, shows the first eight rows, counts what it read and lists every row it can't read. The Import button stays disabled until there are points, no errors, and the units box is ticked.
- The panel sends the CRS it showed when the person ticked the units box. The server reads the project's CRS again and refuses with `CRS_CHANGED` if it differs, and the database checks the same before it commits.
- The server reads the file again itself; the browser's parsed rows are never trusted. **Any error-severity issue refuses the whole import**, with up to 50 issues returned.
- The database then refuses the whole import if any point number already exists in the project with a different E, N, Z or code (`POINT_CONFLICT`, naming up to 10). A corrected code is a different point, never hidden as "unchanged". Points identical to stored ones are skipped and counted.
- The file is stored as given (`survey_sources.content`), with a SHA-256 and size the database computes, and the settings it was read with, including the CRS.

## Export

Every export is built from one drawing version, the immutable points and the engine. The route records it before sending it: kind, version, SHA-256 and size go to `survey_exports` and the audit log, and **if the record can't be written, no file is sent**. The Sample's exports aren't recorded, and a suspended workspace or an archived project makes no new files.

What holds an export back (409):

| Kind | Refused while |
| --- | --- |
| PDF, DXF | any finding blocks export (`blocksExport`) |
| GeoJSON | a finding that blocks export concerns the coordinates or the parcel (`blocksData`: its target isn't the sheet or a sheet field, and it isn't `BOUNDARY_NOT_SET`). The GeoJSON has no sheet, so sheet problems don't hold it back |
| CSV | never: it is the points exactly as imported |

The Export step hides the GeoJSON link while `blocksData` isn't empty, and names the PDF, DXF and GeoJSON (or only the PDF and DXF) in its list of what can't be made yet.

The DXF and GeoJSON carry a status line, so it survives a renamed file: "Approved in Farbaek by <name> on <date>, version <n>. Approval records a review; the signed print certifies the plan." or "DRAFT, version <n>. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet."

A version counts as approved only while its approval stands (not withdrawn by a CRS change) and its stored hash equals the plan's hash computed now. An approved sheet shows the surveyor's details as they were at approval.

File names: `<plan number or project name>-v<version>.<ext>`, with `-draft` before the extension until that version is approved. The stem keeps ASCII letters and digits, turns everything else into hyphens and is cut to 60 characters (`survey-plan` if nothing is left).

### PDF

[`pdf.ts`](../../src/server/survey/pdf.ts), `renderPdf(pages, meta, options)`, on the server only.

| Property | Value |
| --- | --- |
| Library | PDFKit 0.20.2 (MIT), kept out of the bundle by `serverExternalPackages` (ADR 0200) |
| PDF version | 1.7 |
| Page size | The scene page in mm × `MM_TO_PT`, where `MM_TO_PT = 72 / 25.4` (about 2.834646 pt per mm). A3 landscape is 1190.55 × 841.89 pt. No margins |
| Pages | The front page, then the overleaf pages |
| Drawing | Real vector paths and text, never a picture of the sheet. Paths use round joins and butt caps; dashes use the first two values of the scene's pattern |
| Fonts | Geist and Geist Mono (SIL Open Font License 1.1), read from `android/app/src/main/assets/fonts/geist.ttf` and `geist-mono.ttf` and embedded as subsets (`/FontFile2`). Both are variable TrueType fonts with a weight axis and Latin glyphs, including °, ′, ″ and ²; they have no Sinhala or Tamil glyphs. Bold text is drawn by stroking the outline at 4.5% of the font size |
| Print scaling | The catalog's viewer preferences get `/PrintScaling /None` (and `/DisplayDocTitle true`). This asks viewers to preselect no scaling; viewers may ignore it, so the sheet itself says to print at 100% and carries a 100 mm check line |
| Metadata | Title "<plan number or project name> (version N)"; Subject "Approved in Farbaek by <name> on <date>" or "Draft survey plan, not certified"; Creator "Farbaek Survey Studio (survey-engine/1.0.0)"; Producer "Farbaek Survey Studio"; creation and modification dates fixed to the drawing version's creation time |
| Compression | On, except in tests, which read the operators back |

The route serves the PDF as a download, or inline with `?inline=1` for "Open the PDF to print".

### DXF

[`dxf.ts`](../../src/core/survey/export/dxf.ts), `writeDxf(input)`.

**Version and form.** AutoCAD R12 (`$ACADVER` `AC1009`), ASCII, group code and value on alternate lines, CRLF line endings, ending in `0 / EOF`. No handles and no object dictionaries, which R12 doesn't need.

**Sections:**
- `HEADER`: `$ACADVER`, `$INSBASE` (0, 0, 0), `$EXTMIN` and `$EXTMAX` from the drawn points (the lower limit extended to cover the notes).
- `TABLES`:
  - `LTYPE`: `CONTINUOUS`, and `DASHED` with a 2.4 mm pattern of 1.6 mm dash and 0.8 mm gap, in paper millimetres at the plan's scale;
  - `LAYER`: layer `0` and the 14 drawing layers, each with an AutoCAD colour index and line type (fences and drains dashed). A layer hidden in the document is written off, with a negative colour number;
  - `STYLE`: `STANDARD`, font `txt`.
- `ENTITIES`, described below.

**Units and coordinates.** Model space holds the real grid coordinates in metres: X is easting, Y is northing. Coordinates are written with 4 decimals (0.1 mm) in fixed notation, never with an exponent, and -0 is written as 0. The writer puts no units variable in the header; instead three notes on the `TEXT` layer, under the drawing, say what the numbers are and what the file is: "<project>. Units: metres. X = easting, Y = northing, <CRS name> (EPSG:<code>).", "Bearings: whole-circle from grid north. Text sized for 1:<scale>. survey-engine/1.0.0.", and the status line followed by the CRS confirmation ("Coordinate system: Confirmed by <name> on <date>." or "Coordinate system: not confirmed by a person.").

**Entities:**

| Entity | Layer | Content |
| --- | --- | --- |
| `POLYLINE` / `VERTEX` / `SEQEND` | each feature's layer | One per feature; flag 70 is 1 when closed |
| `TEXT` | the feature's layer | The feature's code, centred on its first segment's midpoint |
| `POLYLINE` / `VERTEX` / `SEQEND` | `BOUNDARY` | The boundary, closed when it has three or more vertices |
| `POINT` | `POINTS` | Each boundary vertex, with its elevation as Z (0 when none) |
| `TEXT` | `POINT_NUMBERS` | Each point number, left-aligned, up and right of the point |
| `TEXT` | `BOUNDARY_MARKS` | Each point's code, below its number |
| `TEXT` | `DIMENSIONS` | `<bearing> <distance>` centred on each leg's midpoint and turned along it to read upright |
| `TEXT` | `LOT_TEXT` | "Lot <n>" and the A-R-P extent at the centroid, for a simple ring |
| `TEXT` | `TEXT` | The three notes |

- Text heights are the sheet's paper sizes at the plan's scale, in metres (`mm × scale / 1000`): 2.2 mm for most labels, 1.9 for mark codes, 3.2 and 2.4 for the lot text. The scale is the sheet's scale, or 1:500 when the sheet has none.
- Centred text uses horizontal alignment 72 = 1 with the alignment point in codes 11, 21, 31.
- **Text encoding.** ASCII only: ° becomes `%%d`, ′ becomes `'`, ″ becomes `"`, line breaks become spaces, and any other non-ASCII character becomes `\U+XXXX` (four or more uppercase hex digits).
- **Not used:** `DIMENSION`, `MTEXT`, `LWPOLYLINE`, `BLOCK` and `INSERT`. Bearings and distances are plain rotated text, so every reader shows the same thing.
- The DXF has no sheet frame, title block, north point or scale bar, and ignores the sheet's label offsets.

### CSV

`pointsCsv(points)` in [`points.ts`](../../src/core/survey/export/points.ts):
- Header `point,easting,northing,elevation,code`: a PENZD order.
- Every point of the project, at full precision as read (`String(number)`, JavaScript's shortest form that reads back to the same float64), empty for no elevation or code.
- CRLF line endings, ending with one.
- **Formula-safe cells.** A point number or code that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe, so a spreadsheet can't run it as a formula (`=CMD()` is written `'=CMD()`). A plain number such as `-1` can't run, so it stays as it is and point numbers survive a round trip.
- A cell with a comma, quote or line break is quoted, with quotes doubled.
- Served as `text/csv; charset=utf-8`. A CSV can't name its coordinate system, and neither the file nor its name does; the project's PDF, DXF and GeoJSON name it.

### Lot schedule (CSV)

`/export/lots` (stage 192, [`schedule.ts`](../../src/core/survey/export/schedule.ts)): one row per lot (its label, corner numbers, area in m² to 3 decimals, hectares to 5 decimals and acres, roods and perches as on the sheet), then the sum of the lots and the entire land with its outline's corners. Plain numbers, text cells guarded against formulas. It waits for the checks on the coordinates and the lots, like the GeoJSON, and is recorded as a CSV export with `options.content = "lots"`; History calls it "Lot schedule".

### Block-out plan (PDF)

`/export/blockout?version=N&division=<json>` (stage 193, ADR 0208, [`blockout.ts`](../../src/core/survey/blockout.ts)).
- **Recomputed on the server.** The server reads the surveyor's choices strictly and works the division out again from that version's lot and points. A division that can't be made as asked is refused with its reasons (409); a link that can't be read gets a 400.
- **Prerequisites.** It waits for the checks on the coordinates and the lots, and for the block-out sheet's own export checks.
- **Record.** It is recorded as a PDF export with `options.content = "blockout"`, the lot, scale, paper, engine, the division's SHA-256 and, when short enough, the division itself.
- **File.** The file name ends `-block-out.pdf`.

### GeoJSON

`surveyGeoJson({ points, parcel, crs, projectName, lot })`:
- A `FeatureCollection` named after the project.
- When the CRS has an EPSG code, the legacy member `"crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::<code>" } }`. RFC 7946 removed that member and allows only WGS 84 longitude and latitude; these are grid metres, so a tool that insists on RFC 7946 must reproject them. QGIS and GDAL read the member.
- A `farbaek` member: `coordinate_system` (the CRS name, or "not set"), `coordinate_system_confirmed` (whether a person confirmed it), `status` (the draft or approval line), a `note` saying what the numbers are, and `engine`.
- A `Point` feature for every project point, `[e, n]` or `[e, n, z]`, with properties `point`, `code` and `kind: "survey_point"`.
- For a simple ring of three or more points, a `Polygon` feature: the ring anticlockwise (reversed if the parcel runs clockwise) and closed by repeating the first position, with `kind: "parcel"`, `lot`, `area_m2`, `perimeter_m`, `area_method` and `engine`.
- Pretty-printed with two-space indents. Served as `application/geo+json`.
