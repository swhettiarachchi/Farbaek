# Survey Studio drafting assistant

How the Draft step works (stage 191, [ADR 0202](../adr/0202-survey-ai-drafts-from-words.md)). The short version: the AI reads the surveyor's words, or an old plan's photo, into structure; tested code checks every item and computes everything; the surveyor decides.

## The two actions

| | Draft the plan | Read an old plan |
| --- | --- | --- |
| Operation | `survey_draft` | `survey_read` |
| Input | The surveyor's description, 20 to 4,000 characters | One to three photos or scans of an earlier plan or deed |
| Sent to the model | The description; the point numbers it names, with their codes (no coordinates); the code library; the plan's lot labels | The photos, shrunk in the browser to 1,568 px on the long side as JPEG; the list of fields it may fill |
| Can fill | Lots (label, raised part, note, corner point numbers), roads (name, edge point numbers, direction texts), adjoining lands (text, lot, the two points of its leg), title fields, notes, questions | Title fields only: land name, alias, now known as, the earlier plan (number, date, by, filed in), village, pattu, korale, district, province, GN division, bounded as follows, stated extent, parent lots, questions |
| Never | Areas, distances, bearings, widths, extents, scales (the schema has no field for them) | The same, plus lots, roads, adjoining lands, and the new plan's own number and dates |

Code: [`ai-draft.ts`](../../src/core/survey/ai-draft.ts) (schema and checks), [`survey-drafter.ts`](../../src/server/ai/survey-drafter.ts) (prompts and the Claude call), [`drafting.ts`](../../src/server/survey/drafting.ts) (metering), [`ai-actions.ts`](../../src/app/app/survey/ai-actions.ts) (server actions), [`draft-panel.tsx`](../../src/components/survey/draft-panel.tsx) (the screen).

## What is checked, item by item

`acceptDraft` runs on the server before the draft is shown. It keeps an item only if:

1. **From a description, it quotes the description.** Every item carries an `evidence` quote. The quote must appear in the description as whole words once both are folded (lower case, Unicode-normalised, quotes and punctuation as spaces), so "Plan No. 1234" doesn't match "Plan No. 12345". Each value must be one phrase of its quote, not words gathered from it, and a description (bounded as follows, the stated extent, where the earlier plan was filed, an adjoining land, a note) must be written whole: it has to end where the surveyor's clause ends, so "land of A. Perera" can't stand for "land of A. Perera's heirs". A lot must be named as "lot B1" (or "lot B 1") in its quote, and its corners must be exactly the point numbers written after that, up to the next lot or the end of the sentence, all of them, in that order (starting at any corner); its note must be written there too. A road's points must be exactly its two edges, one after the other. An adjoining land on a leg two lots share must name its lot. Point numbers are matched as written, so "BM-1" is never point 1. The kind of survey stands only if the quote says it, the most specific kind winning ("resurvey and sub division" is a sub division), and "my own plan" only if the quote says "my Plan" and not "not my plan". Point numbers that differ only in case are matched exactly.
2. **Its points exist.** Every point number must be one of the project's imported points.
3. **Its geometry is sound.** A lot needs three or more corners, no repeated corner, and no crossing legs (the same `computeParcel` the rest of the engine uses). A road needs two points along one edge. An adjoining land must lie on a leg whose two points are neighbouring corners of a drafted lot.
4. **It fits.** Each field's length limit, the same as the document's, so a kept draft always saves (the server checks the whole draft against the document schema before it charges for it). Dates must be whole calendar dates (dd.mm.yyyy, dd/mm/yyyy or yyyy-mm-dd, kept as yyyy-mm-dd); anything else is left out and asked about.
5. **From a photo, it belongs to the earlier record.** Lots, roads, adjoining lands and notes are refused, and so are the plan number and survey and partition dates (they belong to the new survey).

Duplicate lot labels keep the first. Drafted items get new ids, never one an earlier lot, road or label used, so nothing left over can attach to them. Drafted lots replace the plan's lots, and adjoining lands on the replaced lots are dropped and listed, not moved. The model's output schema has no length limits (one long quote would otherwise fail the whole draft); limits are applied item by item. Everything left out is listed with the reason.

## The surveyor's review

- Every kept item is marked in the document's `provenance` as `ai_brief` or `ai_photo`, not reviewed.
- **Check the draft** lists the items by kind (lots, roads, adjoining lands, title and boundaries, notes) beside the composed sheet. Each has **Looks right** and **Take out**. The reviewed draft is rebuilt each time from the plan as it was, the checked draft and these choices (`applyReview`): taking out a lot also takes out the adjoining lands on it; taking out every drafted lot (or road) brings the plan's own back; taking out a field puts back what the plan had, with its own mark. Each value has its own mark (the earlier plan's number, date, surveyor and filing separately), so checking one never checks another.
- **Save as version N** saves the draft through the ordinary save action, which validates the document and its points again. Discarding leaves the plan as it was.
- On the Plan step, an AI-filled field shows "From your description, check" or "Read from a photo, check" with **Looks right**; changing the field also counts as checking it. On the Lots step, lots, roads and adjoining lands have the same control.
- `AI_ITEMS_UNREVIEWED` (for the surveyor) blocks approval until every item still on the plan is checked or changed. Marks for removed items don't count and are dropped on save. The History step's compare says how many AI items arrived, were checked, or need checking again.

## Privacy and records

- The description and photos are sent to the AI provider (Claude, by Anthropic) to be read. The Draft step says so before the photos are sent. Farbaek stores neither: only what the surveyor saves becomes part of the plan.
- Each run writes one audit event, `survey.ai_drafted`, with the operation, the model and the counts of items kept, left out and asked about (`app_survey_record_ai_draft`, schema v94).
- Usage is reserved before the call, settled to its real cost after, and refunded when the call fails or is refused, when Farbaek's own checks fail, or when the checked draft wouldn't save ([docs/billing/usage.md](../billing/usage.md)).

## When it's off

The Draft step's buttons say why: the Sample and the demo are read-only, viewers can't change plans, a workspace without AI usage or without Claude can't run them, and drafting needs imported points. Everything the assistant fills can be entered by hand on the Lots and Plan steps.

## Tests

- [`ai-draft.test.ts`](../../src/core/survey/ai-draft.test.ts): quoting and folding, point and label words, dates, the schema with no numeric field, every refusal above, replacement of lots, photo restrictions.
- [`drafting.test.ts`](../../src/server/survey/drafting.test.ts): with a labelled fake model, only named points are sent and no coordinates; metering reserved, settled and refunded; nothing spent on invalid input; images recognised by their bytes.
- [`survey-studio.test.ts`](../../tests/db/survey-studio.test.ts): the ledger accepts both operations and lists exactly the app's operations; the audit function's validation and grants.

Not yet verified: a real call with the production model on a synthetic description and a photo of the Sample PDF (see the stage record).
