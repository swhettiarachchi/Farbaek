# ADR 0234: Claude reads field sketches, and tested code checks every reading

- **Status:** accepted (stage 223, AutoSurvey part 5, 2026-11-23)
- **Builds on:** ADR 0233 (AutoSurvey's start), ADR 0202 (Survey Studio's drafting assistant), ADR 0212 (Survey Studio's AI free while tested), the owner's AutoSurvey brief of 2026-11-23
- **Changes:** sketches uploaded at the start, or later on the Draft step, are read. Nothing about how points are stored, drawn or approved, except that a measurement on a sketch which disagrees with the coordinates now waits for the surveyor.

## Context

The brief asks for survey data and field sketches to go in together, with AI interpreting the sketches and deterministic code doing every calculation. Part 1 listed sketches as "Not read yet".

The research for part 1 (`reports/Survey Field to Finish automation.md`) found that none of the survey products reads a sketch, that vision models misread handwriting in ways that look plausible, and that their stated confidence is poorly calibrated. Its advice: the strongest check is the instrument data itself. It named Gemini for its documented text locations, but Gemini needs a paid key this project doesn't have. The owner chose Claude or OpenAI ("now use claulde or openai", 2026-11-23). Claude was chosen: it already reads old plans in Survey Studio, through the same metering, own-key and free-while-tested rules.

## Decision

**Claude writes down what is written, as written, and nothing else.**

- Each reading has a kind (point number, distance, bearing, feature, adjoining land, road, note), its text exactly as written, the point numbers at the ends of its line, or the point it's near, and which photo it's on.
- The model is told never to convert, compute, round, complete or correct, and to put writing it can't read for certain in a separate "couldn't be read" list instead: a wrong number is worse than a missing one.
- The answer is a fixed schema (structured output). Farbaek drops readings on a photo that wasn't sent, of no kind, empty, or carrying invisible characters (which could make two point numbers look alike). Nothing is reworded.
- The photos are user data, never instructions, and only their file names go beside them: no coordinates and no point list.

**Tested code compares, at display time** (`src/core/survey/autosurvey/sketch.ts`):

- A distance is compared at the precision it was written to, in metres or feet. A taped distance is ground, the coordinates are grid: the check allows the difference from the projection's point scale factor and the land's height (SLD99, Kandawala and UTM 44N carry their transverse Mercator constants for this), and reports the gap from the grid distance.
- A bearing is compared at the precision written, as the forward or the back bearing of the line.
- Beyond that, the ordinary difference between field work and computed figures (a tape's sag and slope, centring, rounding by hand) is **close**, not a difference: 2 cm plus 1 in 5,000 of the line, or 30 seconds of arc. These are Farbaek's own defaults, recorded in `SKETCH_TOLERANCE`, not a legal tolerance; a surveyor's own will replace them with the profile defaults (part 3). A close reading is still shown with its size.
- A line from a point to itself, or between two numbers at one place, isn't checked: it is most likely a misreading.
- A point number not in the survey files is a warning.
- Nothing is compared until the project's coordinate system is confirmed.

**What the plan's checks show:**

- A summary (information): how many things were read, how many agree.
- A measurement that differs: professional review, blocking approval. The surveyor either keeps it as surveyed (the same "keep as surveyed" answer near misses use, key `sketch:rN`) or corrects the survey. Nothing moves, and nothing is drawn from a sketch.
- A point number not in the data: a warning.

**Stored with the plan, not beside it.** The readings are a `sketch` field on the drawing document, saved as a new version, so the approval covers them. The field is left out of the approval fingerprint while empty, so earlier approvals stand. No migration. New readings replace earlier ones, and with them any answers about the earlier ones.

**Only reading writes the readings.** A plan saved from the browser keeps the stored readings, whatever it sends, so none can be made up, changed or removed to clear a difference that holds approval. If the plan was saved while Claude was reading, the readings go onto the newest version once, rather than being lost after the read was counted. "Keep as surveyed" answers are checked against the plan as it's shown, with the project's own confirmation of its coordinate system, so an answer about a sketch survives every save.

**Only with the surveyor's say-so, every time.** At the start and on the Draft step, a box (unticked) says the photos go to Anthropic, outside Sri Lanka, to be read, and (since ADR 0240) that Farbaek keeps them with the plan. The server refuses without it. Photos are shrunk in the browser to 1,568 px (one to six, 1.8 MB each, 5.5 MB together), and the server checks each by its bytes (JPEG, PNG or WebP).

**Metered like reading an old plan:** operation `survey_read`, free while Survey Studio is tested, within the same 20 reads a day per person on Farbaek's key, and on a workspace's own Claude key when it has one. Usage is reserved first and given back if the call fails or Farbaek's own checks fail. The audit event holds counts only.

**At the start, the plan comes first.** Generate Plan draws the plan, then reads the sketches onto the version it drew. If reading fails, the plan is still drawn and saved: the screen says so, keeps Generate off so no second project is made, and links to the plan, where the sketches can be read again from the Draft step.

## What it doesn't do

- No readings carry a place on the photo. Claude's coordinates are approximate, and nothing here relies on them.
- ~~The photos aren't kept.~~ Replaced by ADR 0240 (stage 230): the photos read are kept with the plan, beside their readings.
- A sketch's line work and shapes aren't read, and nothing is drawn from a sketch.

## Consequences

- A sketch that agrees with the coordinates adds one line of information. One that disagrees holds approval until the surveyor answers it, which is the brief's "correct only genuine exceptions".
- A wrong reading by the model shows as a difference the surveyor dismisses, never as a changed plan.
- The same checks can take readings from another reader later (OpenAI, or a local model) without changing what the surveyor sees: the record keeps which model read them.
