# ADR 0205: Near misses are answered by the surveyor, never repaired

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 192
- **Builds on:**
  - ADR 0198 (points are immutable; nothing changes silently);
  - ADR 0203 (lot topology).

## Context

Lots built from surveyed corners sometimes nearly meet: one lot's corner a few centimetres off its neighbour's leg, or the same mark observed twice under two numbers a few millimetres apart. Before this stage only the consequence showed (a gap, an area mismatch), with no cause. CAD tools find these with tolerances and offer to "fix" them by snapping, which here would record as surveyed a position nobody observed: misconduct under the Survey Act, section 45 ([CAD_PRODUCT_STUDY.md](../survey/CAD_PRODUCT_STUDY.md)).

## Decision

**Find them, name them, and let the surveyor answer.** `computeLots` reports corners between 0.5 mm and 5 cm off another lot's leg (away from its ends) and corner numbers of different lots within 5 cm, all of them. Each is a finding for the surveyor that holds approval (`CORNER_NEAR_LEG`, `POINTS_NEAR_DUPLICATE`), naming the points and the distance.

**Two ways out, neither moves a point:**
- the surveyor fixes the drawing (adds the corner to the neighbouring lot, or uses one number for the mark);
- or answers **Keep as surveyed**.

**The answer is part of the version.** Keeping saves a new drawing version with the near miss's key in `kept`, so the approval hash covers it, History shows it, and "Check it again" undoes it. Only a near miss the plan has can be kept, and every save drops answers for near misses that are gone. An empty `kept` is left out of the approval hash, so approvals made before the field existed still stand.

## Consequences

- Gaps and mismatches now come with their likely cause.
- The threshold is fixed in code (5 cm); an office setting may come later.
- A kept near miss still shows, as information, so a reviewer sees what was decided.
