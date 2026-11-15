# Stage 195: Survey Studio, talk or type to the plan

- **Branch:** `feat/survey-195`, from main after stage 194 went live.
- **Migration:** v96 (`20270106090000_survey_assistant.sql`), applied by the owner before the merge.
- **Why:** the owner asked for an AI drafting partner. Talk to the plan while looking at it, have it understand the project and the selection, see the result at once, and carry on. Voice, typing and direct editing should mix freely. Push to talk and live talk should be separate modes, and written prompts should work as well as speech. English and Sinhala now, Tamil later. Numbers must never be invented, every change must be undoable, and the engine must do every calculation.
- **Decision:** [ADR 0210](../adr/0210-survey-drafting-assistant.md). How it works: [ASSISTANT.md](../survey/ASSISTANT.md).

## Research

- **The report:** `reports/Voice drafting assistant technology.md`, from five researchers (notes in `research_notes/Voice drafting assistant technology/`). They covered:
  - browser speech recognition, language by language;
  - self-hosted recognition on a CPU server, with Sinhala accuracy and licences;
  - text-to-speech voices;
  - dictating technical numbers safely;
  - tool execution and voice UX, including accessibility.
- **Its key findings:** Sinhala is heard only by Chrome's cloud recogniser. Numbers must bypass the model. Push to talk suits the field. The microphone was turned off on every page by our own security headers.
- **Design review:** an independent design agent reviewed the plan. Changes adopted:
  - a wrapper that survives saves;
  - a route handler, so Stop aborts the call and refunds it;
  - refs only, no coordinates, sent to the model;
  - ordered multi-select;
  - divisions in place, not by switching steps;
  - previews rebuilt over manual edits;
  - one shape for both readers;
  - the editor split first.
- **Skills used:**
  - `deep-research` for the research;
  - `premium-app-ui` (direction Swiss Precision: calm motion, glass only on the floating bar, Apply as the signature moment);
  - `farbaek-ui` and `farbaek-human-made` for the design rules;
  - `farbaek-survey-studio` for the survey rules (no AI calculation, nothing invented, nothing changed silently).

## Done

- **Core** (`src/core/survey/assistant/`):
  - `spoken.ts` reads values from words: numbers in every spoken form, point lists and ranges, lot names, bearings (including "forty five thirty fifteen"), scales, lengths and dates. It refuses what reads two ways, and writes read-backs.
  - `measure.ts` reads dictated legs and coordinate rows.
  - `ops.ts` holds the closed operation set and tiers; `context.ts` what the model is told; `check.ts` the checks.
  - `apply.ts` does preview and apply, with patches; `answer.ts` the engine's answers; `describe.ts` the card's words and read-backs.
  - `reader.ts` is the local reader (English and Sinhala command words); `sides.ts` finds the leg facing a side; `session.ts` holds the conversation's states; `languages.ts` the language registry.
- **Editor:**
  - **Panels moved:** the side panels moved to `plan-panels.tsx` (a pure move, checked line by line).
  - **New in the editor:** the bridge for the assistant, the change previewed on the sheet with marks, ordered multi-select ("Select several", or Shift, Ctrl or Cmd), and Save then go on for hand-overs.
  - **The sheet** (`sheet-svg.tsx`) shows picked points' order and marks changes.
- **The bar** (`src/components/survey/assistant/`):
  - the bar itself, with push to talk and live talk;
  - the live caption, held words, the change card with ticks, answer, question, hand-over and note cards;
  - the drawer of earlier instructions, the language menu with honest availability, and opt-in spoken replies;
  - the one-time privacy note;
  - the mark: Farbaek's Agent Core, following the real microphone level on computers.
