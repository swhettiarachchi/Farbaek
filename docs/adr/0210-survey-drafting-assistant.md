# ADR 0210: Talk or type to the plan: a drafting assistant that never writes a value

- **Status:** accepted (stage 195, 2026-11-16)
- **Builds on:** ADR 0202 (the AI drafts from words, the engine computes), ADR 0209 (upload draws the plan), ADR 0153 (icons name the action), ADR 0183 (status kinds)
- **Changes:** the microphone policy of ADR 0175's security headers, for Survey Studio's pages only

## Context

The owner asked for an AI drafting partner: a surveyor talks (or types) to the plan while looking at it, the assistant understands the project, the drawing, the selection and the layers, says what it will do, the engine does it, and the surveyor checks the result and carries on. Voice must sit beside the typed tables and direct editing, never replace them. English and Sinhala now, Tamil later. Numbers must never be invented or silently changed, every operation must be undoable and traced, and the engine must do every calculation.

Research (`reports/Voice drafting assistant technology.md`, five researchers, 2026-11-15) settled the ground:
- **Speech.** Browsers turn speech into text for free. Chrome's cloud recogniser (Google) hears English, Sinhala (`si-LK`) and Tamil; nothing hears Sinhala on the device; Safari and every iPhone browser hear English but not Sinhala; Firefox 160 hears on the device. The page gets text only. There is no `en-LK`; `en-IN` is nearest.
- **Self-hosting** speech-to-text for Sinhala on Farbaek's CPU-only server means a community Whisper fine-tune at about 15% word error on its own test, 2 to 4 s per command: possible later, not now.
- **Numbers.** Recognisers guess how to write numbers, with documented harm ("eight units" became "80"). Every field that can't afford a wrong number uses read-back and review.
- **Speech output.** No dependable Sinhala voice exists; iOS 27.0 to 27.2 mutes the microphone while speaking.
- **Models.** Claude's structured outputs keep the answer to a schema but can't express numeric limits; Haiku 5.5 at low effort is the fast tier.
- **A blocker in our own code:** the security headers turned the microphone off on every page.

## Decision

**One closed set of operations, and no value from the model.** The model (Claude's fast tier, through the metered pipeline) turns an instruction into operations from a fixed list (`src/core/survey/assistant/ops.ts`). It never writes a number, a point number or a name: it writes the surveyor's words it read them from, and code reads the value (`spoken.ts`, `measure.ts`) and checks it (`check.ts`): the quote must be in the instruction, points must be the project's, items must be on the plan. What doesn't read cleanly is left out with the reason, or asked. The model's own sentence may carry no figures at all, so every number on screen came from the surveyor or the engine. It sees the plan as refs, names and point numbers (`context.ts`), never a coordinate or an area.

**A local reader first.** Frequent, unambiguous instructions (zoom, layers, paper, scale, labels, the area, what's missing; apply, discard, stop listening) are read by fixed rules (`reader.ts`): instant, free, offline, in the demo. It returns the same shape as the model, so the same checks apply.

**Tiers by what could go wrong.**
- Views apply at once.
- Layers, labels, paper, orientation and layout apply at once, as one undo step, with Undo beside them.
- Anything with a value (a lot's corners, a road's edges, a title field, a scale) waits in a card: the sheet shows the change marked, every value large beside its role, a tick to leave any out, then Apply as one undo step.
- Removals are named in full.
- Questions about the plan are answered by the engine (`answer.ts`).
- Dictated measurements never reach the plan: they go to the Import step's typed tables, under the same confirmation as typing them.
- Divisions go to the divide panel, where the lines are seen before anything is kept.
- Points, coordinates, the coordinate system, approval, the surveyor and exports are outside the list.

**Voice is the browser's own; typing is first-class.**
- Push to talk (hold, or Space on the sheet; or tap and tap again) is the default for the field.
- Live talk (pauses end an instruction, answers by voice) is for the office.
- Both show the surveyor's own words live; numbers that could be read two ways hold the words for review.
- Typing takes whole instructions, up to 30 operations a turn (12 spoken).
- Each browser says honestly which languages it hears and who processes the sound, and the first use says so before listening.

**Spoken replies are opt-in**, local voices only, never over the microphone, figures read digit by digit.

**Records.**
- **Migration v96** adds the `survey_assist` operation and `survey_assistant_turns`. Each turn holds the words, the reply, the operations as checked, what was left out, the outcome, and the SHA-256 of what was applied. Members read it, only `app_*` functions write it, only the turn's author decides it, and each project keeps its last 500 turns.
- **Undo:** each applied turn keeps a patch, so it can be taken back after a save if nothing has changed those parts since.

**The microphone is allowed on Survey Studio's pages on Farbaek's own host** (`next.config.ts`), and stays off on every other page, published site and preview. The iPhone and Android apps keep it off until their store permissions are added.

## Why not the obvious alternatives

- **Let the model fill in values.** It's simpler, and it's exactly how a plausible wrong number reaches a legal plan. Values from quotes, read by code, close that door.
- **A chat window beside the plan.** It takes the surveyor's eyes off the sheet. A command bar on the sheet, with the change shown on the sheet itself, keeps the work in one place.
- **A paid speech service.** It's better for Sinhala, but there's no budget for one, and it would send land data to another company. The browser's own recogniser costs nothing; a self-hosted recogniser can follow if recordings show the need.
- **Always listening, or a wake word.** The evidence (false triggers, cut-off numbers, wind) points to push to talk in the field. Live talk is there for quiet rooms.

## Consequences

- **Sinhala by voice needs Chrome (or Edge, unconfirmed), online,** with the sound going to Google. iPhone users can speak English and type Sinhala.
- **How Chrome writes spoken Sinhala numbers is unknown.** Until real recordings show it, values in Sinhala instructions are read from digits, and anything else is asked.
- **The Sinhala command words** in the local reader wait for a review by surveyors who work in Sinhala.
- **The gate for the next phase** (a self-hosted recogniser, Tamil): 100 to 200 recorded instructions per language from surveyors, outdoors and in offices, measured by exact-match accuracy per value and the rate of wrong values applied unnoticed.
- **Every model turn is metered** (`survey_assist`), refunded when it fails or when nothing in it survives the checks, and rate-limited to 20 a minute per person.
