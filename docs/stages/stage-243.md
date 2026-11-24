# Stage 243: AutoSurvey, reading a sketch as a surveyor reads it

- **Date:** 2026-11-24
- **Branch:** `feat/stage-243-surveyor-reading`, from `feat/stage-242-printout-dxf` (PR #305)
- **Decision:** ADR 0251
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio`: positions only from the survey, a written width compared and never used, the stated extent kept apart, real client data kept out of the repository.

## What the owner asked

"You need to understand all of this as a surveyor": the instrument data, the field sketch and the finished plan of a real job, together.

## What was found by reading them together

The full reading is in the owner's local evaluation report, never committed. What it taught the engine:
- **The field book was turned while drawing.** Numbers were upside down, and four along the road had been missed.
- **The top note was the job's title, not the road's label.** The road's name was written in Sinhala.
- **The lot's frontage was a gate.**
- **The road's two sides were both surveyed:** the walls across it, and the frontage with the neighbours' walls. Its width on the ground (10.7 to 11.9 ft) isn't the 15 ft the plan states, which is its reserved width.
- **The stated extent was exactly 5.00 perches,** the deed's figure, while the walls enclose 5.24 P.
- **A taped 1.65 from the well to a point agrees with the coordinates** (1.657 m).
- **One lot corner sits on a straight wall** because it's where the southern neighbours change. The sketch doesn't name them, so it can't be found from the sketch.

## What was built

- **The reader's instructions:**
  - writing in any direction and upside-down numbers;
  - titles as notes;
  - road names;
  - gates;
  - distances between arrowheads.
- **`classify.ts`:**
  - the gate kind (FENCES layer);
  - road names in areas;
  - symbol words in English and Sinhala (ළිඳ).
- **`interpret.ts`:**
  - `roadBetween`: a named road between the lot's side and a line drawn across from it, carried on by the neighbours' walls, its width measured, a different written width asked about, a name the sheet can't print asked for;
  - `roundPerches` in the lot's evidence.
- **`apply.ts`:** the road goes on the plan waiting for one press, its width in feet.
- **`qc.ts`:** the extent check says when a stated extent is whole perches.

## Verified

- **`surveyor243.test.ts`** (synthetic):
  - gates, and road names in English and Sinhala;
  - the road drawn from its two sides and measured;
  - a written width asked about or confirmed;
  - a Sinhala name asked for;
  - never without a name, never from a line too close, never across the lot, never from a line only past the side's end;
  - ළිඳ naming a well;
  - whole perches;
  - the reader's instructions holding no real job's names.
- **The owner's real job, locally,** with the sketch transcribed again as a surveyor reads it:
  - 8 of the plan's 8 lines drawn in full;
  - the road measured at 3.25 to 3.63 m;
  - the gate read, and the well strong;
  - the 5-perch extent pointed out;
  - the only error is the lot's letter, which the sketch doesn't carry.
- **Checks:** the survey tests, `pnpm typecheck`, lint, the full `pnpm test` and `pnpm build` (see the review section).

## Review

A fresh review agent reproduced 9 faults. All are fixed, each with a test in `review243.test.ts`:
1. **On an L-shaped lot, the road could be drawn through the lot.** "Outside" was judged from the corners' mean, which a concave lot can lie outside. It's now judged from which way round the outline runs, and neither the far line nor the way across to it may cross the lot.
2. **The nearest line was chosen without asking:** a neighbour's house wall 2.5 m off became "the road", and the first of two names was taken. Now a road is drawn only when exactly one line could be its far side and one road is named; otherwise it's asked.
3. **A line from the frontage's end into the lot could become the road's near side.** Lines into the lot, or across it, are no longer carried on.
4. **The road's own questions never reached the plan's checks.** Roads are now found by their item id.
5. **Any road on the plan answered another road's one-edge questions, even an unconfirmed sketch road.** Now only a road along that line, confirmed by the surveyor, answers them.
6. **A road the plan already had could be added again.** A road sharing the same sides is now skipped and said.
7. **Owners' land and lot descriptions that mention a road** ("Land of Perera, Station Road"), and Sinhala words that only contain a road word, were taken for roads. A road's name must now end in its road word and not be about someone's land; Sinhala words stand alone.
8. **A bare number read as a road became its name,** and a Sinhala width ("අඩි 15") was taken for a name. Names must now read as names, and Sinhala feet and metres are widths.
9. **The lot's evidence doubted a stated extent that agreed.** The whole-perches sentence now appears only above a 1% difference, worded "comes to N.00 perches".

Also from the review:
- **Real names:** the test held fragments of a real job's names and figures. They're replaced with made-up ones.
- **Name cuts:** a road's name is cut without splitting a character.
- **Sinhala tree word:** ගස stands alone.
- **Contradictory questions:** the one-edge road questions are left out for lines the two-sided road already draws.
- **Bends:** a check added while fixing (no near-side line back on the lot's side of the frontage) dropped a real neighbour's wall where the road bends. It was removed, since the inside and crossing checks already keep lines out of the lot.

Final run:
- the full `pnpm test`, `pnpm typecheck`, lint and `pnpm build`;
- the real job again: 8 of 8 lines, and the road along 32-21-22-23 measured at 3.25 to 3.63 m.

## Not done, and why

- **A corner where the neighbours change** can't come from a sketch that doesn't name them.
- **The road's direction texts** ("From…", "To Houses") and a drain beside a road aren't read.
- **Label placement around roads:** a few labels still overlap, which the checks report.
