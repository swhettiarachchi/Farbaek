# Stage 304: 0.13 mm lines, the plan's details filled in, and the house on both live reads

The owner passed on their father's two requests, from a practising surveyor's look at the plans: lines 0.13 mm thick, and the description and other plan details filled in automatically, with the best suitable Claude model at a sensible cost, since this is paid work. Using the plan as a surveyor on the second live read of the real job also showed the house wasn't drawn. Decision: ADR 0310.

## What was done

- **Lines:**
  - `document.ts`: `lineMm` and `boundaryMm`; `NEW_PLAN_LINE_MM`, a new plan at 0.13 mm.
  - `sheet/template.ts`: `drawingLines`, `LINE_MM_CHOICES`, `BOUNDARY_MM_CHOICES`.
  - `sheet/classic.ts`, `sheet/compose.ts`, `sheet/draw.ts`: every drawing line from `drawingLines`.
  - `autosurvey/defaults.ts`: the thickness carried; a setting the last plan lacks is no longer carried as nothing.
  - `compare.ts`: the change said in millimetres.
  - `plan-panels.tsx`: Line thickness and Lot boundaries on the Sheet panel.
- **Details:**
  - `autosurvey/plan-details.ts` (new): `nextPlanNumber`, `carriedDetails`, `withCarriedDetails`, `sketchDates`, `withSketchSurveyDate`, `detailDoubt`.
  - `defaults.ts`: a new plan takes them.
  - `ai-actions.ts`: a sketch read fills the survey date.
  - `exceptions.ts`: their cards, with their own evidence and next step.
- **Model:** `server/survey/drafting.ts`: the deed or old plan read on the strongest model the plan allows (Claude Opus 5.5 here), never below the standard tier.
- **House:**
  - `sketchintel/faces.ts`: `facesOf(…, "drop")`.
  - `sketchintel/interpret.ts`: the house's room tried before partial corners; one house per room; joins offered together (`JoinPair`, `joinWords`, `joinKey`).
  - `joins.ts`, `findings.ts`, `qc.ts`, `exceptions.ts`, `actions.ts`, `keep-as-surveyed.tsx`, `needs-you.tsx`: a join is one or more pairs.

## Review

A fresh review found three real faults and some smaller ones, all fixed:

- **A room a left-out line runs through:** the crossing mode could still give an area that two crossing lines cut inside it, when both ran from its outline. A 280 m² house and garden would have been drawn as one building. An area any left-out leg runs through is now no area.
- **A house's numbered corners lost:** sometimes a house's room was found but couldn't be drawn: no wall inside the lot, a side written as something else, or a line through it not drawn. A house with corners read beside its label then became only a question. It is drawn from its corners again.
- **Measurements read as dates:** "4.10" or "12.05" on a sketch would have filled the survey date with no card. A day and month now need a slash, or the year with a dot or a dash. A date read from a sketch always waits for the surveyor's confirmation.
- **Smaller ones:**
  - A joint offer only uses strokes that are sides of the room, never two strokes from one end.
  - A join whose key wouldn't fit the plan isn't offered.
  - A plan number ending in a year gives no next.
  - A sketch read just after midnight in Sri Lanka keeps that day's date.
  - A sketch read with notes but no drawing still fills the date.
  - The Lot boundaries choice offers only thicker lines.

## Verified

- `line-thickness.test.ts`:
  - a new plan's drawing at 0.13 mm, with the frame's own weight;
  - heavier boundaries when chosen;
  - an earlier plan unchanged;
  - carried to the next plan;
  - the change said.
- `plan-details.test.ts`:
  - the next number;
  - what is and isn't carried;
  - never over typed text;
  - the cards;
  - sketch dates and what isn't one.
- `house-join.test.ts`: two joins offered and made in one press; one alone refused.
- `stage254.test.ts`: crossing legs left out only when asked.
- The real job, locally, with production's two live reads: both give one offered join (14 to 15) and a 79.82 m² house (81.71 printed), with no partial outlines.
- `tsc` is clean, and the full suite passes.

## Next

- Boundaries worked out from the drawing (roads, adjoining lands, other lots).
- The district from the coordinates, with a free boundary dataset.
