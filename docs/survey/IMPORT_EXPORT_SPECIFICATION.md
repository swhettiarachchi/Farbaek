# Survey Studio import and export specification

Imports: [`src/core/survey/import/`](../../src/core/survey/import), the panel [`import-panel.tsx`](../../src/components/survey/import-panel.tsx) and `importSurveyPointsAction` in [`actions.ts`](../../src/app/app/survey/actions.ts). Exports: [`src/core/survey/export/`](../../src/core/survey/export), [`src/server/survey/pdf.ts`](../../src/server/survey/pdf.ts) and the export route (see [API_SPECIFICATION.md](API_SPECIFICATION.md)).

Files are untrusted input (skill rule 11). Nothing is guessed: not the column order, not the units, not the coordinate system.

## Import

### Formats

| Format | `ImportFormat` | Extensions offered | Reader |
| --- | --- | --- | --- |
| Point file (CSV, TXT or DAT) | `delimited` | `.csv`, `.txt`, `.dat`, `.pnezd`, `.penzd`, `.xyz`, `.asc` | [`delimited.ts`](../../src/core/survey/import/delimited.ts) |
| GeoJSON points | `geojson` | `.geojson`, `.json` | [`geojson.ts`](../../src/core/survey/import/geojson.ts) |
| Leica GSI-8 and GSI-16 (stage 194) | `gsi` | `.gsi` | [`gsi.ts`](../../src/core/survey/import/gsi.ts) |
| Sokkia SDR2x and SDR33 (stage 194) | `sdr` | `.sdr` | [`sdr.ts`](../../src/core/survey/import/sdr.ts) |
| LandXML CgPoints (stage 194) | `landxml` | `.xml`, `.landxml` | [`landxml.ts`](../../src/core/survey/import/landxml.ts) |
| Trimble JobXML (stage 194) | `jobxml` | `.jxl`, `.jobxml` | [`jobxml.ts`](../../src/core/survey/import/jobxml.ts) |
| Field book: bearings and distances, typed (stage 194) | `fieldbook` | typed in the panel | [`fieldbook.ts`](../../src/core/survey/import/fieldbook.ts) |

**Choosing the reader.** `detectFormat(fileName, text)` in [`detect.ts`](../../src/core/survey/import/detect.ts) reads the content first, then the name. The panel shows the format it recognised in a "Read the file as" menu, and the surveyor can choose another; once chosen, typing never changes it back.
- **Field book:** the `# Farbaek field book` header, or a first line starting `start,` or `leg,`.
- **JobXML:** a `JOBFile` element, or `.jxl`.
- **LandXML:** a `LandXML` element.
- **SDR:** an `00NMSDR2x` or `00NMSDR33` header, or `.sdr`.
- **GSI:** blocks made only of GSI words, or `.gsi`.
- **GeoJSON:** a `.geojson` or `.json` name, or a `FeatureCollection`.
- **Anything else** is delimited.

**Files Farbaek can't read.** `unreadableFile` names them with what to export instead: instrument job databases (binary), Trimble DC, and Topcon GTS-7. A GTS-7 file is known by its first line: the `GTS-7` version record, or a GTS-7 keyword (JOB, STN, XYZ, HD and the rest) padded to 8 columns with the comma in column 9. A CSV whose rows start with STN or HD has its comma right after the word, so it isn't one.

**Printouts (stage 198).** A printout is laid out for printing, with headings above a table, so its lines aren't one point each. `printoutSource` recognises two kinds from the first 40 non-blank lines:
- **Sokkia Link's printout** of an SDR job, by at least two of its marks: the `JOB NM Job ID:` line, `Theo Desc:`, a `SOKKIA Link` path, `Print Date` with `Distance Unit`, and the `Pt. … Record Type … North/Hor` table header. It reads:
  - the job, from `Job ID:` or `Project :`;
  - the job file, the `.sdr` it names;
  - its folder, from `File Name :`.

  The sentence says which file to upload and where it was. The panel shows the full path in mono with **Copy the path**.
- **Any other report** that starts with three or more `Heading : value` lines among its first fifteen. A heading holds no digits, so a time isn't one. This only applies when no other reader would take the file. The sentence names the headings found and says to upload the job or points file, or to delete the heading lines.

The server refuses both too (`importSurveyPointsAction` calls `unreadableFile`). Reading a printout's rows, and reducing an SDR job's observations to coordinates, wait for real files to build against: Sokkia Link's printout layout isn't published.

An SDR job with only observations says so in a surveyor's words: it holds the instrument's measurements (angles and distances), not coordinates. Compute them in Sokkia Link or on the instrument and export again, or export a CSV.

