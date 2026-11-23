# Stage 223: AutoSurvey, part 5: reading field sketches with Claude

- **Date:** 2026-11-23
- **Branch:** `feat/stage-223-sketch-reading`, from `feat/stage-222-autosurvey-start` (PR #286), so it lands after it
- **Decision:** ADR 0234
- **Migration:** none (the readings are a field on the drawing document). **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (AI never calculates, sketches are evidence and never coordinates, never invent survey facts, label synthetic data), `claude-api` (structured output on the existing Claude client), `farbaek-ui` and `farbaek-human-made` (the start screen and the Draft step card).

## What the owner asked

After part 1 marked sketches "Not read yet", the owner asked why the research named Gemini, then: "now use claulde or openai". Claude was chosen: it already reads old plans in Survey Studio, with the same metering, own-key and free-while-tested rules, and needs no new key.

## What was built

- **Reading** (`src/server/ai/sketch-reader.ts`): Claude gets the photos and their file names, nothing else, and answers in a fixed schema: each point number, distance, bearing, feature, adjoining land, road or note, exactly as written, with the point numbers at its line's ends or the point it's near. It is told never to convert, compute, round, complete or correct, and to list writing it can't read for certain separately.
- **Keeping** (`acceptSketch` in `src/core/survey/autosurvey/sketch.ts`): readings on a photo that wasn't sent, of no kind, empty, or with invisible characters are dropped; nothing is reworded.
- **Checking** (same file), at display time, by tested code:
  - distances at the precision written, in metres or feet, allowing the grid-to-ground difference from the projection's point scale factor and the land's height (SLD99, Kandawala and UTM 44N now carry their transverse Mercator constants);
  - bearings at the precision written, as the forward or back bearing;
  - point numbers against the survey files;
  - nothing compared until the coordinate system is confirmed.
- **The plan's checks:** a summary (information), a measurement that differs (professional review, holding approval until the surveyor keeps it as surveyed or corrects the survey), a point number not in the data (warning).
- **Saving:** the readings are the drawing document's `sketch` field, saved as a new version; left out of the approval fingerprint while empty, so earlier approvals stand. New readings replace earlier ones and their answers.
- **Metering** (`src/server/survey/sketches.ts`): `survey_read`, free while tested, reserved first and given back on any failure, counts-only audit event.
- **At the start** (`autosurvey-start.tsx`): a photo is shrunk as it's added, so one this device can't open is marked at once. With sketches present and Claude available, an unticked box says the photos go to Anthropic, outside Sri Lanka, and aren't kept. Generate Plan draws the plan, then reads the ticked sketches onto the version it drew, showing each stage. If reading fails, the plan is still saved: the screen says so, keeps Generate off so no second project is made, and links to the plan.
- **On the Draft step** (`sketch-panel.tsx`): what was read, each reading as written with how it compares, what couldn't be read, and a way to read sketches (again), with the same consent.
- `generateSurveyPlanAction` now returns where the plan opens and its version instead of redirecting, so the screen can read the sketches next. `shrink` moved to `src/components/survey/photo.ts`, shared with "Read an old plan".

## What a fresh review found, and what changed

A fresh agent reviewed the risky files after every check had passed. It found six faults, now fixed with tests, and made one judgement call:

1. **"Keep as surveyed" never stuck for a sketch difference** (high). The cleanup run on every save checked the plan without the project's confirmation of its coordinate system, so the sketch findings vanished there and every `sketch:` answer was dropped: approval would have stayed blocked for good. The cleanup now uses the project's real confirmation (`sketch-answers.test.ts`).
2. **A finished read was counted, then lost** if the plan was saved during it. The readings now go onto the newest version once.
3. **A plan saved from the browser could remove or make up readings.** Saves now keep the stored readings.
4. **A line from a point to itself always "differed"** and held approval. It isn't checked now.
5. **Wording:** "1 agree" is "1 agrees"; a sketch that won't be read no longer says Claude will read it; "nothing could be read for certain" is now said before the plan opens.
6. **File names with hidden characters** (a right-to-left override) were shown and sent. They become "Sketch n".
7. **Tolerance (the judgement call):** comparing only at the written precision would hold approval for a 10 m line taped as 10.00 against 10.006 m of coordinates. The ordinary measuring difference is now "close", shown with its size, and only more than that holds approval (ADR 0234).

## Verified

- **Tests:**
  - 15 on the sketch core, including the measuring tolerance, a line from a point to itself and hidden characters in file names: keeping readings as written, the schema and approval fingerprint, distances in metres and feet, agreeing and differing at written precision, grid and ground at 100 km from the central meridian and 1,800 m up, bearings forward and back, what can't be tied to two points, and the findings with and without "keep as surveyed" or a confirmed system.
  - 5 on the metered run with a labelled fake reader: counts-only audit, usage given back on a failed or thrown call, photo count and size limits before anything is reserved, viewers refused, and what the model is told and sent.
  - Generate Plan: 5, including opening on the Draft step on version 1 when nothing could be drawn.
  - 3 on answers about sketches as the server saves them: keeping a difference as surveyed survives the save and a later save, and readings sent from the browser are ignored.
  - `pnpm test` after the review fixes: 4,402 pass, 17 skipped. `pnpm typecheck`, `pnpm lint` and `pnpm build`: pass. Every reading and point in the tests is synthetic.
- **In a browser,** on the demo workspace at 382 px:
  - At the start, a points file reads, a sketch is marked "Not read" with the demo's reason, and a photo that isn't an image is marked "Needs a look".
  - With the demo's reason lifted locally for the check (then put back): the consent box, the sketch moving from "Not read" to "Read next" when it's ticked, the count leaving out the broken photo.
  - With synthetic readings put on the Sample locally (then removed): the Draft step card's summary, the list with agrees, differs and not compared, and what couldn't be read; on the Check step, the difference holding approval with "Keep as surveyed" and the summary as information.
  - No sideways scroll, no console errors besides the dev server's reload socket.

## Not done in this part, and why

- **No real photo was read by Claude here:** this PC has no key, and the demo can't save. The first real read is the owner's, after the merge, on a sketch photo of their own.
- **Readings carry no place on the photo.** Claude's text positions are approximate, and nothing relies on them.
- **The photos aren't kept** (part 4: originals in storage on Farbaek's own server).
- **Line work and shapes on a sketch aren't read**, and nothing is drawn from a sketch.

## Next

Part 2 (only exceptions to review) is the natural next step: the sketch differences already arrive as exceptions in the plan's checks.
