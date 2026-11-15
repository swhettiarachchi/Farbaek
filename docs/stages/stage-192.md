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

7. **Dividing a lot into shares** (added while building, ADR 0206): the dividing lines for stated or equal shares, square or parallel to a chosen leg, with the area balance, the setting-out distances for each new corner and, when asked, the UDA minimums. It's a proposal to peg in the field: it never changes the plan.

Each milestone gets tests with hand-worked answers, a look in the browser, and a commit. Then come a fresh review, the docs and the PR.

## Done

- **Stated extent** ([`extent.ts`](../../src/core/survey/extent.ts)): read strictly in acres, roods and perches (numbers first or letters first, with fractions and "and"), hectares, acres, perches or m², and set beside the computed land: agrees within 1%, differs (in the stated units), or unread. Anything ambiguous is unread.
- **Near misses, kept as surveyed** (ADR 0205): corners of different lots within 5 cm, and corners within 5 cm of another lot's leg, hold approval until fixed or kept. The answer is saved in the version and trimmed on every save.
- **Lot schedule CSV**, **plot stamp** under the frame, **inverse** between any two points, **two codes on a point** and notes after a slash.
- **Dividing a lot into shares** (ADR 0206): stated or equal shares, square or parallel to a leg, with the area balance, setting-out distances and the UDA minimums when asked.
- **Photos:** large phone photos decode at a smaller size.

## Reviews

A fresh reviewer found 8 problems in the first commits, all confirmed by running the code, and all fixed with tests:
- deed wordings with the letters first, fractions or "and" were misread, sometimes as agreement;
- adding the `kept` field would have made every earlier approval lapse;
- near misses were capped at 20, so some could go unseen after keeping the rest;
- corners 1 to 5 cm from a neighbour's corner went unreported;
- END and CLO attached to description words, and single description letters became codes;
- the stated extent wasn't compared for separate pieces of land;
- `kept` could grow past its limit and make a version unreadable;
- the plot stamp sat where many printers can't print.

## Verified

- Survey, design and fake-model tests: 311 pass; typecheck and lint pass.
- In the browser on the demo build: the inverse (1 to 2 gives the schedule's 088°13′03″ and 48.22 m), the lot schedule download, the plot stamp on the sheet, the Check step, and dividing lot B¹ into three equal shares (lines at 178°13′03″, P1 to P4 with their setting-out distances).

## Not done here

- **The first real drafting call on production.** Stage 191 is live. Creating a project in the owner's workspace was refused by this session's permission check, as it should be. The owner makes the check by hand (steps in the final report).
