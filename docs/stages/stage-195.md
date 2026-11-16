# Stage 195: Survey Studio, talk or type to the plan

- **Branch:** `feat/survey-195`, from main after stage 194 went live.
- **Migration:** v96 (`20270106090000_survey_assistant.sql`). The owner applied it on 2026-11-16, before the merge; see "Production's database" below.
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

**The re-check.** Two more fresh reviewers read the fixes and found 23 more (13 on the core, 10 on the bar), all fixed:
- **The core:**
  - a hyphen ("points 1-4") made the local reader throw, from an escape the u flag refuses;
  - a one-figure value ("4 lots") never matched;
  - "from 1:500 to 1:1000" read the old scale, and "ten and a half" read as ten;
  - "lot M" and "lot P" read as units, and "remove lot B one" could name lot B;
  - "Plan No. 1234 is my own" read as not mine.
- **The bar:**
  - a card button pressed while push to talk listened left the microphone open;
  - "apply" with nothing waiting stuck on working;
  - holding Space scrolled the page;
  - the speech hook could restart without end;
  - a save during a model call lost the answer without saying so.

## Production's database

v95 and v96 were refused on 2026-11-16 (`relation "public.survey_projects" does not exist`), and nothing changed. It turned out that Survey Studio's v93 and v94 had never reached production. They had been noted as applied when stages 190 and 191 merged, with no read-back, so the signed-in Survey Studio had no database behind it from stage 190 on.
- **The check:** a new read-only script, `scripts/vps/check-migrations.ps1`, looks for what each of v90 to v96 makes. Production's self-hosted database has no migration ledger. It showed v90 to v92 present, and v93 to v96 missing.
- **Applied:** the owner applied the four in order the same morning, each in one transaction with its hash checked on both ends. The read-backs:

| Migration | Read-back |
| --- | --- |
| v93 `20270103090000_survey_studio` | `check\|t` (`survey_projects` exists) |
| v94 `20270104090000_survey_autodraft` | `check\|1` (`app_survey_record_ai_draft`) |
| v95 `20270105090000_survey_instrument_files` | `check\|t` (the source formats include the instrument files) |
| v96 `20270106090000_survey_assistant` | `check\|t` (`survey_assistant_turns` exists) |

  The check afterwards showed all seven as `t`.
- **From now on:** a migration counts as applied only once its read-back is written in the stage's notes.

## Verified

- **Unit tests:**
  - spoken reading: 11;
  - the assistant's core: 21, including the owner's example instructions read without AI;
  - the reviews' and the re-check's fixes: 21;
  - the server turn with a fake model, and the record's size in bytes: 4;
  - where the microphone is allowed: 2.
- **DB tests:** v96's constraint, grants, roles, decisions, retention and cascade (19 in the file).
- **Gates:** typecheck, lint and the design tests passed. The design tests caught one banned word and one off-scale icon, both fixed.
- **Browser** (dev demo, the Sample, read-only):
  - **Typed instructions:** "Calculate the total land area" gave the engine's answer; "hide the point numbers", "set the scale to 1:1000" and "A3 landscape" gave change cards, with the sheet previewing A3 landscape and Apply off with the Sample's reason; "add lot B4 from points 1 to 3 and 8" said honestly that the AI is off in the demo, and what still works.
  - **Controls:** the mode switch, the first-use privacy note, and no sideways scroll at 375 px.
