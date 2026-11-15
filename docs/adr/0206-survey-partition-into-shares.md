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

## Consequences

- **Typical cases covered:** equal or stated shares across a lot, side by side along a road, or one behind another.
- **Not covered yet:** lines through a fixed point, access strips and roads cut out first, and frontage on a leg other than the chosen one (roadmap).
- **No record of proposals:** proposals aren't stored. Saving them as versions, and showing them on a block-out sheet (UDA regulation 8), is later work.
