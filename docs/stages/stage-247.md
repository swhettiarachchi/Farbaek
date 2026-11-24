# Stage 247: AutoSurvey, a number written where another point belongs

- **Date:** 2026-11-24
- **Branch:** `feat/stage-247-number-places`, from main after #309.
- **Decision:** ADR 0255
- **Migration:** none applied by this stage's code. **Applied in production today, with the owner's go:** v102 (survey jobs) and v103 (kept sketch photos). `check-migrations.ps1` had read both back as missing; after `apply-migration.ps1` (hash-checked, one transaction each), both read back `t`. Generate Plan's job progress and sketch photos are kept from now on.
- **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` and its field-sketch reference: a sketch keeps the survey's shape but not its scale, so where a number is written is evidence, never a position.

## The third production read (stage 246 live)

With the owner's go, the real sketch was read again through "Read and replace" in the owner's workspace (Sonnet 5.5).

- **Better than before:**
  - 50 readings and 29 point numbers;
  - no letter offered as a number's other reading;
  - corner 21 and the north side read;
  - the sketch's photo now kept beside its readings (v103).
- **A lot for the first time:** 35, 34, 33, 17, 14, 18, 10, 21, 22, 5, 1 and 2, 112.26 m² against the surveyor's 132.70 m². It's wrong in two places:
  - 10 is the upside-down 20, misread, and 10 is another surveyed point;
  - 14 is put on the west wall.
- **What stage 246 caught:** the crossing check asked about the line through 18, 10 and 21. The lot's card didn't say so.
- **Still too much doubt:** most turned numbers are still marked doubtful, now with digit pairs rather than letters.

## What was built

- **`sketchintel/placement.ts`** (`misplacedNumbers`): an affine fit of each photo's numbers to their surveyed points, found by consensus so a few misreads or a far station can't steer it. It flags a number written where another point would be, and says whether that point's own number is written there too.
- **The engine** (`interpret.ts`, from `findings.ts` `placedNumbers`):
  - a question per misplaced number, at most five, answered by confirming or correcting the lot or line that uses it;
  - the lot's card says when a corner may be misread, or when its outline uses a crossing line, and its level is then "check".
- **The report** (`report.ts`): a misplaced number comes first, with its reason.

## A fresh review, and what it changed

A review agent ran the module on its own cases and found five real faults, one minor issue and three gaps. All are fixed, each with a test in `placement.test.ts`.

1. **A number two surveyed points share** was asked about with itself as the answer. Shared numbers are now neither fitted nor flagged, and a number is never suggested as itself.
2. **"Written there too" was checked anywhere on the photo,** so a swap of 4 and 8 was described as "beside where 8 is written". It's now checked at the other point's own place, and a swap is told as one: each "may be" the other.
3. **One far point could steer the fit or switch it off:** a station 3 km away made every triangle of nearby points look flat; at 0.2 to 1 km it pulled the fit to itself. The fit is now found by consensus:
   - exact fits through three numbers are tried, all of them for up to 14 numbers, else a fixed sample of 400;
   - the one most numbers agree with is kept;
   - a triangle's flatness is judged against its own size;
   - the refinement is fitted in the agreeing numbers' own frame.
4. **A failed refit dropped the photo.** A refinement that fails now keeps the fit it started from.
5. **A label written twice** was marked out of place in both readings. It's now matched by the reading itself.
6. **Duplicate questions:** one per number now, however many photos raise it.
7. **Crossing evidence was missed on a lot written as an area.** A line between two of the lot's points now counts as the lot's.
8. **A question nothing could answer:** a misplaced number used by no lot or line is now listed in the sketch report only, not asked about.
9. **Speed:** each point's place is now worked out once per photo, and the nearest is found in one pass.

## Verified

- **`sketchintel/placement.test.ts`**, on a synthetic 12-point grid photographed upside down, scaled and uneven:
  - a number written where an unread point is gets that point suggested;
  - beside a written point, the number is only said to be out of place;
  - nothing is raised for a hand's unevenness of up to 60 units;
  - six numbers are needed, a line of points raises nothing, and photos are fitted separately;
  - a label written twice doesn't vote;
  - the engine's question and the lot's card;
  - proposals are equal with and without places.
- **The real job, locally:**
  - **the production read's places,** through `misplacedNumbers`, raise 10 (written where 20 would be), 12 (beside the well's 19) and 14 (beside 17);
  - **the hand reading's eight placed numbers** raise nothing;
  - the evaluation is unchanged.
- **Checks:** the survey, reader, app and design tests (1,091) and the sketch tests (104); `pnpm typecheck`, lint, and `pnpm build` with a 4 GB heap. After the review's fixes, the real read still gives the same three numbers, and the hand reading still raises none.
