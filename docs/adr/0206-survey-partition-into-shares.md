# ADR 0206: Dividing a lot into shares is worked out by the engine and set out in the field

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 192
- **Builds on:**
  - ADR 0198 (tested code calculates; points are immutable);
  - ADR 0203 (several lots per plan).

## Context

Many Sri Lankan plans are sub divisions: a lot partitioned among owners by shares, as the reference plans show. The surveyor works out where the dividing lines fall, pegs the new corners, observes them, and draws the plan from what was observed. The survey skill's subdivision guide asks for deterministic splits, an area balance, explicit constraints from a cited source, and never presenting a share that breaks a hard rule as feasible.

## Decision

**A deterministic area cut, square or parallel to a chosen leg** (`src/core/survey/partition.ts`):
- **Input.** The surveyor gives the lot, the leg, the direction of the lines, the end to start from, and the shares. Shares are stated areas, one of which may take what's left.
- **Method.** Each dividing line's offset is found by bisection on the area below it, using an exact half-plane clip of the lot (Sutherland–Hodgman). The work is done in metres from the lot's first corner, so grid-sized coordinates keep their precision.
- **Output.**
  - each share's area, its length along the leg and its depth;
  - the area balance;
  - the proposed corners, named P1, P2… along each line, with their coordinates and the distance from the surveyed corner at the start of the leg each one lies on.
- **Shares in pieces.** A line that crosses the boundary more than twice (a share would fall in pieces) makes the result not feasible, with the reason.
- **UDA minimums.** When the surveyor asks, the UDA minimums (150 m², 6.0 m frontage, 12.0 m depth; regulations 9(a) and 14(1), for UDA areas) are checked per share, and a share that breaks one is never shown as feasible.

**A proposal, not a plan change.** Nothing is saved to the drawing. The proposed corners aren't survey points: the surveyor pegs them, observes them, imports them, and draws the shares as lots from the observed points. The setting-out table downloads as CSV.

## Stage 193 additions

- **Shares by width.**
  - **Square lines:** widths run along the leg from the starting corner (frontages), and together they share the leg's length. A lot that reaches past either end of the leg adds that part to the end share.
  - **Parallel lines:** widths run back from the leg (a 10 ft access strip, then the rest), and share the lot's depth.
  - **Placement:** each line sits at its stated distance, so no search is needed, and the areas follow from the clip.
  - **Units:** metres or feet (the international foot, 0.3048 m).
- **Lines through one corner.** The shares fan out from a corner the surveyor chooses, going round the boundary one way or the other.
  - **Exact solution:** with the corner fixed, the area cut off changes linearly as the line's far end moves along one leg. Each end is solved exactly on every leg that can give the area, with no bisection.
  - **Concave lots:** the first candidate whose line stays inside the lot is used. On an L-shaped lot, a signed-area answer can lie outside the lot. When no line stays inside, the result says so, and the share isn't feasible.
  - **Setting out:** each line's bearing and length from the corner, besides the distance along the far leg.
- **Every mode checks each share's area** against what was asked (to 0.01 m²), so a share whose lines can't give its area is never shown as feasible.
- **Snapping to a surveyed corner.** A line end within 1 mm of a surveyed corner ends on it only when that moves at most 0.002 m² (half its length times the offset). A share has at most four line ends, so its snaps stay inside the area check. The snap is applied to both shares' outlines.
- **Where a line meets the lot.** This is worked out from every crossing and every corner on the line.
  - A line through a corner pointing into the lot, or along one of its legs between two parts, leaves a share in pieces and says so.
  - A share's outline never folds back along the line.
- **Minimums:** they come from a versioned rule set or the surveyor's own figures (ADR 0207), not constants.
- **Engine:** `partition/1.1.0`.

## Consequences

- **Typical cases covered:** equal or stated shares across a lot, side by side along a road, one behind another, strips by width, and fans from a corner.
- **Not covered yet:** a whole land laid out with an access road and its lots at once, lines through a point that isn't a corner, and frontage on a leg other than the chosen one (roadmap).
- **No record of proposals:** proposals aren't stored. Saving them as versions, and showing them on a block-out sheet (UDA regulation 8), is later work.
