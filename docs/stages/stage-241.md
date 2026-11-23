# Stage 241: AutoSurvey, the sketch's drawing understood (Sketch Intelligence Engine)

- **Date:** 2026-11-23
- **Branch:** `feat/stage-241-sketch-intelligence`, from `main` after PR #303
- **Decision:** ADR 0249
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: positions only from the survey, tolerances as stated defaults, uncertainty asked about, the stated extent kept apart, real client data kept out of tests;
  - `farbaek-ui` and `farbaek-human-made`: evidence and questions in plain sentences on the existing "Needs you" cards.

## What the owner asked

Item 1, intelligent field-sketch understanding, with a real job they supplied as the primary test case.
- Read the sketch's graphics, not only its words: lines, walls, internal lines, point numbers, road edges, buildings, wells, drains, fences and the relationships between them.
- Join them to the survey by point number.
- Choose the most plausible interpretation, with errors, confidence and sources, each proposal confirmed with one action.
- Never invent a coordinate, and keep disagreements.
- Ask where the evidence runs out, for example the road's far edge.
- Compare with the surveyor's plan repeatably, and investigate the areas without forcing a match.
- A product capability, not a fit to one job, in separate parts.

Mid-stage: "Use whichever AI model you think is best." Claude, with the reasoning in ADR 0249.

## What was built

- **The reader** (`src/server/ai/sketch-reader.ts`, `autosurvey/sketch.ts`):
  - the answer gains `lines`, `symbols` and `areas` (`sketchintel/drawing.ts`), with no number field but the photo's index;
  - the prompt says to give numbers as written and never to estimate a length, angle or position;
  - effort high, and at least the standard tier (Claude Sonnet 5.5) on every plan (`server/survey/sketches.ts`).
