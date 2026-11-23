# Stage 240: AutoSurvey, legs too crowded to letter left to the schedule

- **Date:** 2026-11-23
- **Branch:** `feat/stage-240-crowded-legs`, from `feat/stage-239-curves` (PR #302)
- **Decision:** ADR 0248
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: no figure leaves the plan (every leg stays in the schedule), the sheet says what it did, the surveyor chooses;
  - `farbaek-ui`: a checkbox shown only where it can apply.

## What the owner asked

The AutoSurvey brief's §14 asks for annotation a cartographer would accept. The implementation report listed a leg table for dimensions that can't fit as not built.

## What was built

- **The setting** `crowdedLegsToSchedule` (optional, absent unless chosen) and its checkbox on the Sheet tab, shown with bearings and distances on the face and the schedule overleaf.
- **`composeSheet`:** after the labels are placed, legs whose labels still overlap are left to the schedule (the shorter of two overlapping legs), and the sheet is composed again without those labels at the same scale and paper, adding legs crowded by the move for up to four rounds. It's kept only when the face is clearer and nothing new stops the export; otherwise every leg stays lettered and `LEGS_NOT_SCHEDULED` says so.
- **The face's note** names those legs by their corners' numbers and says where their figures are, on both layouts; `LEGS_IN_SCHEDULE` in the checks says the same.
- **`overlappingEntities`** (draw.ts): which drawing entities overlap, beside the existing overlapping label names.

## Verified

- **`src/core/survey/sheet/crowded.test.ts`, 11 tests:**
  - on a row of eight narrow lots at 1:1000 (synthetic), on the classic and panel layouts: fewer overlapping labels, the note on the face, the finding, and every leg's distance still in the schedule overleaf;
  - six layouts, including the review's: the scale and paper are always those without the option, nothing new stops the export, and the face is either clearer with every left-off leg named, or exactly as without the option;
  - the comparison says "off" and "on"; nothing changes without the schedule overleaf; the setting is absent from a document until chosen.
- **Measured (synthetic):**

  | Layout | Scale and paper | Overlapping label pairs, every leg lettered | With the option |
  | --- | --- | --- | --- |
  | Classic, eight 8 m lots | 1:1000, A4 | 9 | 0, 8 legs to the schedule |
  | Panel, eight 8 m lots | 1:1000, A4 | 14 | 0, 8 legs |
  | Panel, eight 5 m lots | 1:500, A4 | 1 | 0, 4 legs |
  | Classic, four 5 m lots 73 m deep | 1:500, A4 | 2 | 2, every leg kept on the face |
  | Classic, four 5 m lots 103 m deep | 1:500, A3 | 6 | 6, every leg kept on the face |
- Survey, app, component and design tests pass. `pnpm typecheck`, lint on the changed files and `pnpm build` pass.

## Review

A fresh review agent reproduced two faults and two smaller ones, all fixed and tested:

1. **On the classic layout the note took room from the drawing,** so the second composition could land on another scale or paper (1:500 became 1:1000, A4 became A3) or block the export, while the note still said "at this scale". The second composition now keeps the first one's scale and paper, and is dropped if it stops the export.
2. **Leaving labels off moved the others into new overlaps** that stayed lettered. Legs crowded by the move are now added, for up to four rounds, and the result is kept only when the face is clearer.
3. **Smaller:** the note named six legs and "2 more"; it now names every one. The comparison said "nothing" to "on"; it now says "off" to "on".

## Not done, and why

- **Not looked at in a browser:** the sample isn't crowded at its scale, and the demo workspace can't save a crowded plan. The sheet's text is checked in the tests.
- **Leader lines** (a label moved off the leg with a line back to it) aren't drawn.
