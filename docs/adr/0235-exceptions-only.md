# ADR 0235: Only real problems need the surveyor; approval confirms the rest

- **Status:** accepted (stage 224, AutoSurvey part 2, 2026-11-23)
- **Builds on:** ADR 0209 (the automatic draft), ADR 0233 (AutoSurvey's start), ADR 0234 (sketch readings), the owner's AutoSurvey brief §17
- **Changes:** what holds a plan's approval back. Approval itself, its fingerprint and every other check are unchanged.

## Context

The brief's §17 calls exception-only review "the most important frontend/backend integration requirement". The surveyor shouldn't inspect every automatically processed item, only meaningful exceptions, each saying what happened, why it matters, the item, the evidence and the next step, with simple actions.

Before this, every item the automatic draft made held approval until it was ticked "Looks right" one by one: each lot, each line joined from the field codes, the road and the survey date. A typical job draws one lot, a road and 10 to 30 lines, so 12 to 32 ticks came before approval. The surveyor's approval already covers the whole sheet (it fingerprints the document), so the ticks repeated it item by item.

## Decision

**What the automatic draft made is confirmed by approving the plan, unless tested code doubts an item.** Doubts are worked out from the current points every time the plan is shown (`autoDoubt` in `src/core/survey/exceptions.ts`), so they never go stale:

- **A lot that turns inward** at one or more corners, by the same rule the draft uses (`inwardCorners`). Each such corner is a corner of the land or a mark inside it, which only the surveyor can say. A mark set back less than 5 cm from its neighbours' line (`INWARD_TOLERANCE_M`) is a mark on a straight leg, not a corner.
- **The plan's only lot, drawn, when the stated extent differs from it.** A mark outside the land may have been taken as a corner, which makes a larger outline that still looks clean.
- **A road whose two surveyed edges vary in width by more than 0.5 m** (`ROAD_WIDTH_DOUBT_M`), or no longer run alongside each other. An edge point may be coded to the wrong side.
- **A line joined from the codes with one leg over three times its middle leg and over 10 m** (`LINE_JUMP`, on lines of four points or more). Two lines under one code may have been joined across the land.
- **Other lines, and a survey date the file states, carry no doubt of their own.** The codes are the crew's, and the lines are on the sheet the surveyor approves. A line that is wrong is removed on the Lots step.

Only a doubtful item holds approval (`AUTO_ITEMS_UNREVIEWED`, now naming each doubt). The rest are named in the approval box: "including what Farbaek drew from my field data: Lot 1, the road and 14 lines joined from the field codes".

**What the AI filled in still waits for a confirmation of its own**, item by item. It is an interpretation of the surveyor's words or a photo.

**One "Needs you" list on the Plan step**, replacing the old checklist. Built by `exceptionsFor` from the checks:

- **Must fix:** anything that holds export or the plan, or any error.
- **For you to confirm:** anything else that holds approval. The two "items to check" findings are opened up into one entry per item.
- **For information:** warnings and notes, folded away.

Each entry says what happened, what it holds back, the evidence and the next step, with its answer:

- **Confirm** (one press, saved as a version) for a drawn or filled-in item, or the code list;
- **Keep as surveyed** for a near miss or a sketch difference;
- **a link to the step that fixes it.**

Confirmed or corrected items are listed, folded, each with "Check it again", so a confirmation can be undone. When nothing is left, it says "Ready for your review" and links to approval.

**Confirm on the server** (`confirmSurveyItemAction`) accepts only an item the plan has that was drawn or filled in for the surveyor, or the code list, on the version on screen. Nothing the surveyor typed, and nothing else in the plan, can change through it.

**A one-press answer never throws away unsaved edits.** Confirm and Keep as surveyed save a new version from the stored plan, and the plan editor on the same page then starts again from it. While the editor holds unsaved changes, both wait, saying why ("Save your changes to the plan first").

**Any contributor can confirm, as before.** Ticking "Looks right" was already open to every contributor. The approval stays the named surveyor's, and their approval box names what it covers.

**The plan's header says where it stands:** Not drawn yet, Needs correction, Needs your confirmation, Ready for your review, Approved, or Approved and exported (`planStatus`).

## What it doesn't change

- The surveyor still approves the whole plan, and approval still records their review, not a certification (rule 9 of the Survey Studio skill).
- The approval fingerprint, every other check, and the Check step's full list of findings.
- No migration and no new dependency. Earlier plans' marks stay as they are; their confident drawn items simply stop holding approval.

## Consequences

- A clean job (a lot observed in order, a road of steady width) goes from Generate Plan to "Ready for your review" with nothing to tick beyond the surveyor, the code list and the coordinate system the plan already asks for.
- A wrong line that no check catches is caught only by the surveyor's look at the sheet, as before the ticks; the approval box now names what it covers, so that look is asked for in words.
- Further doubts (a line crossing the lot) can be added to `autoDoubt` with their tests, without changing the screens.
- "Approved and exported" counts only a PDF or DXF of the approved version made after its approval, not a points list or a draft sheet.
