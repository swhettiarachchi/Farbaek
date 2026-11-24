# ADR 0257: A misread number is corrected in one press, and what it drew is redrawn

- **Status:** accepted (stage 249, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0255 (a number written where another point belongs is asked about);
  - ADR 0254 (crossing lines asked about);
  - ADR 0249 (the Sketch Intelligence Engine);
  - ADR 0235 (only real problems need the surveyor).
- **Changes:**
  - the sketch record keeps the surveyor's corrections (`corrections`, up to 50);
  - the engine reads the drawing and readings with them applied (`sketchintel/correct.ts`);
  - a question about a misplaced number can carry a suggested correction;
  - the plan's checks of the readings (`checkSketch`) read them with the corrections too;
  - one new server action, `correctSketchNumberAction`;
  - the lot's card in "Needs you" shows the sketch's evidence as a list and the correction as a button;
  - the sketch report lists the corrections as the surveyor's.

  No migration (the record is part of the plan's JSON), no new dependency.

## Context

Stage 247 found the misread number on the owner's real job: the reader read the upside-down 20 as 10, and 10 is another surveyed point on the house wall, so the lot came out at 112.26 m² through the wrong corner. Farbaek now asks "the number read as 10 is written where point 20 would be: it may be 20". But answering meant editing the lot by hand on the Lots step: finding the corner, swapping the point, and doing the same for every line through it. The owner's brief asks for a complete plan in a few clicks, with the surveyor correcting what the engine can't settle, simply.

## Decision

**A correction is a fact the surveyor states about the photo: "the number read as 10 on this photo is 20".**

- **It's kept beside the reading,** with who made it and when. The reading stays as the reader gave it, so the evidence is never rewritten, and the report shows both.
- **It's about one point reading,** named by its id: the number corrected is that reading's own, as read. It's never one an earlier correction produced, so two numbers swapped on a photo are corrected by correcting each, and a second press never undoes the first.
- **It applies to that number on its own photo only,** wherever the photo's drawing and readings use it, matched as the engine matches numbers: "10.", "010" and "10" alike. Letter case is kept, since A1 and a1 can be two surveyed points. The same number on another photo is another reading.
- **One correction per number on a photo:** a new one replaces the old, and going back to the number as read leaves none.
- **It can only name a surveyed point:** exactly one point with that number in the survey files. It never invents a point or chooses between two with the same number. Going back to the number as read is always allowed.
- **Everything reads with it:** the engine, the plan's checks of distances and bearings, the sketch panel (which says a reading was checked with a number the surveyor corrected) and the sketch report. An answer kept as surveyed stays with its reading.
- **A browser save keeps them,** as it keeps the readings: only the server writes the sketch record. A new read of the photos starts without them, since its numbers are read afresh.

**What the misread number drew is redrawn, and nothing else.** The engine interprets the sketch before and after the correction:

- an item the sketch drew before and doesn't propose after is taken off, if it's still waiting for the surveyor (put there by the sketch, never confirmed or edited);
- what the corrected sketch proposes and the uncorrected one didn't is put on, each waiting for the surveyor's press. **What both propose is never put back:** an item the surveyor took off stays off;
- a sketch lot taken off is replaced by the corrected one, even beside a lot drawn by hand;
- **an item the surveyor confirmed or edited is never changed.** If the correction would change it, the result says so and points to the Lots step, and the version's note names it too.

The result is saved as a new version whose note says what was corrected, so Undo is the version history, as for every other change. The result is said above the "Needs you" list, since the card that held the button goes with the redraw.

**The engine offers the correction only when it's plain:** the placement check (ADR 0255) finds a number written where another point would be, that point's own number isn't written on the photo, exactly one surveyed point has that number, and the reading is known. The question then says so, and the lot's card shows "It's 20: use 20 for the 10 read". Otherwise it's asked about with nothing offered, since it isn't plainly a misread, or the press could only be refused.

**The lot's card reads as a surveyor would read it:** what the sketch shows, one fact a line, then the open questions set apart, then the one-press correction.

## Consequences

- **On the owner's real job** (the production reader's third read, run locally on its lines): the lot drew through 10 at 112.26 m² with one crossing question. With 10 corrected to 20, it draws through 20 at 125.84 m² and the crossing question goes. The rest of the difference from the surveyor's 132.70 m² is the "14 on the west wall" read, which stays a question: 14's own number is written elsewhere, so no correction is offered.
- **The correction is the surveyor's statement, not the engine's.** The engine suggests; nothing changes until they press, and the press is recorded.
- **Corrections are per photo and per number.** A number misread twice on one photo, as two different points, can't be told apart by its label; the surveyor corrects that line on the Lots step.
- **Open questions are blue,** the colour for "your turn", with a question mark. Burnt orange stays for real warnings.

## Not done

- **Corrections of other readings** (a distance, a name, a line's style): the reading's own number is checked against the coordinates instead, and a name is shown as read.
- **Learning from corrections:** each one is a labelled example of how the reader misreads (an upside-down 20 read as 10). Keeping them as suggestions for the reader's prompt, apart until approved, is later work.
- **Carrying corrections to a new read** of the same photos: the new read's numbers may differ, so they start fresh.
