# Stage 298: the surveyor's sketch habits

The owner said yes to "learning his sketch habits", to stop the same questions coming back. Decision: ADR 0304.

## What was done

- `src/core/survey/document.ts`: `sketchHabits` (at most one per style: double, crossed), optional.
- `src/core/survey/sketchintel/classify.ts`: `classifyLine` takes the habits; a line drawn that way with nothing written is read as the habit's code (`fromHabit`); `habitChoices`, `HABIT_KIND`, `STYLE_WORDS`.
- `interpret.ts`, `findings.ts`: no "What is the line" question when a habit answers it; a habit counts as writing for how sure a line is.
- `src/core/survey/exceptions.ts` `habitOffer`; `src/components/survey/confirm-item.tsx` `HabitChoice`, `ForgetHabit`; `needs-you.tsx`: the choice on the line's card, and "Your sketch habits" with Forget it.
- `src/app/app/survey/actions.ts`: `saveSketchHabitAction` (a code the card offers only; unconfirmed lines drawn that way take it, each still to be confirmed), `forgetSketchHabitAction` (leaves an empty list).
- `src/core/survey/autosurvey/defaults.ts`: carried from the newest plan that says anything about habits; `new/page.tsx` and `autosurvey-start.tsx` say so on the start screen.
- `real-job.test.ts`: a job's `sketchHabits` can be set in its job.json.

## Review

A fresh review of the stage found five real faults, all fixed with their tests:

- Saving a habit overwrote a code the surveyor had typed on a line not yet confirmed. Now only an empty code, or the replaced habit's, is changed.
- A habit carried onto a plan with another code list did nothing, yet hid the card's choices and was listed as working. `habitEntry` now resolves a habit in the plan's own list (the line, never a mark with the same code, and only of the style's kind); one that resolves to nothing counts as none everywhere.
- The start screen described carried habits from the common list. It now uses the list the plan starts with, and leaves out the ones that list can't answer.
- A forgotten habit came back when the plan it was said on was saved later (recent plans are ordered by their last save). Decisions now carry their time, and the newest one wins, an empty list included.
- A plan saved from the browser could set any habit. The generic save now keeps the stored ones.
- Smaller: the buttons fit a phone (the code's name on the button, the sentence as its accessible name), "a masonry wall" with its article, Forget it names its habit for screen readers, one `STYLE_WORDS`.

## Verified

- `habits.test.ts`, `sketch-habits.test.ts`, `defaults.test.ts` (17 tests). Covered: the habit answers the question and draws the code. Writing, another style, a code of another kind and a list without the code never take it. The card offers a choice until a habit that works is set. Save takes only offered codes, never a typed code, moves lines from a replaced habit, and keeps them waiting. The generic save can't set a habit. Forget leaves an empty list. Carrying takes the newest decision by its time.
- Whole suite: 5,707 tests. `tsc` and `eslint` are clean.
- The real job (local files): with "a double line is masonry wall (MW)", the question on line 22 to 21 is gone; the list stays at 21, since the stored read doubts 32 of its 33 numbers and no line's course is settled.

## Next

- A clearer, full-resolution photo of the sketch on the next job, so lines settle and go together.