The import panel's **What to upload from your instrument** lists one line for each instrument family:
- Sokkia: the job's `.sdr`, not the printout;
- Leica: GSI;
- Trimble: JobXML;
- any other software: LandXML or PNEZC;
- what won't work.

**One entry point.** `readPoints` in [`read.ts`](../../src/core/survey/import/read.ts) is used by both the panel and the server, so the preview is what is imported. People can also paste rows into the panel.

**Typing points in, as in CAD** ([`manual-entry.tsx`](../../src/components/survey/manual-entry.tsx), stage 194). Two tables beside the upload, for points that come from a field book, a deed or an old plan rather than a file:
- **Type coordinates:** point, northing, easting, height and code per row; pasting a block from a spreadsheet fills the rows. It writes a CSV the delimited reader reads like any other.
- **Bearings and distances:** a starting point (or a point already in the project), then one leg per row: from, to, bearing, horizontal distance, code. Enter adds the next leg from the last point. Bearings are whole-circle from grid north in DMS or decimal degrees, or quadrant ("N 45 30 00 E"), read by the tested angle parser. It is CAD's polar input ("@25.40<45°30'") and a traverse editor in one table.
- **The field book's rules** ([`fieldbook.ts`](../../src/core/survey/import/fieldbook.ts), `fieldbook/1.0.0`): coordinates are worked out at full precision and never rounded. A leg that ends on a known point is a check, not a new point: its misclosure and ratio over the legs so far are reported (`CLOSURE`), never adjusted, because adjusting a traverse needs the surveyor's authorisation and a chosen method (survey skill, rule 7). Heights aren't computed. The stored source is the typed text, so what was typed can be read again.

**Reading the columns** ([`columns.ts`](../../src/core/survey/import/columns.ts), stage 194):
- **Column names decide first.** Names are compared without case, quotes, underscores, hyphens or a unit of metres, so "Point_ID", "Easting (m)" and "EASTING_M" are understood. X and Y are settled by the grid, since some instruments write X as the northing. Names over columns the rows don't have are ignored.
- **Without names, the values decide.** Distinct numbers or names make the point number, words make the code, the first two coordinate columns are the horizontal pair, and a third is the elevation. A column of small whole numbers that repeat (not all zero) and that comes before a coordinate pair is a numeric field code, as in the CASS layout; the panel asks the surveyor to check it. Heights come after the pair, so zero or whole-metre heights stay heights. Named eastings and northings are kept even when the point column's name is unknown: its values find it.
- **Typing keeps choices.** Editing the pasted text keeps the surveyor's column choices. Everything is read again, and the confirmation cleared, for a new file, text whose first line changed (another file pasted over this one), a change of format, or another way in (upload, coordinates, bearings).
- **Easting or northing.** The project's grid settles which is which only when exactly one order puts every point inside it. Across most of SLD99 both orders fit, so otherwise the file's shape decides, and the panel says so:
  - a code in the second column is the CASS `.dat` layout (name, code, easting, northing, height), read easting first;
  - anything else is read northing first, as the Survey Department's PNEZC file has it (DSR Chapter XXII §22.3).
- **Text.** Full-width commas are read as commas. A file that isn't UTF-8 is read as GB18030, with a notice.
- **Reasons shown.** Every choice is shown with its reason and can be changed.
- **Latitude and longitude** are recognised and refused. Only the chosen easting and northing columns are tested, so an elevation with many decimals beside grid coordinates can't set it off.

**Each instrument reader's rules:**
- **GSI.** Point (WI 11) with target (81 to 83) or station (84 to 86) coordinates, and a remark (71) or code (41) on the same line.
  - **Units:** only metre units (unit digits 0, 6 and 8) are read.
  - **Code:** the remark (71) when it's filled, else the code word (41); an empty remark is written as zeros.
  - **Refused, with the reason:** feet; observation-only files (21, 22, 31); GSI-8 coordinates outside the grid, which likely lost their leading digits; all-zero points; coordinates without a point number (word 11 missing or all zeros); a word given twice on one line.
  - **Left out and counted** (`RECORDS_LEFT_OUT`): lines of raw angles and distances beside the coordinates, and heights alone (83 without 81 and 82).
  - **Code lines standing alone** aren't tied to a point.
  - **Zero fill:** "0000A110" is "A110" and "000012.5" is "12.5"; a "0." is kept.
- **SDR.** 08 coordinate and 02 station records, by Sokkia's byte layout (SDR2x narrow fields, SDR33 16-byte fields), with zero-filled numbers unfilled.
  - **Repeated points:** a later record of the same point replaces the earlier one, as in the SDR, with a warning (`DUPLICATE_POINT_REPLACED`).
  - **Units:** header byte 42 must be 1 (metres). Feet (2, or a `13DU` note) are refused, and so is any other value or none.
  - **Refused:** observation-only files, and more than 20,000 coordinate records.
  - **Not imported, and counted:** observations (09, 11) beside the coordinates, RTK (18) and latitude and longitude (24) records.
  - **Display order:** an easting-first display setting gets a warning.
