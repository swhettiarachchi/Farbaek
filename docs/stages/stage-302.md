# Stage 302: the second reading corrects the lot, and ten days with more free AI

The owner said "Yes, fix the lot" after the stage 301 walk, then "make it free, use ai free for next 10 days in this feature" when their own read hit the daily limit. Decision: ADR 0308.

## What was done

- `src/core/survey/sketchintel/second-reading.ts` (new): `linesToLeaveOut`, `withSecondReading`, `withLinePutBack`.
- `src/core/survey/autosurvey/sketch.ts`: the sketch record's `leftOut`.
- `findings.ts`: the drawing is read without left-out lines.
- `ai-actions.ts`: reading a sketch applies the second reading's corrections right after the check, and says so.
- `verify.ts`, `exceptions.ts`, `needs-you.tsx`, `keep-as-surveyed.tsx`: the card, Leave it out and Put it back; `actions.ts`: `putBackSketchLineAction`, and `left:` keys kept.
- `src/server/ai/config.ts` `SURVEY_FREE_BOOST`, `src/server/survey/assistant.ts` `surveyAiDaily`: ten days with more free AI.

## Verified

- `second-reading.test.ts` (synthetic): the misread side is left out and the lot redrawn (220 to 200 m²); never a line read twice or with certainty, nor on a drawn or unsure verdict, a verdict about other numbers, or without a check; unchanged when the lot would be lost; the card, agreeing to it, and putting it back.
- The owner's real job, locally, with production's live read and check (test project cf9627fb): lines 18-10-20-22 and 23-5 left out; the lot 1-35-18-20-21-22 = 132.70 m², the surveyor's own (168.26 before); 41 things for the surveyor (47 before).
- `config.test.ts`: the boost, before, during and after the ten days. `tsc` and `eslint` clean.

## Review

A fresh review found two real faults and a small one, all fixed:

- A line the surveyor confirmed, kept through a new read, could be left out and the lot redrawn off it: only a line still waiting for them is left out now (with its test).
- An earlier "Leave it out" answer carried to the next read's line of the same number, born answered: a new read clears them, as it clears the other answers about a read.
- The read's message counted what was drawn and asked before the corrections: it counts after.

## Not done

- The house from that sketch is still wrong (116.95 m², printed about 82 m²).
- The sketch's read is still slow (about three and a half minutes).
