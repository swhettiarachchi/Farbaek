# Stage 244: AutoSurvey, the deed's extent on the face of a classic plan

- **Date:** 2026-11-24
- **Branch:** `feat/stage-244-deed-extent`, from `feat/stage-243-surveyor-reading` (PR #306)
- **Decision:** ADR 0252
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio`: a stated extent and a computed area are different numbers, kept apart, and nothing is computed from the deed.

## What the owner asked

The licensed surveyor on the owner's real job confirmed that the extent on the plan, 0.01265 Hectares (5.00 P), is the deed's, while the resurveyed walls enclose 5.24 P. Farbaek's classic sheet always wrote the computed extent, so it couldn't produce the plan as the surveyor draws it.

## What was built

- **`document.ts`:** the setting `deedExtentOnFace: true`, optional and absent unless chosen.
- **`deed-extent.ts`:** the one rule for when the face gives the deed's extent (`deedExtentFace`), and how it's printed.
- **`sheet/classic.ts`:** when the rule says so, the extent line gives the stated extent.
- **`sheet/compose.ts`:** the boundaries schedule says the face gives the deed's extent and the schedule the computed one.
- **`qc.ts`:** `EXTENT_FROM_DEED`.
  - Information when the schedule is on.
  - A warning when the schedule is off, or when the stated extent can't be read (the face then falls back to the computed extent).
  - An extract gives its lot's computed extent.
  - The stated-extent check's advice says which extent the plan shows.
- **The Sheet tab:** the checkbox, shown on the classic layout when a stated extent is written. Off removes it.
- **`compare.ts`:** it's listed when it changes between versions.
- **The real-job runner:** takes sheet settings from `job.json`.

## A fresh review, and what it changed

A review agent read the change after every check passed and found six real faults. All are fixed, each with a test:

1. **The panel layout's schedule said the face gave the deed's extent**, when the panel face gives the computed one. The note now needs the classic layout, and the checks say the setting applies to the classic layout only.
2. **A dead end:** with the stated extent cleared, the checkbox vanished while the setting stayed on and a warning said to turn it off. The checkbox now stays in reach while the setting is on.
3. **The stated-extent check's advice was wrong** for an extract (it said the face gave the deed's extent) and with the schedule off (it named a schedule that wasn't there).
4. **An extract of a lot no longer on the plan** made the face, the schedule and the checks disagree.
5. **The deed's figures were rounded to the plan's perch decimals,** so "05.25 P." could print as "05 P.". Perches now print to at least the decimals the deed writes, and the check gives the printed figure beside the text as written.
6. **A plan with no computed extent** printed the deed's on the face with nothing beside it. The extent line is now blank, with a warning.

Faults 1, 3, 4 and 6 came from three files each deciding for themselves. One rule now decides it for all of them: `deed-extent.ts` (`deedExtentFace`), used by the front page, the schedule, the checks and the Sheet tab's hint.

## Verified

- **`sheet/deed-extent.test.ts`** (the synthetic sample):
  - the face gives "0.20234 Hectares ( 0 A. 2 R. 00.00 P. )" when chosen, and the computed extent by default;
  - the schedule keeps the computed extent and its note;
  - the setting turned off gives the same approval fingerprint as never having it;
  - the check is information with the schedule, a warning without it, and a warning with an unreadable stated extent (the face then computed);
  - the version comparison lists it.
- **The owner's real job, locally:**
  - the face reads "Containing in Extent 0.01265 Hectares ( 0 A. 0 R. 05.00 P. )", as on the surveyor's plan;
  - the schedule reads "Entire land: 132.698 m², 0.01327 Hectares ( 0 A. 0 R. 05.25 P. )" with the note;
  - the checks flag the 4.7% difference.
- **Checks:** the full `pnpm test`, `pnpm typecheck`, lint and `pnpm build` (see the commit).

## Not done, and why

- **The panel layout** already prints the stated extent beside the computed one, so the setting applies to the classic layout only.
