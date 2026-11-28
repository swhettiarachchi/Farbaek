# ADR 0302: Two agreeing reads settle a sketch line; another item's question doesn't hold it back

- **Status:** accepted (stage 295, 2026-11-28)
- **Builds on:** ADR 0301 (the sketch's quiet lines confirmed together), stage 257 (lines at least two reads drew make the lot), ADR 0249.
- **Changes:** when a line read from a sketch counts as settled, and which open questions hold it back. No migration.

## Context

Stage 294 grouped a sketch's lines that nothing stands against. Checked live on the owner's real job, it grouped none: the plan still asked for 44 confirmations. Measured on the job's stored read with the real-job harness (`real-job.test.ts`, which now lists what the plan asks):

- every one of the sketch's 28 numbers matched a surveyed point exactly, but the reader marked all 16 lines uncertain, as it does for a hand sketch, so no line was "settled";
- every boundary line was also held back by the lot's own question ("The lot's letter or number isn't written on the sketch"), because that question comes from the same sketch lines.

## Decision

- A line's course is **settled** when every number on it matched exactly, its points lie on it, and the reader was sure of it **or at least two separate reads of the sketch drew it through the same numbers**. Two reads agreeing is already what the lot is built from (stage 257). One unsure read never settles a line.
- A line is held back by a question still open **about it** (its kind, its width as a road), by a question that **names it among the lines it bears on** (two lines crossing where no number is: the question is answered on one line's card, but the misread number may be in either, so both are named in its `lines`), or by a question **naming no item** that comes from its sketch lines. A question about **another item** only (the lot's letter, a corner of the lot) is asked on that item's card and no longer holds the line back.

## Consequences

- On the real job, with its lines drawn by two reads (simulated from the stored read), 4 boundary lines go on the shared card and the list goes from 21 to 18 confirmations. The rest are genuine questions: an unlabelled double line, a line with x marks, the code list, the lot. The live count follows production's own repeated reads.
- Lines with open questions about themselves still need their own answer.
