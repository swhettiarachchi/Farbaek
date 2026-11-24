# ADR 0266: Road names, direction words and lines' codes placed by the label solver

- **Status:** accepted (stage 258, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0242 (labels placed together, a dragged label's place recorded).
- **Changes:** the sheet's road and line labels. No migration, no new dependency.

## Context

On the owner's real job, a road between the lot and a masonry wall printed with its name over the wall's "MW", and a surveyor's "Proposed Drain" over the road's direction words. Road names, direction words and lines' codes each had one fixed place and were only added to the solver's obstacles, so the solver could move other labels away from them but never move them.

## Decision

Each has a few places, tried in order, and takes the first that covers nothing:

- **A line's code:** along its three longest legs, at the middle and a third of the way from each end, on the lot's side and then the other.
- **A road's name** (and its width under it, as a pair): along the centreline's longest leg at its middle, then towards each end, then the middles of its other legs.
- **A road's direction words:** beyond the end, as before, then further out, then to either side of the road's line.

The first place in each list is where it always went, so a plan whose labels were already clear prints as before. A label the surveyor dragged stays measured from the place it was dragged from; an older drag without its place is measured from the first place, where it was drawn before.

## Verified

- **`sheet/stage258.test.ts`** (synthetic, the real job's arrangement):
  - with a wall along a road's far edge, the road's name and direction words and the wall's code don't overlap (they did before: the test fails on the old drawing code);
  - with nothing in the way, the name takes its first place;
  - an older drag keeps the first place.
- **The survey and design tests** pass unchanged.
