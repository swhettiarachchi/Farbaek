# Stage 303: the house closes round its room, and the faults a surveyor hit

The owner asked to use Survey Studio as a surveyor and fix what it turns up, and sent screenshots of a plan with no lot and failing presses (another job's sketch, a small screenshot, it turned out). Decision: ADR 0309.

## What was done

- `interpret.ts`: `holdsDrawn`, `offerJoin` (`JOIN_MAX_M`), one house drawn once; `Question.join`.
- `joins.ts` (new): `withJoin`, `withoutJoin`. `sketch.ts`: the record's `joins`; `sketchTooSmall`, `SKETCH_MIN_PIXELS`. `findings.ts`: joins read as lines; `strangeNumbers`, `looksLikeAnotherJob`; the join, joined and other-job findings. `correct.ts`: no corrections on another job's sketch.
- `actions.ts`: `joinSketchPointsAction`; `confirmSurveyItemAction` lands on a newer version when the item is unchanged (`itemSnapshot`); `join:` and `sketch:job` keys kept. `ai-actions.ts`: small photos refused; the read's message says when the sketch may be another job's; a new read clears join answers.
- `autosurvey-start.tsx`, `sketch-panel.tsx`, `photo.ts`: small photos said on their card; the read's elapsed time. `needs-you.tsx`, `keep-as-surveyed.tsx`: Join, It isn't drawn, Take the join off; cards keyed by version.

## Review

A fresh review found one serious fault and several smaller ones, all fixed:

- **The join search was slow:** it could hold the server for seconds on a dense sketch, because every candidate's rooms were worked out on every reading. It now runs only when a room could be found at all (a lot, and the label placed on its photo). It tries the nearest 25 joins once a reading, for every label.
- **A stale press could miss a change:** a press from an older page could land on a version a new reading had redrawn, answering questions the surveyor never saw. It now lands only when nothing but confirmations changed.
- **A joined stroke counted as a read:** after a join, a sketch read once was said to be read twice. A joined stroke no longer counts as a read.
- **Wide photos were refused:** a 21:9 phone photo, shrunk to 1,568 pixels on its long side, was refused as too small. A photo shrunk to that size was larger, so it is read.
- **Smaller ones:**
  - A number with a space in it is never offered a join.
  - Take the join off and Put it back say why they are off.
  - The other-job card's button says "It's this job's sketch".

## Verified

- `house-join.test.ts`: the room isn't drawn round the rest of the lot; the one join offered; joined as the surveyor's word and taken off; a room holding another line refused; no join over a metre; the photo size limits; another job's sketch.
- `confirm-race.test.ts`: a press lands on the newer version when the item is unchanged, and asks for a reload when it changed or the earlier version can't be read.
- The owner's real job, locally, with production's live read: the join 14 to 15 is offered; once joined, the house is 79.82 m² (81.71 printed) and the lot 132.70 m².

## Next

- Line thickness 0.13 mm, as the surveyor asked, and the plan's title, description and other details filled in automatically from his files, sketch, deed and earlier plans.