- **The engine** (`src/core/survey/sketchintel/`), each part separate and tested:
  - `match.ts`: written number to surveyed point (exact, leading zeros, letter case; never ambiguous or guessed);
  - `classify.ts`: codes, then English and Sinhala words, then the drawing style; areas as building, lot or someone's land;
  - `interpret.ts`:
    - corners by offset from the line between neighbours (`cornerIndexes`);
    - the lot as the largest simple outline of boundary lines;
    - strips, the road's side and widths as written;
    - unwritten points on a line said, not added;
    - questions where evidence runs out;
    - levels "strong" or "check" with evidence;
  - `apply.ts`: proposals as unconfirmed `ai_photo` items, never replacing what's on the plan;
  - `findings.ts`: questions recomputed at display. Each goes away when the surveyor confirms or removes its item, or gives the lot a label. The Confirm card carries the evidence and the open question;
  - `evaluate.ts`: comparison with a reference plan by point numbers (lot, lines joined across drawn lines, points passed, missing corners and their offsets, symbols, areas);
  - `fixture.ts`: a SYNTHETIC job (a walled lot with a strip, a well, an inner line, neighbours' walls, two wall points 0.20 m apart turning 11°).
- **On the plan:**
  - an optional `symbols` list in the document (absent until a sketch adds one);
  - symbols drawn at their points on the sheet (`sheet/draw.ts`) and now in the DXF, with loose marks, as the sheet draws them (`export/dxf.ts`);
  - Generate Plan's sketch read applies the proposals and says how many were drawn and asked (`app/app/survey/ai-actions.ts`).
- **The real-job runner** (`sketchintel/real-job.test.ts`): runs only when `FARBAEK_REAL_JOB_DIR` names a folder outside the repository. It runs the chain Generate Plan runs and writes a report and the sheet's pages there.

## Verified

- **`src/core/survey/sketchintel/`:**
  - matching;
  - classification (including Sinhala);
  - written widths;
  - the lot by its corners without choosing by area;
  - corners by offset, with the in-between point asked about and its area as a corner;
  - tolerances taken as given;
  - each line's evidence;
  - questions instead of guesses;
  - the road's side;
  - the well;
  - no invented position (every proposal's points are surveyed ones, and the reader's schema has no number but the photo's index);
  - applying (valid document, provenance, no duplicates, never replacing lots);
  - the plan with the well drawn, evidence and questions;
  - questions answered by confirming, removing or labelling;
  - the well in the DXF;
  - the evaluation (the lot, lines joined and passed, partial lines, extras, symbols, missing corners).
- **The owner's real job, locally** (its files and report stay outside the repository, never committed). The sketch was transcribed in this session in the reader's format, because the production reader needs the owner's consent for the client's photo.

  | | The surveyor's plan | Farbaek |
  | --- | --- | --- |
  | Field codes | none | 0 shapes, as before |
  | Numbers on the sketch | | 27 of 27 matched exactly |
  | Lot | 35, 18, 20, 21, 22, 1, 2 | 35, 18, 20, 21, 22, 1 (2 lies 0.043 m off the side) |
  | Area | 132.53 m² | 132.70 m², by two methods; stated 126.50 m² kept apart |
  | Lines | 8 | 7 drawn in full, the road edge in part, 5 extra (each waiting for a press) |
  | Well at 19 | yes | yes |
  | 17, 0.155 m off the west wall | on the wall | on the wall, asked about, area as a corner 131.54 m² |

  The first run made 8 and 7 corners (0.19 m apart, turning 11°, within 4 cm of the wall); corners by angle were replaced with corners by offset.
- Survey tests, `pnpm typecheck`, lint on the changed files, the full `pnpm test` and `pnpm build`: see the review section for the final run.

## Review

A fresh review agent reproduced 14 faults after every check had passed. All are fixed, each with a test in `review241.test.ts` or `confirm-item.test.ts`:

1. **A lot drawn as one closed outline never became the lot.** The closing leg wasn't in the graph, and a first number written again at the end failed the crossing check. Both now close the line, and an area's corners written round to the start are read the same way.
2. **Two different rings through the same points were taken as one.** With check lines across a square, the lot became a triangle. Rings are now keyed by their order, and a smaller outline inside the lot taken is asked about.
3. **Item ids came from the reader's numbering (l1, s1),** so a second read could skip a new line as "already on the plan", show another item's evidence, or reset a confirmed well. Ids now come from what an item is: its kind and its surveyed points, plus a symbol's code.
4. **Lot letters that are also codes** (B, M, U) were read as someone's land, and "Lot 12" wasn't read. A single letter is now a lot unless it's an outline's code, and "Lot" with a number is read.
5. **"Mw." never matched as a road.** It now has its own pattern.
6. **A number in a road's name was read as its width** ("Lane 5 Mawatha" as 5 m). The unit must now end the word.
7. **A lot corner on the road's edge, 1 cm across it, made the road's side unclear.** Corners within the tolerance now count as on the edge.
8. **A sketch's symbol drew over a point's own surveyed code.** The survey's code now stands, and the sketch is asked about.
9. **An unlabelled post was given the first post code.** With several posts in the code list it now asks which. A symbol named only by its kind is "check", never "strong".
10. **A symbol couldn't be removed anywhere,** so a misread well had to be confirmed before approval. Its Confirm card now has Remove (`removeSurveySymbolAction`), and no longer points to the Lots step.
11. **An empty number in a line was skipped,** joining its neighbours by a leg the sketch never drew. That line is now dropped, and an area's corners with a gap are dropped too.
12. **The evaluation counted a line drawn out of order as found.** The order is now followed, and a point visited out of order isn't passed by.
13. **Ring matching took "1" inside "101".** Point numbers are now matched whole.
14. **The read's message counted questions the checks hide,** and a retry kept the first attempt's note. Both are fixed.

The review's other notes, also acted on:
- **Output limit:** raised to 32,000 tokens. Thinking counts against it, and the read streams.
- **Effort:** "high" is no longer described as the most effort. Anthropic offers xhigh and max, neither measured on sketches.
- **Unknown closed lines** go round to their start, never as a closed building outline.
- **Cuts:** a cut never splits a two-part character.
- **Symbols:** capped at the schema's 200.
- **Road questions** go away once the plan draws the road.
- **Lines joining a point to itself** are asked about.

Final run:
- the full `pnpm test` (below);
- `pnpm typecheck`;
- lint on every changed file;
- `pnpm build`;
- the real job run again, with unchanged results.

## Not done, and why

- **The production reader hasn't read a real sketch.** The real job's sketch goes to Claude only with the owner's consent.
- **A road from one surveyed edge and a written width** isn't drawn: the width is asked for, and no far edge is guessed.
- **A building whose corners aren't numbered** is asked for, not drawn.
- **Presentation:** neighbours' walls carried past the corners, corners on walls without circles, and the lot letter only where the plan wants it are separate stages.
- **The point-list printout and DXF point import** (the real job's other files) are the next stage.
