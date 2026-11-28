# ADR 0301: The plan fills itself in, and asks only what needs the surveyor

- **Status:** accepted (stage 294, 2026-11-28)
- **Builds on:** ADR 0235 (only what needs the surveyor), ADR 0249 (the Sketch Intelligence Engine), ADR 0234 (sketches read with Claude), the "Read an old plan" reader (ADR 0202), ADR 0300 (the start screen shows the files).
- **Changes:** ADR 0235's rule that every item read from a photo is confirmed one by one, for the sketch's lines and symbols that nothing stands against. No migration, no new dependency, no paid service.

## Context

The owner ran the father's real job end to end on production (stage 293). The plan drew the right lot (132.70 m²), but then asked for 44 things: about 38 lines read from the sketch, each with its own Confirm; the lot's label, only on the Lots step; the code list. The sheet said "Surveyor not chosen yet" though the start screen had said "the plan names you as responsible", and the title sentence was all dotted blanks. The owner asked for the plan to generate "fully auto", simple, with every automation decision checked.

## Decision

- **The surveyor is named from the start.** Generate Plan sets the plan's surveyor to the person generating it when they have surveyor details in the workspace. The automatic draft already did this, but only when it drew something from field codes: a job with no codes drew nothing first, and the plan the sketch drew named no one.
- **The sketch's quiet lines are confirmed together** (`quietSketchItems`, `settledSketchLine`, `confirmSketchItemsAction`). A line Claude read from a sketch is quiet only when its course is settled (every number on it matched a surveyed point exactly, the reader was sure of it, and its points lie on it: `settled` on the line's proposal) and no question is still open, of any kind, about it or about the sketch lines it comes from, nor a number Farbaek corrected on it. Quiet lines go on one card, "N lines read from your sketch, with nothing against them", with what each is and where it runs folded under it, and one **Confirm all N**. The server works the rule out again when the press arrives, so a line that has gained a question since is left on the list, and the answer says so. Lots, roads, symbols (a card removes a wrong one), title facts and anything in doubt keep a card of their own; three or more quiet lines make a group, fewer keep their cards. Lines round a lot with open questions wait for the lot's confirmation. The surveyor still presses, still sees each line on the sheet, and still approves the whole plan.
- **The deed or an old plan is read into the title at the start.** A photo on the start screen can be marked "Deed or old plan" instead of "Sketch". After the plan is drawn and the sketch read, it goes to the same reader as "Read an old plan" (`readTitleIntoPlanAction`), and everything read is kept, as if the surveyor had kept it all on the Draft step: the land's name, place, boundaries and extent, each marked as read from a photo and waiting for its own confirmation. Only what the photo states is taken, never points or measurements, and the photos aren't kept. The same consent box covers sketches and deed photos, and says which are kept.
- **One lot without a label is labelled on its card** (`labelLotAction`): the "A lot has no label" card has the field and Save, so the one thing that stops export is fixed where it's said. A label another lot already has is refused. Two or more unlabelled lots are labelled together on the Lots step.

## What stays the surveyor's, and why

- **The lot's label, the title facts and the boundaries** are legal facts. Farbaek fills them only from what a photo of the deed or an old plan states, and each waits for the surveyor's confirmation. Without such a photo they stay blank: nothing is guessed from a previous plan or the files' names.
- **Anything the checks question** keeps its own card.
- **Approval** remains the surveyor's review of the whole sheet.

## Consequences

- The real job's list goes from about 44 cards to the questioned items, one group card, the lot's label and the code list.
- A plan generated with a deed photo opens with its title sentence filled in, for the surveyor to confirm fact by fact.
