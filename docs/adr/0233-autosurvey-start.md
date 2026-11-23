# ADR 0233: AutoSurvey starts from one screen and one press

- **Status:** accepted (stage 222, AutoSurvey part 1, 2026-11-23)
- **Builds on:** ADR 0198 to 0201 (Survey Studio's core), ADR 0209 (the automatic draft), the owner's AutoSurvey brief of 2026-11-23
- **Changes:** how a survey project starts. Nothing about how points are stored, checked, drawn or approved.

## Context

The owner's brief asks for "New Survey → Upload Files → Generate Plan": the surveyor uploads survey data and field sketches together, presses one button, and gets a drawn plan, then only corrects real exceptions, approves, prints and seals.

Before this, the start took a form (name, plan type, coordinate system, a confirmation tick), then a separate import step for one file at a time, with a column mapping and a units tick, and the draft was a further step. A map of the code (2026-11-23) found the engine underneath sound and tested: seven readers, the automatic draft, the checks, the sheet, PDF and DXF. What was missing was the path through it.

## Decision

**One screen, at `/app/survey/new`.**

- One drop area for every file at once, with Choose files and Take a photo.
- Each file is sorted by its name and type: survey data, a sketch or photo, or a document.
- Survey data is read on the spot by the same tested readers, choosing the column order only where the file settles it (a header row, or only one order fitting the grid). The surveyor sees, per file, what was found: its kind, how many points and its codes.
- Pictures and documents are listed and marked **Not read yet**, with the reason. Reading sketches is a later part; nothing pretends otherwise.
- An optional project name; one is made from the first file and the day when it's left empty.
- **Generate Plan.**

**The coordinate system is never worked out from the numbers.** The screen starts from the one this surveyor last confirmed in this workspace, says so, and offers Change; a first-time surveyor chooses one. Pressing Generate Plan is the confirmation, said beside the button, and the project records who confirmed it, as before. The points are then checked to fit the system's area, and swapped columns are reported, never fixed.

**Generate Plan reads everything again on the server and saves nothing until all of it is clean.** A file that can't be read, columns the file doesn't settle, a point number with two different places (within a file or between files), or points outside the chosen system each stop it before a project exists, with one plain problem per file. Only then does it create the project, import each file as its own source, and draw the plan once from all of them with the automatic draft, using the Survey Department's code list when the files use its codes. It opens on the drawn plan, or on the Draft step, which says why, when nothing could be drawn.

**The old start stays, one fold below,** for choosing a file's columns by hand.

**Anyone can try the screen**, the demo workspace included: files are read and shown. Only Generate Plan waits on being able to save, with the reason beside it.

## What it doesn't change

- Points stay immutable, each file stays its own source with its text and hash, and every check, block and approval rule is as it was.
- No migration and no new dependency.

## Consequences

- The surveyor's path from nothing to a drawn plan is: New survey, add files, Generate Plan, when the files are clean and the system is the one they used last time.
- A file without a header whose two coordinate orders both fit the grid can't be generated from: it goes to the detailed import, or is exported with a header. That is deliberate: guessing would move a boundary.
- The next parts are in `docs/stages/stage-222.md`.
