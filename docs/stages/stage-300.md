# Stage 300: the Draft step leads with one next step

The owner sent two screenshots from their father's PC: after Generate Plan, the plan opened on the Draft step's tools for drawing by hand, and "Draft the plan" stayed grey with no reason. "Backend should be advance but frontend should be simple and user friendly." Decision: ADR 0306.

## What was done

- `autosurvey-start.tsx`: after the sketch is read, a plan it drew opens on the Plan step; a note before Generate when the points carry no codes and no sketch is added.
- `ai-actions.ts`: the run's sketches stage records the Plan step when the read drew something.
- `[projectId]/page.tsx`: a project opens on the Plan step once anything is drawn; the Draft step shows `DraftNext`, the sketch card, and "Other ways to draw the plan" folded.
- `draft-next.tsx` (new): one next step from the plan's own state.
- `sketch-panel.tsx`: its words now say a sketch draws the plan.
- `draft-panel.tsx`: a reason beside "Draft the plan" while the description is too short; a one-line example.

## Review

A fresh review found no crash. It found one real flow fault and an untrue sentence, plus smaller ones, all fixed:

- In Express, Draft left the step list once anything was drawn, so a plan the sketch drew without its lot lost its way back to the sketch. Express now keeps Draft until there's a lot.
- "The plan says what kept it from closing" wasn't always true; it's gone. The card says the lot isn't drawn yet, and that a clearer photo, or its corners on the Lots step, closes it.
- "From your field sketch" is said only when everything on the plan came from the sketch; otherwise "Your plan has…".
- A sketch that drew only a symbol now counts as drawn, on the card and for where the project opens.
- "Open the plan now" no longer goes back to Draft while the deed is read.
- The no-codes note before Generate shows only when Claude can read sketches, and asks to tick reading when a sketch is added but not ticked.
- The run's record of where to open was never read, so that change was taken out.

## Verified

- `draft-next.test.ts`: each state's words and its one action. Design and survey tests (434). Whole suite 5,718. `tsc` and `eslint` clean.
- In the browser (demo workspace, the Sample): the Draft step at 1280 and 375 px reads "Your plan is drawn", "Farbaek drew 3 lots, 2 lines and the road. 2 things wait for you to check on the plan", Check the plan; then the sketch card; then "Other ways to draw the plan", folded. No sideways scroll.

## Not verified

- The father's own project (78b47fd5): it's in his workspace, which the owner's browser can't open, so whether a sketch was read on it isn't known. If none was, the Draft step now asks for it first.

## Next

- Live check after merge, and the owner asks their father to generate again with the sketch photo.
