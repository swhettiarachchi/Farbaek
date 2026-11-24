# ADR 0271: An independent check of the plan against the sketch

- **Status:** accepted (stage 263, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0234 (reading sketches), ADR 0240 (photos kept with the plan), ADR 0249 (the sketch's drawing), ADR 0265 (three reads merged).
- **Changes:** the sketch read, a new "check again" action, the sketch record (one optional field), the plan's checks and the field sketches panel. No migration, no new dependency.

## Context

The owner asked for independent validation of every plan AutoSurvey draws: "strengthen the backend, use advanced AI technologies wherever appropriate, and improve independent validation". Until now the only check of the sketch's lines against the plan was the reads themselves, merged. Three reads can agree on the same mistake, as they did on the owner's real job, joining 17 straight to 14 across an unsurveyed corner.

Asking a model a narrower question is more reliable than an open read: "does the sketch draw a line through 5 and 6?" rather than "what lines does the sketch draw?".

## Decision

- **A check after every read.** Once the three reads are merged and their drawing put on the plan, the same photos go to Claude once more.
  - **What it gets:** the plan's lots, lines and outlines by point numbers, in order, with "corner" for a constructed corner (ADR 0270) and the writing along each.
  - **What it gives:** for each item, `drawn`, `not_drawn` or `unsure`, with a note naming the leg; and the lines the sketch clearly draws that no item covers.
  - **Never a position:** the answer has no place for a coordinate, a length or an angle.
- **Kept with the sketch's record.** The verdicts go in `sketch.check`, against the numbers that were checked.
  - **Only reading writes that record.** A plan saved from the browser keeps the stored one, so nobody can make a doubt go away by editing it.
  - **Model answers are untrusted:** a verdict for an item that wasn't asked about, a second verdict for one item, a missing line on a photo that wasn't sent, too short, or carrying invisible characters, are all dropped. Text is trimmed and cut to its limits.
  - **A new read** writes a new record, and the new check with it.
- **Findings.**
  - **`SKETCH_CHECK_DOUBT`** (professional review, holds approval): beside each item the check doubted, while its numbers are as checked, until the surveyor keeps the plan as drawn or corrects the item (see "After review").
  - **`SKETCH_CHECK_MISSING`** (professional review, holds approval): each line the sketch draws between surveyed points that the plan still doesn't, until it's drawn or the plan is kept as drawn.
  - **`SKETCH_CHECKED`** (information): how many items the check found drawn so.
- **Metered as a read.** One call, under `survey_read`, on the model a read takes and never below the standard tier.
  - Usage is reserved first, and given back when the call fails or Farbaek's own checks refuse its answer.
  - The audit line records counts only.
  - **A check that fails never undoes the read:** the read is saved, and the message says the check didn't run.
- **Check again.** After corrections, "Check against the sketch again" sends the photos kept with the plan's last read once more, with the surveyor's consent on that request, and saves the new verdicts as a version. It's shown only where the photos were kept.

## After review

A fresh review found four real bugs, all fixed with tests:

- **Long lines.** An item of more than 60 points could never be kept, though the call was paid for. Items now hold up to 500 points, as lines and lots do.
- **Roads.** Roads weren't asked about, so their edges came back as missing lines. Each road's two edges are now items.
- **Doubts hidden by confirming.** A doubt was hidden once its item was confirmed, and editing an item confirms it. So "check again" after corrections hid exactly the doubts it was run to show.
- **Dead ends.** Some doubts could never be answered: a hand-drawn line, a lot typed on the Lots step, or a missing line naming a number that isn't surveyed.

The fix for the last two:

- **Each doubt and missing line is its own finding.** It's answered by keeping the plan as drawn (`check:i…` or `check:m…`), as a sketch's differing measurement is. It holds approval until then (professional review), whoever drew the item. A doubt also goes once its item's numbers change.
- **Missing lines are checked against the survey:** one naming a number that isn't surveyed isn't raised.
- **A new check, or a new read, clears the earlier answers.**

Also:

- "check again" retries once on a newer version of the same read, instead of dropping a check that was paid for;
- a note or label written over two lines is folded before it's screened, not blanked.

## Consequences

- Every sketch read now costs one more call, about a third of a read: the photos go once more, and the answer is short.
- A plan the check doubts can't be approved until the surveyor has looked at each doubt and missing line: kept the plan as drawn, or corrected it.
- The check can be wrong too. A doubt is a pointer, never a fact, and the plan never changes from it.

## Verified

- `sketchintel/verify.test.ts` (6 cases):
  - what's asked, with constructed corners as "corner";
  - only the items asked about are kept, once each, with missing lines on sent photos only;
  - doubts, missing lines and the summary;
  - a doubt dropped once the item is confirmed or changed, a missing line once it's drawn, and a plan never checked says nothing.
- `server/survey/sketches.test.ts` (2 new cases, a labelled stand-in model):
  - metered once as `survey_read`, with counts-only audit, the prompt's rule that everything given is data, and the message's shape;
  - usage refunded when the call fails, and a viewer or an empty plan refused before any reservation.
- **Not yet verified:** a live check on the owner's real job. That waits for the merge and the next sketch read in production.
