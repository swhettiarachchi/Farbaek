# Stage 227: AutoSurvey, part 9: three modes, one project

- **Date:** 2026-11-23
- **Branch:** `feat/stage-227-modes`, from `feat/stage-226-defaults` (PR #290, which carries #289)
- **Decision:** ADR 0238
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-ui` (segmented control as a pill group, sentence-case labels, no dead ends), `farbaek-human-made`.

## What was built

- **`src/core/survey/modes.ts`:** Express (default), Professional and Manual CAD; the steps each shows, always including the open one; the cookie name and its parser.
- **`src/components/survey/mode-choice.tsx`:** a three-way pill switch under the project's title, with one line saying what the mode is for. Choosing one is remembered for a year on Survey Studio's paths, and the page refreshes.
- **The project page** shows the mode's steps, the Sample included.

## Verified

- **Tests:** 4 on modes:
  - Express by default, and only known modes read;
  - Express showing Draft until drawn, then Plan and Export;
  - Professional showing every step, and Manual CAD the drawing steps;
  - the open step always shown in its place.
- **In a browser,** on the Sample at phone width:
  - Express shows Plan and Export under "Needs your confirmation";
  - Professional shows all nine steps, and Manual CAD shows Points, Lots, Plan and Export;
  - the choice is remembered;
  - a link to History in Express shows History as the current page;
  - no sideways scroll.

## Next

The parts left in `docs/stages/stage-222.md`:
- 4, originals stored (needs a migration and a storage decision);
- 6, background jobs (needs a migration);
- 7, Leica GSI observations (needs Leica's word for whether its angles are oriented);
- 8, label refinements (most is already in place).
