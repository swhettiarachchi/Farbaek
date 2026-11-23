# Stage 224: AutoSurvey, part 2: only real problems need you

- **Date:** 2026-11-23
- **Branch:** `feat/stage-224-exceptions`, from `feat/stage-223-sketch-reading` (PR #287, which carries #286), so it lands after them
- **Decision:** ADR 0235
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (rule 9: everything is a draft until a professional approves it; QC findings carry a code, severity, evidence, next action and blocking flag), `farbaek-ui` and `farbaek-human-made` (StatusBadge kinds, one action per control, no dead ends).

## What the owner asked

"continue building", after asking whether the AutoSurvey brief was complete. §17 of the brief, exception-only interaction, was the next part (the brief calls it the most important frontend/backend integration requirement) and needs nothing from the owner.

## What was there

- **Every item the automatic draft made held approval until ticked "Looks right" one by one:** each lot, each line joined from the codes, the road and the survey date. That is 12 to 32 ticks on a typical job.
- **The Plan step's checklist** sent the surveyor to other steps to tick them.
- **The header** always said "Draft".

## What was built

- **`src/core/survey/exceptions.ts`:**
  - `autoDoubt`, why a drawn item can't simply be confirmed by approval: a lot that turns inward (sharing `inwardCorners` with the draft), or a road whose edges vary in width by more than 0.5 m;
  - `drawnWithoutDoubt`, what approval confirms;
  - `exceptionsFor`, the checks as Must fix, For you to confirm and For information, one entry per item to confirm;
  - `planStatus`.
- **`checkSurvey`:** `AUTO_ITEMS_UNREVIEWED` only for doubtful items, naming each doubt.
- **`confirmSurveyItemAction`:** Confirm and "Check it again" with one press, saved as a version. It accepts only an item drawn or filled in for the surveyor that the plan still has, or the code list, on the version on screen.
- **The Plan step's "Needs you" card** (`needs-you.tsx`, replacing `review-checklist.tsx`):
  - each entry says what happened, what it holds back, the evidence and the next step, with Confirm, Keep as surveyed, or a link to the step that fixes it;
  - what approval confirms is named;
  - notes and confirmed items are folded away;
  - "Ready for your review" when nothing is left.
  - On a phone it folds to one line, as the checklist did (stage 196).
- **The header:** Not drawn yet, Needs correction, Needs your confirmation, Ready for your review, Approved, or Approved and exported.
- **The approval box** names what it confirms: "including what Farbaek drew from my field data: …".
- **The Lots step's lines banner** no longer asks for a tick.

## What a fresh review found, and what changed

A fresh agent reviewed the risky files after every check passed:

1. **Confirm or Keep on the Plan step threw away unsaved edits** (high). The editor on the same page restarts from the stored plan after a save. Both now wait while the editor holds unsaved changes, saying why (`unsaved-plan.ts`).
2. **Leftovers of the old rule:** the drafting assistant counted every drawn item as "Waiting for your check", and the editors showed the blue "check" badge with "Looks right" on confident drawn items. Now the assistant counts only what waits for a confirmation, and confident drawn items are labelled "Drawn from the field data" (information) without a button.
3. **Duplicate list keys** when one code had two findings on one item. Ids now include the finding's number.
4. **"Approved and exported"** counted any export, including a points list or a draft sheet made before approval. Now only a PDF or DXF made after approval counts.
5. **Wording and kinds:**
   - the count no longer says "before approval" for things that only hold export;
   - "Needs correction" uses the blocked kind, as in the list;
   - the confirmed fold lists only items that would come back as entries (not lines, confident drawn items or the assistant's changes).
6. **Gaps in what counts as a doubt, closed:**
   - a mark 1 cm off a straight leg was named as an inward corner (now a 5 cm tolerance);
   - a stray mark outside the land made a clean but larger lot with no doubt (now the stated extent differing doubts the plan's only drawn lot);
   - a line joining two walls under one code raised none (now a long jump does).
   - Left as it was: any contributor can confirm, as they could tick before.

## Verified

- **Tests:**
  - 11 on exceptions:
    - no doubts on a rectangle, its line, a steady road or the stated date;
    - an L-shaped lot names its inward corner;
    - a road widening by a metre is doubted;
    - confirmed or typed items aren't doubted;
    - one entry per item to confirm, the code list's Confirm, groups and steps;
    - the status;
    - after the review: no corner for a 1 cm set-back, the stated-extent doubt (and not with other lots), a line jump, and unique ids.
  - The automatic draft's two approval tests are rewritten: a clean job holds nothing, and an L-shaped one holds approval until its lot is confirmed.
  - 3 on Confirm, run as the server runs it with the database standing in:
    - confirm and undo saved as versions with the item's name in the note, and nothing else changes;
    - the code list without a mark;
    - refusals for an item not waiting, not on the plan, not drawn for the surveyor, malformed, or on a stale version.
  - `pnpm test` after the review fixes: 4,416 pass, 17 skipped. `pnpm typecheck`, `pnpm lint` and `pnpm build`: pass.
- **In a browser,** on the demo at phone width and 1280 px, light and dark:
  - the Sample's Plan step shows "Needs your confirmation" in the header and the card (folded to one line on a phone);
  - the code list and the surveyor are shown as things to confirm, with the read-only reason said once;
  - with drawn and AI-filled marks put on the Sample locally (then removed): the AI-filled title field as its own entry with Confirm, and the drawn lots and road named as what approval confirms;
  - no sideways scroll, no console errors.

## Not checked, and why

- **The approval box's new wording wasn't seen in a browser:** the Sample can't be approved, and the demo can't save. Its text is covered by the type check only.
- **Confirm wasn't pressed against a real database:** the first real run is after the merge.
- **A line crossing the lot raises no doubt yet.** It can be added to `autoDoubt` with tests.
- **The wait on unsaved edits wasn't seen in a browser:** the Sample's editor is read-only and the demo can't save.

## Next

The remaining parts in `docs/stages/stage-222.md`:
- 3, profile defaults and an office code library (needs a migration);
- 4, originals stored;
- 6, background jobs;
- 7, raw observations reduced (needs the surveyor's job file to test against);
- 8, labels;
- 9, the three modes.
