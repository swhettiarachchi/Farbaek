# Stage 306: add to an existing plan

The owner asked for AutoSurvey to become a fully automated platform, and for a surveyor to be able to come back to a project with more information and have Farbaek update only what it changes. The brief is mapped requirement by requirement in `docs/survey/AUTOSURVEY_PLATFORM_BRIEF.md`; this stage is the first of its gaps. Decision: ADR 0311.

## What was done

- **The update:**
  - `src/core/survey/autosurvey/update.ts` (new): `updateForNewPoints`, `pointConflicts`, `asThePlanHasThem` and `conflictSaid`.
  - `src/app/app/survey/actions.ts`: `addToSurveyPlanAction` reads, checks, imports and saves one updated version, and makes the update again once on a newer version.
- **Sketches and photos:**
  - `src/app/app/survey/ai-actions.ts`: a sketch read takes `withStored`, reading the photos the plan keeps with the new ones. It refuses when one is missing, and keeps the surveyor's corrections and joins.
  - `src/components/survey/start-uploads.ts`: `DEED_LIMITS` and `decodeSurveyText`, now shared with the start screen.
- **The card:**
  - `src/components/survey/add-to-plan.tsx` (new): the card.
  - `src/app/app/survey/[projectId]/page.tsx`: the card on the Plan step, in a fold above "Needs you".

## Review

A fresh review found two serious faults and several smaller ones, all fixed:

- **Points left undrawn:** if a file failed after earlier ones were imported, or the save lost a race, adding the files again drew nothing for them.
  - The plan is now updated for whatever got in.
  - A lost race is retried once on the newest version.
- **A line taken off came back:** a line the surveyor took off or changed was drawn again when new points made it longer. Such a line is now never drawn again.
- **Repeats refused as clashes:** a returning surveyor's export without heights or codes was refused against the plan's points.
  - The plan's points are now compared as the start screen compares files.
  - Repeats are sent as the plan has them.
- **Earlier sketches lost:** a kept photo that couldn't be loaded would have been dropped from the new read silently. Now the read is refused, and the surveyor's corrections and joins carry over.
- **Smaller ones:**
  - A lot or road taken off isn't drawn again.
  - A lot isn't redrawn off a named neighbour's side.
  - A changed grid is refused.
  - The photo limit counts the kept sketches before anything is sent.
  - The consent says the kept sketches go too, and is asked again for each batch.
  - A traverse can be adjusted as on the start screen.

## Verified

- `update.test.ts`:
  - a waiting wall, lot and road grow with new points, nothing drawn twice;
  - what the surveyor confirmed stays and is said;
  - a new line drawn under Farbaek's line words;
  - a line, lot or road taken off never comes back;
  - a neighbour's side kept;
  - clashes found, and files without heights or codes not refused.
- `add-to-plan.test.ts`:
  - a clash refused with nothing imported;
  - an old version refused;
  - new points imported and the lot updated in one version;
  - a 2D repeat sent as the plan has it;
  - a changed grid refused;
  - nothing saved when nothing is new.
- **The card on the Sample, locally:**
  - "4 points: 2 new, 2 already in the plan";
  - a re-shot point named 0.200 m away;
  - no sideways scroll at 375 px.
- The full suite passes. `tsc` and `eslint` are clean.

## Next

- Stage 307: bring back an earlier version in one press, so an update can be undone as a whole.
- Live walk after merge: add a second file and a second sketch to the real job's test plan.