- **Not checkable here:** real speech (no microphone in this setup) and a real model call (the owner's key).

## Completing it

Checked against the plan before the merge, the stage still lacked these, now done:
- **The settings:** a panel on the bar with spoken replies, "Check my words before sending" (asked for in the brief, and until then without a switch), and live talk's pause.
- **English on this computer:** Chrome's one-click download, then the sound stays on the computer and Chrome listens for survey words. Read-only check of the owner's Chrome 157: it offers en-IN, en-GB and en-US for download, with survey-word hints. The download itself is the owner's click.
- **History's compare** names what the assistant added or changed (the docs said so before it did).
- **The record:** changes the local rules made are recorded too, as `local`. The drawer lists earlier visits' instructions.
- **A way in:** the Import and Lots steps say the assistant is on the Plan step.
- **A decision:** divisions stay on the Lots step's divide panel (ASSISTANT.md says why).
- **Its review:** a fresh reviewer found 9 more problems, all fixed:
  - the record action took the browser's operations; the server now reads the words again itself;
  - the settings could send people to a download that wasn't shown;
  - on-device hearing now fails closed where the recogniser can't stay on the computer, and switches on only once English is downloaded;
  - copy promised hints or named Chrome where that wasn't true;
  - the drawer's labels and its 20-row window.
- **Checked on a production demo build:**
  - `qa:a11y`: 12 page views, 0 findings;
  - `qa:responsive`: 55 page views from 320 to 1440 px, all clean;
  - double text size at 375 px: clean.

  The pages were the projects page, the Plan, Lots and Import steps, the public page and the Privacy page. Then `pnpm check` (3,516 tests) and `pnpm build`.

## The field test (2026-11-16)

The owner asked for the feature to be tested as a professional land surveyor would use it, and fixed.
- **How it was tested:**
  - about 170 real instructions, typed and as Chrome writes speech, through the real reader, checks, apply, card and answer code against the sample plan;
  - then the screen itself on a local copy of the Sample unlocked for editing (never committed): applying with items unticked, undo and redo, removing a lot, dictating a field book through to the Import table, and the cards at 1280 and 375 px.
- **What a surveyor would have hit:**
  - **Needed the AI** (failing with it off, slower and paid with it on): most of the title block, the boundaries ("north by Lot 4 in Plan 1234"), "what is the extent", renaming, removing and noting lots, dictated field books, and common ways of saying divisions, access roads and scales ("one is to five hundred"). About 60 of the 170 needed it; now 2 do.
  - **Misreadings,** each refused safely before but unhelpful:
    - "… then hide the point numbers" swallowed into a point list;
    - legs separated only by commas run together;
    - "lot B1 saying garden" taken as the lot's name;
    - an earlier plan's date put into its number;
    - a tapped "from 3 to 8" for a leg read as the range 3 to 8.
  - **On screen:**
    - Apply below the fold of a card with several values;
    - on phones, the buttons taking the room the values needed;
    - undo silent;
    - bearings shown without their marks;
    - "what's missing" giving a count instead of what's missing;
    - areas spoken in hectares only.
  - **A safety gap:** a new lot that overlapped another, or whose legs crossed, was applied without a word. The card now shows the engine's computed extent and warns, and the read-back says "Careful: it overlaps lot B1".
- **Tests:** `fieldwork.test.ts` (13) keeps the surveyor's instructions working.
- **The owner's look at the screen:** the cards' letters and icons were too large, then the bar. Both are smaller now: compact cards with sticky Apply, and a bar of one command row over a quiet row, with the language moved into the settings (where it says how this browser hears it) and Send shown only with words to send. At Android's largest text (Chrome's default font at 32 px, as `qa:responsive --text-scale=2` sets it), the words had squeezed to one a line and the microphone and Apply fell onto rows of their own; now both rows hold, with 44 px buttons.
- **A fresh review of the changes** (a separate agent, every finding reproduced) found 11 real misreadings and ten smaller faults (one, the sticky Apply, already fixed), all fixed with `fieldreview.test.ts` (18):
  - **Values swallowing the next instruction** when a recogniser leaves out the commas ("village Udugampola district Gampaha", four boundaries in one breath, "plan number 1234 dated …", "Plan No. 1234 is my own"); and the opposite, "and village road" in a boundary taken as a village.
  - **Rules catching too much:** notes on a lot becoming plan notes; "change lot B1 into two lots" renaming it "2"; the surveyed-points refusal catching "remove the point numbers" and a lot's corners; "show lot areas"; a plain "line" put on the roads layer; "show the wall …" drawing one.
  - **Legs and names:** "between points 3 and 8" dropped, "point 3 and point 8" kept in the text, "between Kandy and Galle" read as points; "as a garden" naming lot A from a model's reply; "print on A3" naming a lot A³.
  - **Smaller:** "half acre lots" read as halves; a scale said with the paper dropped; layers listed with commas; a leg's "from 101," before its "to"; two new lots over the same corners not warned about each other; a refusal or answer said with an instant change lost; "undo, undo" with one step saying "Undone" twice; blocking checks past six left out of the count said aloud.
  - Still only 2 of the battery's instructions need the AI.
- **Testing note:** the app's service worker caches script files in the local dev browser, so after edits, clear it there (or the page runs old code). Production file names change with every release.

## Next

- **The owner's check after deploy,** in English: speak a few instructions on a computer and an Android phone, and make one real model call.
- **Sinhala and Tamil:** the owner decided on 2026-11-16 that Sinhala isn't a priority. It stays as built, with no number words, recordings or own recogniser planned. Tamil stays off.
- **The native apps' microphone permissions,** with the apps' next releases.
