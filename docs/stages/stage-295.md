# Stage 295: fewer confirmations, measured on the real job

Checked live after stage 294 (#350, build 234e5a17f5e3): a fresh Generate names the surveyor on the sheet (the surveyor's own details, in place of "Surveyor not chosen yet"), and the real job's plan has the lot's label field on its card. But no sketch line was grouped, and the plan still asked for 44 confirmations. Decision: ADR 0302.

## What was done

- `src/core/survey/sketchintel/interpret.ts`: a line is `settled` when its numbers matched exactly, its points lie on it, and the reader was sure of it or at least two reads drew it.
- `src/core/survey/sketchintel/findings.ts` `settledSketchLine`: only a question about the line, or one naming no item from its sketch lines, holds it back.
- `src/core/survey/sketchintel/real-job.test.ts` (local only, env-gated): the evaluation now says what the plan asks the surveyor, and why each sketch line still has its own card.

## Verified

- `together.test.ts`: two agreeing reads settle a line, one unsure read never does; another item's question doesn't hold a line back, its own or an item-less one does. Sketch and survey action tests: 226 passed.
- The real job (local files): stored read, 21 confirmations, none grouped (one read, every line unsure); simulated two reads, 18, with 4 lines on one card. The comparison with the printed plan is in the untracked `reports/Plan 2933 evaluation/Plan 2933 comparison 2026-11-28.md`: lot the same but corner 2 (0.043 m off the side), 132.70 m² against 132.53 m², 7 of 8 lines in full, the road edge in part, 3 extra lines the sketch draws, the well found.

## Next

- After the merge: the live plan's count, from production's own repeated reads.

## Review after the merge

A fresh review found two ways a line through a doubted number could still be confirmed with the rest, both fixed (`fix/stage-295-review`):

- The question about a number written where another point would be was answered on one item's card (the lot, or the first line through it) and named no other line, so the walls through that number counted as settled. It now names every line through the number (`lines`), as the crossing question does.
- Two agreeing reads settled a line even through a number read with doubt (a 16 that may be 91, or numbers the reads disagreed on). Reads agreeing now settle a line only when none of its numbers was read with doubt (`doubtfulNumbers`); a sure read still does.

This note named the surveyor as printed on the sheet; the name is taken out.
