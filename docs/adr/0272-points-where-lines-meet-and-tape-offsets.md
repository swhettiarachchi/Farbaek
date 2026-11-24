# ADR 0272: Points where two lines meet, and tape offsets

- **Status:** accepted (stage 264, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0270 (square corners a sketch draws that nobody surveyed).
- **Changes:** the plan document's constructed points (two more kinds), the plan's build, the checks, the comparison, the independent check's items, the line panel and the save action. No migration, no new dependency.

## Context

A surveyor doesn't survey every corner they draw. Besides the square corner (ADR 0270), plans hold two other constructions every practising surveyor uses:

- **Where two lines meet:** a house's side carried on until it meets the wall it stands against, or two walls carried on to the corner they make.
- **A tape offset:** booked in the field book as "so far along this line, then so far square off it", as on the owner's real job, where the sketch has 1.43 and 1.58 written by a house's corner.

Without them, the surveyor's only choices were to survey the point again or to leave the line short.

## Decision

- **Two more kinds of constructed point,** kept as recipes from surveyed point ids, never coordinates, as the square corner is:
  - **`meet`:** where the line through `a` meets the line through `b`, each carried on as far as it needs. It's refused when the lines meet flatter than 5° (a small error would move the point far along them), or more than 50 m from the nearest of its four points.
  - **`offset`:** `along` metres from `from` towards `toward` (negative: back past `from`), then `out` metres square off that line, to its left looking from `from` to `toward` (negative: to its right).
- **Named by the surveyor** (`3a`, `C1`).
  - **Writing:** a letter or digit first, then letters, digits and ' / -, up to 12 characters.
  - **Uniqueness:** each name is the plan's own (the schema refuses two alike, whatever their case). It's never the word corner. It's never a surveyed point's number: the form refuses that, and so does the save, since only the server knows every number.
  - **In the points field:** the surveyor types the name among the line's numbers, and the field shows it there.
- **Added from the line's panel:** "Add a point that wasn't surveyed".
  - **What's typed:** the kind, the name, the surveyed numbers, the metres and the side, and which point of the line it goes after.
  - **Before it's added:** every number must be one surveyed point, and the point must be possible to work out. Otherwise the panel says why, and nothing changes.
- **Worked out every time the plan is built,** from the surveyed points, for the sheet, the DXF, the checks and the independent check (by name).
  - **The approval** covers every surveyed point a recipe uses, and its measurements, which are in the document.
  - **Not tied to their neighbours:** unlike a square corner, a meeting or an offset stays where the surveyor put it when the line's other points change. Only a square corner must stand between its two points.
- **Said, and checked.** `CONSTRUCTED_CORNERS` names each one:
  - a meeting with its two lines;
  - an offset with its measurements and that they were measured by tape and typed by hand.

  A recipe that can't be worked out leaves its line a point short, which the existing check stops.

## After review

A fresh review found five real bugs, all fixed with tests or guards:

- **Beside a square corner.** Adding a point beside a square corner silently took the corner out, since a square corner must stand between two surveyed points. The panel now refuses that place and says why.
- **A name a surveyed point takes later.** A name that a surveyed point takes later (imported after the name was given) would make one number mean two points.
  - `CONSTRUCTED_NAME_TAKEN` (error) stops export and approval.
  - In a line's points, a surveyed number always means the surveyed point.
- **Short lines and far reaches.** A point worked from a very short line swings far for a millimetre's error. A meeting or an offset is refused, in the build itself so stored plans are checked too, when:
  - its line is shorter than 0.5 m;
  - it reaches more than 20 times that line's length from it;
  - it lands on one of its own surveyed points.
- **The side.** A negative distance typed with "Right" chosen went left. The side now comes from the select alone.
- **A stale choice.** After the line's points changed, the panel's "after" choice could point at the wrong place. The panel now starts afresh then.

Also:

- a square corner typed beside a point that wasn't surveyed is refused in plain words;
- the panel checks the plan's 200-point and the line's 500-point limits before adding.

## Consequences

- A plan can now draw every corner a practising surveyor's plan draws from the same field data: the square, the meeting and the booked offset.
- Reading an offset from the sketch's writing (1.43 by a corner) isn't done. Which line a figure is measured along needs the surveyor; it stays a typed measurement.

## Verified

- `stage264.test.ts` (11 cases):
  - the meeting's point, refused when parallel or too far;
  - the offset to the left and the right, and with no length;
  - names, recipe inputs and the approval covering a changed measurement;
  - the comparison and the checks' wording;
  - points left alone when a line changes;
  - unique names;
  - the typed recipe and every refusal.
- `components/survey/corners.test.ts`: a point taken in the points field by its name, whatever its case.