- **LandXML.** CgPoint text as northing, easting and an optional elevation; `name` is the point; `code`, or else `desc`, is the code.
  - **Units:** metric units are scaled exactly; imperial is refused.
  - **References:** `pntRef`-only points are left out, and counted.
  - **Observations:** a file of observations without points is refused; observations beside points are counted and left out.
- **JobXML.** `Reductions/Point/Grid` (North, East, Elevation; JobXML stores metres).
  - **Left out:** points whose field-book record is `Deleted` (`true` or `1`); points with only WGS84 or local values, with a warning.
  - **Survey date:** the last day a point was observed is offered as the survey date.
- **XML, both formats** ([`xml.ts`](../../src/core/survey/import/xml.ts)). Read in one pass with `indexOf`, never a backtracking pattern, so a 2 MiB file with a tag, quote or comment left open takes as long as a well-formed one. Line numbers come from one index of the line starts. A file cut short (its root, an element, a tag, a quote or a comment never closed), or with a reference to a character XML doesn't allow, is refused whole with its line (`FILE_CUT_SHORT`). Comments and processing instructions are blanked rather than removed, so the lines after them keep their numbers, and a `>` inside a quoted value is part of the value.
- **Every reader** refuses control and invisible characters in point numbers and codes: C0 and C1 controls, the soft hyphen, zero-width characters, direction marks and overrides, line and paragraph separators and the byte-order mark. A number holding one would look the same as one without it. The zero-width joiner and non-joiner are part of writing Sinhala and Tamil ("ප්‍ර"), so they're allowed between two letters of those scripts and refused anywhere else.

**Drawing the plan on import (ADR 0209).** The import can draw the plan in the same step.
- **Condition:** the plan has no lots, and the "Draw the plan" box (on by default) is ticked.
- **What it draws** ([`autodraft.ts`](../../src/core/survey/autodraft.ts)):
  - the lot through the boundary marks;
  - the lines from the codes;
  - the road from RD1 and RD2 edges;
  - the stated survey date and the importing surveyor.
- **Code list:** when the file uses the Survey Department's codes, the panel offers to draw with that list. It then waits for the surveyor's check like the common list (`LEGEND_UNREVIEWED`), and swapping lists clears the check.
- **Result:** a new drawing version noted "Drawn from <file>", only when a lot, a line or a road was drawn. A survey date or surveyor block alone isn't saved as a version, and nothing is drawn over a latest version whose settings can't be read. If drawing fails, the import still stands and the panel says the plan wasn't drawn.
- **Preview:** the dashed lot outline and the lines are shown only when the plan will be drawn. Numbered codes ("MW1", "MW2") are looked up by their letters, as field-to-finish reads them.

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
| `POINT_ID_TOO_LONG` | error | both | Over 32 characters, or control or invisible characters; for GeoJSON also an empty number |
| `CODE_NOT_READABLE` | error | both | A code over 64 characters, or with control or invisible characters |
| `EXTRA_COLUMNS` | error | delimited | A row with more cells than the mapping, except extra words in a space-separated file whose last column is the code |
| `NOT_A_NUMBER` | error | both | A coordinate or elevation that isn't a plain number |
| `MISSING_COORDINATE` | error (delimited), warning (GeoJSON) | both | An empty easting or northing; for GeoJSON, a feature that isn't a point |
| `DUPLICATE_POINT_SAME` | warning | delimited | An exact repeat, kept once |
| `DUPLICATE_POINT_CONFLICT` | error | both | One point number with a different E, N, Z or code (delimited), or named twice (GeoJSON) |
| `DUPLICATE_POINT_REPLACED` | warning | SDR | A point stored again with new values; the later record is used, as the SDR's own rule says |
| `FILE_CUT_SHORT` | error | LandXML, JobXML | Cut short or not well formed where Farbaek reads it; the whole file is refused |
| `RECORDS_LEFT_OUT` | warning | GSI, SDR, LandXML | Observations, heights alone, RTK or latitude-longitude records, or references, left out and counted |
| `CLOSURE` | warning | field book | A leg closing on a known point: the misclosure and ratio, unadjusted |
| `CHECK_FILE` | warning | GSI, SDR | Something to check by eye: GSI-8 and GSI-16 words mixed, or an easting-first display setting |

Only `DUPLICATE_POINT_SAME` with a line counts as a repeat in the panel and the import message; every other warning is a note the panel lists.

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
