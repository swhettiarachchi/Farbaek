# ADR 0300: AutoSurvey's start shows what the files hold, and offers the grid they fit

- **Status:** accepted (stage 293, 2026-11-28)
- **Builds on:** ADR 0233 (AutoSurvey's one start screen), ADR 0234 (sketches read with Claude), the Survey Studio skill's rule 3 and its first disagreement (a coordinate system is never inferred; ranges may only question a choice or suggest candidates), ADR 0260 (the same survey as instrument file, printout and drawing is one set of points).
- **Changes:** the start screen and the name a new project gets. No migration, no new dependency, no paid service.

## Context

The owner's first run with a real job from a Windows 7 PC failed three ways:

1. **The sketch photo couldn't be opened.** Photos were decoded with `createImageBitmap(file, { imageOrientation: "from-image" })`. Browsers older than about Chrome 112 refuse that value outright (it was named `"none"` before), and Chrome 109 is the last Chrome for Windows 7. Every photo failed there, PNG or JPEG.
2. **"119 of 119 points fall outside SLD99."** The job is on a site grid (its first station at 1000, 1000), but the screen starts from the grid the surveyor confirmed last. The count added up the same 40 points from three files, and the only way forward was to find "Change", open a list and know to pick local coordinates.
3. **Nothing said what the files held** beyond one line each, and the project name was only a grey placeholder taken from the first file ("Survey from AutoSavePrj", a name CAD programs give every autosave).

## Decision

- **Photos are decoded the best way the browser can** (`decodePhoto`): `from-image` first, then an `<img>` (which turns a camera photo upright in every browser since 2020), then the plain decode every browser has. A PNG with see-through parts is laid on white before it becomes JPEG.
- **Each point is counted once** when checking the grid, by its number.
- **When every point falls outside the grid shown, the screen offers the coordinate systems they do fit,** as one press each (`gridsThatFit`): the known grids that hold every point, or local coordinates when none does. Farbaek still never chooses one: pressing the button is the surveyor's choice, and Generate Plan records the confirmation as before. Points that partly fit are offered nothing, since some of them are the question.
- **"What's in your files"** (`StartPreview`): every point once, drawn north up at one scale with its number (12 px, left off where points crowd, never overlapping), the stations as triangles, a scale bar, and plain sentences: how many points and their spread, the stations, the job, instrument, serial and scale factor as the files state them (`jobFacts`, SDR records 10, 01, 06 and 02; Sokkia Link's header), and what happens about lines when the files have no codes. The full list folds under it.
- **The project name is filled in** for the surveyor to keep or change: a printout's project name, else the instrument file's own name, passing over names programs give every file (`AutoSave…`, `Drawing1`, `Untitled`), else the job an SDR names, else the day. The server makes the same name when none is sent.
- **SVG fills are never written with `color-mix()`** in Survey Studio's drawings: Chrome before 111 can't read it there and paints the shape black. The accent with `fillOpacity` looks the same everywhere.
- **No date is read from the files' headers:** an instrument whose clock was never set writes 01-Jan-09, and a printout's date is the day it was printed.

## Consequences

- A surveyor on an old browser can add sketch photos again.
- A site-grid job needs one press instead of a hunt through a list, and the grid is still the surveyor's choice, recorded.
- The plan's title facts (land name, village, and so on) are still never made up: they come from the surveyor, the deed, or an old plan read and confirmed.
