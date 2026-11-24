# Stage 266: AutoSurvey, leader lines for crowded legs

- **Date:** 2026-11-24
- **Branch:** `feat/stage-266-leaders`, on stage 265's. Built as stage 251 on `feat/stage-251-leaders` and parked there; ported onto the current sheet code, with the label solver's preference order from stage 261 kept beside its per-place costs.
- **Decision:** ADR 0259
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: annotation never moves geometry or changes the scale; a leader ties words to their leg;
  - `farbaek-ui` for the preview's hit targets.

## Why

The brief (§15) asks for annotation placement that reduces label and dimension overlap without distorting the scale. On a row of narrow lots, the bearing and distance of each frontage had nowhere to go: 9 to 14 overlapping pairs for eight 8 m lots at 1:1000.

## What was built

- **`sheet/draw.ts`:**
  - `leaderWays` gives each leg's words leader places: 5, 9, 13 or 17 mm out from the place against the leg, on the lot's outside, straight out or shifted along the leg;
  - each place carries its leader, from the leg's middle to the words' nearest edge, and its dot as shapes, so the solver keeps other labels off both;
  - the places come after every existing place, so they're taken only when they clear something, and a dragged label's recorded place keeps its number;
  - a chosen leader is drawn as a thin ink line with a 0.35 mm dot on the leg, on the DIMENSIONS layer, with the leg label's entity, so it follows its words when they're dragged;
  - the overlap check behind the "labels overlap" finding and the crowded-leg schedule counts leaders and their dots.
- **`sheet/labels.ts`:** the solver looks again at a label standing at a dearer place, such as a leader, and a label still in conflict may take a place one or two others hold when they have somewhere clear to go (kept only when the total falls).
- **`components/survey/sheet-svg.tsx`:** the preview's large point hit targets leave leader dots out, so they don't catch clicks meant for the boundary under them.
- **`sheet/crowded.test.ts`:** the test for leaving crowded legs to the schedule moved to a row of twelve 5 m lots. The row of eight is now lettered clear without it.

## A fresh review found three real faults, fixed before the PR

- **A leader label never came back.** The solver skipped every label sitting at its own place's cost, so one moved to a leader to clear another stayed there after that label moved away. Now only a label clear at an ordinary place is skipped.
- **The dot wasn't part of the place.** Other labels could be placed over a leader's dot: on the panel layout's row of eight, point 109's number sat on one, unseen. The dot is now one of the place's shapes, and the leader cost lowered by the line its dot always crosses, so the order of places is unchanged.
- **The overlap check didn't see leaders.** It counted words and points only, so a label over a leader or its dot passed every test. It now counts both.
- **Seen once the check was honest:** the panel row of eight still had one pair; the solver's new chain step clears it, and the tightest rows improve too.

## Verified

- **`sheet/leaders.test.ts`:**
  - the row of eight at 1:1000, on the panel and classic layouts, is lettered with nothing overlapping (words, points, leaders and dots), its crowded legs with leaders, each from its dot to its own words;
  - a label over a leader, or over its dot, counts as an overlap, and a leader reaching its own words doesn't;
  - the sample sheet, which has room, has no leaders;
  - each dot is at its leg's middle;
  - a dragged leader label stays where it was put, with its leader following the words and its dot on the leg.
- **`sheet/labels.test.ts`:** a label at a dear place comes back once the label it made way for moves, and a label takes a place another holds when that one has somewhere clear to go. Each of these tests, and the panel row, fails with its fix undone.
- **Measured** (synthetic rows, overlapping pairs counting leaders and dots, without and with leaders, the same solver):
  - eight 8 m lots at 1:1000: 9 to 0 (classic), 12 to 0 (panel);
  - ten 6 m lots at 1:500: 0 either way (3 before the solver's chain step);
  - twelve 5 m lots at 1:1000: 53 to 7 (classic), 60 to 6 (panel);
  - composing the tightest sheet takes about 0.3 s.
- **The owner's real job:** its sheet is drawn byte for byte as before these fixes (local harness, real data kept out of the repo).
- **Looked at:** the row of eight drawn before and after, side by side.
- **Checks:** Survey Studio's tests (930), `tsc --noEmit` with a 4 GB heap, and lint on the sheet code.

## Not done, and why

See ADR 0259:

- leaders in the DXF, whose text is placed in model space by its own code;
- plans over several sheets, next.
