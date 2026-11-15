# Stage 192: Survey Studio, a plan the surveyor can trust end to end

- **Branch:** `feat/survey-192`, from `feat/survey-autodraft` (PR #252, waiting for the owner's merge).
- **Why:** stage 191 drafts the plan. This stage gives the surveyor what they need to sign it with confidence, from the CAD study's "now" list (`docs/survey/CAD_PRODUCT_STUDY.md`) and stage 191's known gaps. The owner asked for development to continue until the feature is complete, so this plan was written down and started without a separate approval step.

## Plan

1. **Stated extent against the computed one.** Read a deed's or earlier plan's stated extent as the surveyor or the photo wrote it ("0 A. 2 R. 04.60 P.", "0.21398 Hectares", "34.5 perches", "2,267 m²"). Compare it with the entire land the engine computed. Report the difference in the plan's own units, for the surveyor (a warning, never a change). Text that can't be read is said to be unreadable, never guessed.
2. **Near misses, and "keep as surveyed".** Report a corner a few centimetres off a neighbouring lot's leg, naming the mark and the distance. Two corner numbers within 1 cm already hold approval. The surveyor can answer either finding with "Keep as surveyed". The answer is stored in the drawing version, so it's covered by the approval hash and shows in History. No point ever moves.
3. **Lot schedule as CSV.** Each lot's area in m², hectares and A-R-P, with the entire land and a total row, from the same engine as the sheet. Recorded with its SHA-256 like every export.
4. **Plot stamp.** One line in the sheet's bottom margin: the drawing version, approved or draft, and the engine version. A paper copy found years later can then be traced to its exact record.
5. **Inverse between any two points.** On the Points step, pick two point numbers and get the bearing and distance between them, from the tested engine. It's a reviewer's check, the COGO inverse that every CAD survey tool has.
6. **Richer field codes.** A point can carry two codes ("CP MW": a post that also ends a wall), and a note after a slash ("St / found") stays a note. Both are suggested lines, never applied silently.

Each milestone gets tests with hand-worked answers, a look in the browser, and a commit. Then come a fresh review, the docs and the PR.

## Done

(Filled in as the work lands.)
