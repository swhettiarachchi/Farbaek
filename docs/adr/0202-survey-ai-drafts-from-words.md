# ADR 0202: Survey Studio's AI drafts from the surveyor's words; the engine computes

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 191
- **Builds on:**
  - ADR 0009 (model output is untrusted and only prefills forms);
  - ADR 0198 (Survey Studio as a module), ADR 0203 (several lots and the classic sheet);
  - ADR 0044 and ADR 0131 (metered Claude calls with typed output).

## Context

The owner asked for Survey Studio to produce a complete professional plan automatically, with the surveyor only reviewing, adjusting and approving. A plan is a legal document about real land: a plausible wrong number moves a boundary, and the Survey Act makes it misconduct to record as observed what wasn't. The survey skill's first rule is that tested code calculates and AI never does.

The CAD products studied ([CAD_PRODUCT_STUDY.md](../survey/CAD_PRODUCT_STUDY.md)) show the same line from the other side: every documented AutoCAD AI feature stops at a suggestion a person accepts, and its own transparency notes say it isn't for safety-critical use. Neither vendor documents an AI that drafts a plan.

## Decision

**"The AI drafts the plan" means it reads words into structure.** Two actions on a new Draft step:
- **Draft the plan** (`survey_draft`): the surveyor's own description is read into lots (corner point numbers in order), roads (edge point numbers), adjoining lands (a lot and the two points of its leg), title fields and notes, with questions for whatever the description doesn't say.
- **Read an old plan** (`survey_read`): one to three photos of an earlier plan or deed are read into title fields only.

The tested engine then computes and draws everything: areas, extents, widths, the sheet, the schedule, the checks.

**The model can't carry a number.** The output schema ([`ai-draft.ts`](../../src/core/survey/ai-draft.ts)) has no field for an area, distance, bearing, extent, width or scale; a test proves its JSON Schema has no numeric type. A deed's stated extent is text in its own field, never the computed one.

**Every item is checked before anyone sees it** (`acceptDraft`, pure and tested):
- From a description, every item carries an evidence quote, and is kept only if the quote is in the description (case, punctuation and spacing folded), the value's words are in its quote, and every point number and lot label it uses is written there as a word of its own.
- Point numbers must exist in the project; a lot must close into a simple ring with no repeated corner; an adjoining land must sit on a real leg of a drafted lot.
- From a photo, lots, roads and adjoining lands are refused (an old plan's point numbers aren't this survey's), and so are the new plan's own number and dates.
- What's left out is listed with the reason.

**The surveyor decides.** Every kept item is marked in the document's provenance (`ai_brief` or `ai_photo`, not reviewed). The draft opens in "Check the draft": each item can be marked right or taken out, beside the composed sheet. Nothing is saved until the surveyor saves it as a new version, which validates it again. `AI_ITEMS_UNREVIEWED` blocks approval until every item is marked right or changed; changing a field counts as checking it.

**Only what's needed leaves the server.** The description, the points it names (not their coordinates), the codes and the lot labels go to the model; photos are shrunk in the browser, sent, and not stored. One audit event per run records the operation, the model and counts, nothing the person wrote.

**Metered like every AI action.** Claude only, through the workspace's model source; usage reserved before the call, settled after, refunded on failure. Schema v94 adds the two operations to the ledger and `app_survey_record_ai_draft`. When AI isn't available the buttons say why, and the Lots and Plan steps do everything by hand.

## Consequences

- A vague description gives a short draft and questions, not guesses. That's intended.
- The evidence check rejects paraphrase: a model that rewrites "lot B one" as B1 without the words in the quote loses the item. Prompts ask for exact quotes, and the surveyor can always type it.
- Reading photos depends on their quality; items read from a photo say so until checked.
- The engine's areas never depend on the model, so the approval hash and every figure stay reproducible.
