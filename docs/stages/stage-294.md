# Stage 294: the plan fills itself in

The owner asked, after the real job ran end to end on production (stage 293), for the plan to generate "fully auto", simple, with every automation decision checked. The live plan (project 7f6c336f) asked for 44 things, showed "Surveyor not chosen yet" and had a blank title. Decision: ADR 0301.

## What was done

- `src/server/survey/defaults.ts` `hasSurveyorDetails`, `src/app/app/survey/actions.ts`: Generate Plan names the person generating as the plan's surveyor when they have surveyor details (the cause: the automatic draft named them only when it drew from codes, and this job has none).
- `src/core/survey/exceptions.ts` `quietSketchItems`, `QUIET_GROUP_MIN`, `together`, `lotLabel`; `confirmSketchItemsAction` and `labelLotAction` in `actions.ts`; `ConfirmTogether` and `LotLabel` in `src/components/survey/confirm-item.tsx`; `src/components/survey/needs-you.tsx`: the sketch's quiet lines and symbols on one card with one press, and the one unlabelled lot labelled on its card.
- `readTitleIntoPlanAction` in `src/app/app/survey/ai-actions.ts`; `src/components/survey/autosurvey-start.tsx` and `start-uploads.ts`: a photo marked "Deed or old plan" on the start screen is read into the title after the plan is drawn and the sketch read, each fact waiting for confirmation.
- The start screen's drawing keeps every point clear of the north arrow (`preview-layout.ts`).

## Verified

- `vitest`: new `src/core/survey/sketchintel/together.test.ts` (the rule on the synthetic sketch, grouping, the lot label card), `src/app/app/survey/confirm-together.test.ts` (the server re-checks the rule; lot labels), `src/app/app/survey/read-title.test.ts` (consent, everything read kept unconfirmed, nothing saved when nothing read), a case in `generate.test.ts` (the surveyor named) and `start-uploads.test.ts` (the deed mark kept and restored). All synthetic.
- `tsc --noEmit` and `eslint` on every changed file; `tests/design`, `src/components/survey`, `src/core/survey`, `src/app/app/survey`: 1,337 passed; the owner's real-job checks (env-gated, local files) passed.
- A fresh review found 8 faults, all fixed but the last: the first rule grouped lines that carry doubt (a line the reader wasn't sure of, a number matched by dropping a zero, a point off the line, open questions of other kinds), now `settled` plus no open question of any kind; grouped symbols couldn't be removed, now left out; the group's fold misfired inside the phone fold (named group); duplicate label ids from the twice-drawn list (`useId`); the label check differed from the plan's (now whole names, raised part included); every photo's badge followed one outcome (now the sketch's and the deed's apart); the photo choice used radios without arrow keys and was 36 px (now pressed buttons, 40 px). Left: a coded job's summary no longer lists the surveyor block, since the plan names the surveyor before the draft.
- In the browser (demo): the Sketch / Deed or old plan choice on each photo, one row at 375 px, no sideways scroll.

## Not verified here

- The new cards on a real plan and a real deed read: checked on production after the merge (see below).
