# ADR 0304: The surveyor's sketch habits

- **Status:** accepted (stage 298, 2026-11-28)
- **Builds on:** ADR 0249 (lines read from the sketch, and the question "What is the line …?"), ADR 0237 (a returning surveyor's defaults carried from their recent plans), ADR 0301 and ADR 0302 (confirming the sketch's quiet lines together).
- **Changes:** what a line drawn double, or with x marks, with nothing written along it, is taken for. No migration: the habit lives in the plan's document and is carried to the next.

## Context

On the owner's real job, every line the sketch draws double with nothing written along it asks "What is the line 22 and 21? It's drawn as a double line, as walls are", and every line drawn with x marks asks the same as a fence. A surveyor draws the same way on every job, so the same question comes back every time. The owner asked for the system to learn.

## Decision

- **A habit is the surveyor's own word, said in one press** on such a line's card ("On my sketches, a double line is a masonry wall (MW)"). The card offers the plan's codes of the kind the style is drawn for (walls for a double line, fences for x marks), the ones written on this sketch first, at most three. Never set by Farbaek or a model, and never inferred from what the surveyor confirmed before. The server takes a habit only from that press (`saveSketchHabitAction`, a code of the right kind in the plan's list); a plan saved from the browser keeps the stored habits, as it keeps the sketch's readings.
- **What it does:** a line drawn that way with nothing written along it is read as that code, and the "What is the line" question isn't asked. Writing along a line always wins. Lines already on the plan from the sketch, drawn that way, not yet confirmed and with no code (or the code of the habit being replaced), take the code at once; each still waits for its own confirmation (the habit says what it is, not that the sketch drew it right). A code the surveyor typed, a confirmed line and a hand-drawn line are never changed.
- **It names a line in this plan's list, or nothing:** a habit is the list's line or outline of the style's kind with that code (MW the masonry wall, never MW the mark on a wall). One carried onto a plan whose list has no such line (the Survey Department's list, an office's) does nothing there, isn't listed, and the card offers that list's codes instead.
- **It's carried by when it was said:** each save or forget records the time (`sketchHabitsSaidAt`), and a new plan starts from the newest decision among the surveyor's recent plans, whichever plan was saved last, carried on with its time; an empty list (all forgotten) is carried too, so a forgotten habit never comes back. The start screen says the ones the plan's starting list has ("Your sketch habits: a double line is a masonry wall (MW), as you said on …"). Two habits at most: one per style.
- **It speaks as surely as writing** for how sure a line is (`level`), and a line it answers has no question of its own, so it can go on the confirm-together card when its course is settled (ADR 0302).

## Consequences

- The same question stops coming back job after job.
- Measured on the real job's stored read: the habit answers the double line's question, but the list stays at 21: the read doubts 32 of its 33 numbers, so no line's course is settled. A clearer, full-resolution photo of the sketch is what lets lines settle; the habit then lets them go together.
- Learning a habit from past confirmations without the surveyor saying it is not done: a confirmation says one line was right, not that every such line is.