- **Hand-overs:** the divide panel takes a division (equal lots split the computed area by code) and the Import step's typed tables take dictated rows, each with a "From the assistant" banner.
- **Server:**
  - `survey-assistant.ts`: the prompt and the model call (fast tier, low effort, cached prompt);
  - `assistant.ts`: metering, refunds when nothing survives, the turn record;
  - the `assist` route: same-origin, body cap, contributor, schema and point ownership, rate limit, abort;
  - `decideAssistTurnAction`.
- **Database:** v96 adds `survey_assist` and `survey_assistant_turns`, with `app_survey_record_assistant_turn` and `app_survey_decide_assistant_turn`.
- **Microphone:** `next.config.ts` allows it on `/app/survey/*` on Farbaek's own host only.
- **Docs and copy:** ADR 0210, ASSISTANT.md, DATA_MODEL, API_SPECIFICATION, ROADMAP, usage.md, the Privacy page's speech paragraph, and the public `/survey` page's new step.

- **The owner's example instructions without AI:** "Create the boundary using these survey points" (it asks for the lot's name, and a spoken or typed answer carries on the instruction), "Divide this land into four lots" and "Add an access road along the eastern boundary" (handed to the divide panel; a width without its unit is asked).

## Reviews

Two fresh reviewers read the finished stage: one on the core, server and migration, one on the bar, speech and accessibility. They found 35 real problems (5 high and 13 more on the core and server, 3 high and 14 more on the bar). All are fixed, each core one with a test (`src/core/survey/assistant/review195.test.ts`); the bar's were traced in the code and checked in the browser. The SQL, RLS and grants had no defects.
- **Values read differently from what was said:**
  - quadrant bearings lost their letters;
  - a spoken decimal "point" split coordinate rows;
  - quotes matched folded, so "1-5" matched "1, 5";
  - "lot 1 superscript 2" read as 12, and "point five" as 5.
- **Changes not tied to the words:** the model's layer, paper, label and undo changes passed on any words, and units came from the model. Now each change must be named by its own words, units come from the words, and the model's changes always wait in a card.
- **The bar:**
  - a speech error still sent the words, and could restart in a loop;
  - an old recogniser could start a second one;
  - a late model reply was applied to the plan as it was when sent;
  - nothing was cleaned up when the editor remounted on save;
  - live talk could show "Listening" with the microphone closed;
  - ticks were lost on save;
  - menus didn't work by keyboard;
  - the card stack could go off the top of a phone screen.
- **Smaller:** a slow point-list reader on the server, the turn record's size, 402 for usage, typed Tamil, the iOS version check, "Clear them".

## Verified

- **Unit tests:**
  - spoken reading: 11;
  - the assistant's core: 21, including the owner's example instructions read without AI;
  - the reviews' fixes: 15;
  - the server turn with a fake model, and the record's size: 4;
  - where the microphone is allowed: 2.
- **DB tests:** v96's constraint, grants, roles, decisions, retention and cascade (19 in the file).
- **Gates:** typecheck, lint and the design tests passed. The design tests caught one banned word and one off-scale icon, both fixed.
- **Browser** (dev demo, the Sample, read-only):
  - **Typed instructions:** "Calculate the total land area" gave the engine's answer; "hide the point numbers", "set the scale to 1:1000" and "A3 landscape" gave change cards, with the sheet previewing A3 landscape and Apply off with the Sample's reason; "add lot B4 from points 1 to 3 and 8" said honestly that the AI is off in the demo, and what still works.
  - **Controls:** the mode switch, the first-use privacy note, and no sideways scroll at 375 px.
- **Not checkable here:** real speech (no microphone in this setup) and a real model call (the owner's key).

## Next

- **The owner's checks after deploy:** speak a few instructions in English and Sinhala on a phone and a computer, and make one real model call.
- **Recordings** from surveyors, 100 to 200 a language, to measure exact-match accuracy per value. They decide whether to self-host a Sinhala recogniser.
- **Language:** Sinhala number words, and a review of the Sinhala command words by Sinhala-speaking surveyors.
- **Tamil**, and the native apps' microphone permissions.
