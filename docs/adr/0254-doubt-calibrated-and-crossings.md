# ADR 0254: Doubt where it's real, the surveyor's attention where it's needed, and crossings asked about

- **Status:** accepted (stage 246, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0253 (every number on a sketch traceable, uncertain readings listed apart), ADR 0249 (the Sketch Intelligence Engine).
- **Changes:**
  - the reader's guidance on turned numbers;
  - the order of the report's "For you to decide";
  - one new question from the engine.

  No migration, no new dependency, no change to what's stored.

## Context

With the owner's consent, the production reader read the owner's real field sketch twice on 2026-11-24, before and after stage 245.

**After stage 245, it kept what it doubted, as intended.** It tied the two disputed tapes to their sides with the doubt the surveyor had raised. But two things went wrong:

- **It doubted almost everything.** 41 of 46 readings came back doubtful. Most were plain numbers written upside down or sideways, given letters as their "other reading" ("35 or SE", "3 or E", "1 or a tick"). The report's "For you to decide" ran to 47 items, and the two tapes that mattered were buried in them.
- **It misread a number that exists.** An upside-down 20 was read as "10 or 01". Point 10 exists, on the house wall, so the boundary wall came out as 18 to 10, cutting across the lot. A wrong number that happens to be in the survey can't be caught by checking the number alone.

## Decision

**A turned number isn't in doubt for being turned.** The reader is told:

- an upside-down 2 looks like a Z, and a 7 like an L, so an upside-down "OZ" is 20;
- a number is in doubt only when, turned the other way, it's also a number, which needs every digit to be 0, 1, 6, 8 or 9 (6 and 9, 16 and 91, 18 and 81, 10 and 01), and its place in the drawing doesn't settle which;
- never give a letter or a mark as a number's other reading.

**The report puts what needs the surveyor first.** Every uncertain item has a rank:

1. What the survey disagrees with, or doesn't have.
2. Numbers and measurements read with doubt that nothing confirms. A point number read with doubt stays here even when the survey has that number: it says only that the number exists, and a misread number can exist (the 20 read as 10).
3. Lines read with doubt.
4. Then, folded away as "Also read with doubt": labels and notes read with doubt, and measurements the survey agrees with exactly as read (within the usual measuring difference isn't enough).

None of them is used as a fact. The quieter group just isn't what the surveyor looks at first, and the count of what needs them leaves it out.

**Lines that cross where no number is are asked about.** A sketch's lines meet at numbered points. When two lines the sketch draws cross each other in the survey through both their insides, with no end within 0.10 m of the crossing or of the other line (marks on one wall are that close; the on-line tolerance of 0.25 m would hide the real case, where the misread end lay 0.26 m from the junction), one of their numbers is most likely misread. Dashed lines (roof edges, proposed lines) are left out, since they can pass over others. The engine:

- asks about it once per pair of lines, at most five times per read, within a fixed amount of work so a drawing at its limits stays quick;
- names the line read with doubt, when there is one;
- lets confirming that line, or removing it, answer the question; where the plan already had the same line (so the sketch's copy was never added), confirming that one answers it, and the surveyor's own line is already their answer;
- corrects nothing.

## Consequences

**On the owner's real job:**

- The live read's misread wall, 18 to 10, would have been asked about: it crosses the fence 9 to 15 where no number is. Where 18 to 10 meets the house wall, the meeting point is point 10 itself, so it isn't counted as a crossing.
- The hand reading of the same sketch raises no crossing.
- The next read in production shows whether the calibrated guidance cuts the doubt down to the readings that are really in doubt.

A legitimate crossing, such as a fence drawn across a drain, is asked about once and answered by confirming the line.
