# ADR 0265: Three reads of a sketch, and the lot drawn from the lines they agree on

- **Status:** accepted (stage 257, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0260 (two reads merged);
  - ADR 0264 (the reader's words, and a new read replacing an unchecked one).
- **Changes:**
  - the number of reads;
  - how they're merged;
  - one optional field on a sketch line;
  - how the lot is chosen from the sketch's lines.

  No migration, no new dependency.

## Context

On the owner's real job, the same photo read twice and merged gave a different lot from one run to the next. Merging keeps what either read saw, so a line only one read drew — a wall to the wrong corner — counted as much as the walls both drew, and the largest outline took it in.

## Decision

- **Three reads**, side by side, merged as before two at a time: everything any read saw is kept.
- **Each merged line says how many reads drew it** (`reads`). It's the least, over its segments, of the reads that drew that segment. A line is split where the count changes, so a segment only one read drew is a line of its own. The count is Farbaek's, never the model's: the reader's schema has no place for it, and the stored record accepts 1 to 9.
- **The lot comes from the lines at least two reads drew**, while those close round an outline. A line one read drew is still drawn, as read, waiting for the surveyor, but it doesn't move the lot. When it would make a wider outline, that's asked, with the line and the area it would give. When the reads agree on no outline, the lot comes from every line, as before; a single read, and every read from before this stage, uses every line.

## Cost

A read is a model call: three cost half as much again as two. A sketch is read once per job, and rarely again, so the plan's allowance is reserved for three.

## Verified

- **`stage257.test.ts`** (synthetic):
  - three reads with one stray side give each line its count, split where the count changes;
  - the count survives the plan's own checks, and a reader can't set it out of range;
  - the lot is the outline the reads agree on, and the wider outline is asked about;
  - with no agreed outline, or a single read, every line is used.
- **The earlier merge tests** pass unchanged.

## Not done, and why

- **Weighing a reading by how many reads gave it:** readings are kept once with doubt where reads differ (ADR 0260). Only the lot's outline is chosen by agreement, since a wrong lot is the costliest mistake.
