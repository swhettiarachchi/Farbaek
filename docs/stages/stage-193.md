# Stage 193: Survey Studio, dividing land by width, through a corner, under cited rules

- **Branch:** `feat/survey-193`, from `feat/survey-192` (PR #253, waiting for the owner's merge). No migration.
- **Why:** stage 192 divides a lot into shares by area, square or parallel to a leg. The roadmap's next subdivision items are:
  - strips cut out first;
  - lines through a fixed point;
  - the UDA figures as versioned data with a Development Plan override.

  The owner asked for development to continue until the feature is complete.

## Plan

1. **Shares by width.**
   - **Frontages:** along a road from a starting corner.
   - **Strips:** behind it, such as a "Res. for Access, 10ft. wide" reservation.
   - **Units:** metres or feet.
   - **Placement:** each line at its stated distance, with the areas from the same clip as before.
2. **Lines through one corner.** Shares fan out from a corner the surveyor picks, with each line solved exactly. A concave lot whose line would leave it is reported, never shown as feasible.
3. **Planning rules as versioned data** (ADR 0207). The UDA minimums with their document, sections, status and review date, and the cited reminders that apply. The surveyor's own minimums, cited in their words, for a Development Plan or other rule.

Each milestone has hand-worked tests, a look in the browser and a commit. Then come a fresh review, a re-check, the docs and the PR.

## Done

- **Shares by width** ([`partition.ts`](../../src/core/survey/partition.ts), `by: "width"`, `widthRoom()`):
  - **How widths are measured:**
    - Square lines measure along the leg from the starting corner, and the widths share the leg's length.
    - Parallel lines measure back from the leg, and share the lot's depth.
  - **Equal widths:** "N equal" divides the leg (square lines) or the depth (parallel lines).
  - **Errors:** each one names the room: "more than the leg's 40.000 m".
- **Lines through one corner** (`lines: "through"`):
  - The area cut off is linear along each leg, so each far end is solved exactly.
  - The first line that stays inside the lot is used.
  - Line ends within 1 mm of a surveyed corner end on it.
  - Setting out gives each line's bearing and length from the corner, besides the distance along the far leg.
  - The preview draws the engine's own segments.
- **Each share's area is checked** in every mode against what was asked.
- **Rules** ([`rules.ts`](../../src/core/survey/rules.ts), ADR 0207):
  - `uda-2020` with regs. 9(a) and 14(1);
  - reminders for regs. 4(1), 7 and 23;
  - a review note before and after 31 December 2026;
  - `ownRules()` for the surveyor's figures.

  The panel offers no minimums, the UDA set, or minimums the surveyor enters with their source.
- **Engine:** `partition/1.1.0`.
- **Docs:**
  - ADR 0206's stage 193 additions and the new ADR 0207;
  - the roadmap and the standards research;
  - the current-state row;
  - the public /survey page copy.

## Verified

- **Unit tests:** 28 partition tests with hand-worked answers:
  - 10 ft (3.048 m) strips: 60.96 m² along a side, 121.92 m² behind a 40 m road;
  - a lot reaching past the leg's end (200, 200 and 300 m²);
  - fans on a 20 m square (Q at (20, 10), bearing atan(2), √500 m);
  - an L-shaped lot: the inside line for 40 m², the west-side line for 250 m², and 60 m² reported as leaving the lot;
  - the UDA reminders and review notes;
  - the surveyor's own minimums.
- **Gates:** typecheck, lint and the design tests passed.
- **Browser** (dev demo, the Sample's lot B¹):
  - three equal frontages of 16.07 m;
  - a 10 ft access strip behind the road (3.05 m deep along 48.22 m);
  - two equal shares through corner 1 (20.90 and 20.91 P, line at 064°51′56″ for 52.672 m);
  - four equal shares under the UDA set, with the consent reminder and the review note.

## Next

- A whole land laid out at once: the access road and its lots together, with a feasibility report.
- The UDA access, turning circle and splay rules as checks on that road.
- Checking a subdivision plan's own lots against a rule set.
- A block-out sheet at not less than 1:1000.
