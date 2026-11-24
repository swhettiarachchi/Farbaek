# ADR 0253: Every number on a sketch is traceable, and what's uncertain is listed apart

- **Status:** accepted (stage 245, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0234 (sketch readings, checked against the survey);
  - ADR 0249 (the Sketch Intelligence Engine);
  - ADR 0251 (reading sketches as surveyors write them).
- **Changes:**
  - how the reader records a reading it isn't sure of;
  - one new kind of reading, `dimension`;
  - where each reading is written on its photo;
  - a sketch interpretation report, in the app and as Markdown.

  No migration, no new dependency.

## Context

A licensed surveyor reviewing the owner's real job asked for the sketch to be read as an experienced surveyor reads it, with every interpretation traceable to the page. Specifically:

- **Tell the numbers apart:** point numbers, side measurements, dimensions, other notes and feature references.
- **Record each number fully:** what's written, where it is on the image, which side it belongs to, what it means, how sure, its source and whether the survey confirms it.
- **Keep uncertain readings apart,** in a separate report, never in the geometry.

The job's left side shows why. The numbers 3 and 4 there are hard to read. The surveyor also says those corners weren't clearly visible when they were measured. And the two tapes written there disagree with the instrument's points.

Until now, the reader was told to leave out anything it couldn't read for certain. It described such writing only in a free-text "unreadable" list. That's safe, but it loses the very readings a surveyor needs to see: what's written beside a short side, and why it's in doubt.

## Decision

**The reader records doubt instead of dropping the reading.** Each reading has:

- **`certain`:** true only when every character is clear, and its meaning is clear from where it's written;
- **`doubt`:** when not certain, what's unclear and what else it could be, in a few words;
- **`photoX`, `photoY`:** where it's written on the photo as given, 0 to 1000 across and down.

The prompt now says how surveyors place numbers:

- a point number at the corner it names;
- a side's measurement along the side;
- a dimension between arrowheads;
- crowding at a short side, where each figure is read on its own and decided by its place.

A 6 that might be a 9 is added with both readings in `doubt`, never chosen. Writing that can't be read at all still goes in `unreadable`.

**Kept safely** (`acceptSketch`):

- A doubt makes a reading uncertain, whatever `certain` says.
- A doubt carrying invisible characters isn't kept, though the reading stays uncertain.
- A place off the photo is dropped.
- A reading read clearly keeps exactly the shape it had before. An earlier record, and its approval fingerprint, are unchanged.

**A photo position is evidence only.** It is the one number besides the photo's index that the reader gives. A test keeps it that way, and a test shows changing it never changes what's drawn. It's never a length, an angle or a coordinate.

**A reading made with doubt is never used as a fact:**

- A doubtful road name or width doesn't name or size a road.
- A doubtful measurement is still compared with the survey. Where it differs, the plan's check says it was read with doubt, and it still holds approval until the surveyor keeps the survey or corrects it.

**`dimension`** is a measurement not between two numbered points. It's shown, never compared.

**The sketch interpretation report** (`sketchintel/report.ts`) is worked out again from what was read and the points as they are now. It lists:

- each side drawn, with the numbers beside it, what they mean and what the survey gives;
- every point number and how it matched;
- the ties, diagonals and dimensions;
- the other writing;
- apart from all of that, everything read with doubt, everything the survey disagrees with, numbers the survey doesn't have, and lines read with doubt.

**How sure, by a fixed rule:**

| How sure | When |
| --- | --- |
| High | Read clearly, and the survey agrees |
| Medium | Read clearly with nothing to compare it with, or read with doubt and the survey agrees |
| Low | Read with doubt and not confirmed, or the survey disagrees or doesn't have the point |

The report never calls a reading verified on the reader's say-so.

**Shown at `/app/survey/<project>/sketch-report`**, linked from the Draft step's sketch card. What needs the surveyor comes first, each with its photo and a ring where the writing is. It's a page, not a PDF, because the PDF fonts can't draw Sinhala, and sketches are often written in it. The same report renders as Markdown (`sketchReportMarkdown`) for a file kept with the job. Everything from the sketch is escaped as text in both.

## Consequences

**On the owner's real job,** read again by hand in this format:

- the house wall 12, 9, 6, 4, 3 is drawn in full;
- the junction labels 6 and 9 are recorded as read with doubt, since both read 6 with the page upright;
- 3 and 4 are recorded as read with doubt, each with where it sits;
- 1.43 and 1.58 are shown beside the sides 6 to 4 and 4 to 3, differing from the survey by 1.50 m and 0.40 m, and listed for the surveyor;
- the lot and its area are unchanged.

The reader's new fields cost a few tokens per reading. A model that ignores them still works: its readings are kept as clearly read, as before.
