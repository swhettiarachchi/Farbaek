# Survey Studio's drafting assistant

Talk or type to the plan (stage 195, [ADR 0210](../adr/0210-survey-drafting-assistant.md)). The bar sits along the bottom of the Plan step's sheet, or above the tab bar on phones.

## How an instruction becomes a change

1. **Words.** Spoken words become text in the browser, or the surveyor types. The live caption shows their own words.
   - The words are held for review when the surveyor asks for that, or when a number could be read two ways ("2 to 4", "for", "to").
2. **The local reader** ([`reader.ts`](../../src/core/survey/assistant/reader.ts)) reads frequent instructions by fixed rules, instantly and without AI:
   - undo and redo, zoom, the whole sheet;
   - showing, hiding and locking layers;
   - paper, orientation, layout and scale;
   - moving the picked label or putting it back;
   - the area, the perimeter, the checks, what's missing and the scale;
   - "add the north arrow" (it always prints);
   - a lot from the points picked on the sheet ("create the boundary using these survey points") or from points said ("add lot B4 from points 1 to 4"); without a name it asks for one, and never makes one up;
   - dividing a lot into equal lots, and an access road or strip along a side, handed to the divide panel (the width is asked for when it isn't said);
   - conversation words: apply, discard, stop listening, save, read it back, go to a step.

   English, plus Sinhala command words awaiting review by Sinhala-speaking surveyors.
3. **The model** ([`survey-assistant.ts`](../../src/server/ai/survey-assistant.ts)), for anything else: Claude's fast tier at low effort, one request, structured output against the operation set ([`ops.ts`](../../src/core/survey/assistant/ops.ts)). It is told the plan as refs (L1, R1, A1, F1, N1, P:12), names and point numbers ([`context.ts`](../../src/core/survey/assistant/context.ts)): never a coordinate or an area. It writes the surveyor's own words for every value, never a value.
4. **The checks** ([`check.ts`](../../src/core/survey/assistant/check.ts)), in the browser and again on the server:
   - every quote must be in the instruction as written, punctuation included ("1-5" is a range, "1, 5" two points), and code reads the value from it ([`spoken.ts`](../../src/core/survey/assistant/spoken.ts), [`measure.ts`](../../src/core/survey/assistant/measure.ts));
   - each change must be named by its own words: a layer by its name, the paper by A3, a sheet switch by what it is, a lot by its name (or "this" with it picked), a side by north, east, south or west, a scale as a scale, decimals by which ones; units come from the words (feet or metres, perches or square metres), never from the model;
   - English instructions are held to this word by word; in Sinhala, where the words for layers and sides aren't all known yet, the card is the check;
   - points must be the project's, and lots, roads, adjoining lands, lines and notes must be on the plan;
   - the model's own sentence may hold no digit or number word;
   - at most 12 steps a spoken instruction, 30 a typed one;
   - what fails is listed with its reason, or becomes a question.
5. **What comes of it.**

| Kind | Operations | What happens |
| --- | --- | --- |
| View | zoom, focus, select, undo, redo | At once |
| Now | layers, labels, paper, orientation, layout, sheet switches | Read by the local reader: at once, one undo step, Undo beside it. From the model, or on a read-only plan: in a card. The model's undo and redo never run |
| Confirm | lots, roads, adjoining lands, lines, title fields, notes, scale and decimals | A card: the change marked on the sheet, each value large with its role, a tick to leave any out; Apply is one undo step |
| Caution | removing a lot, road, adjoining land, line or note | As confirm, named in full; a lot goes with the adjoining lands written beside it |
| Answer | total area, lot areas, perimeters, checks, what's missing, the scale | Computed by the engine ([`answer.ts`](../../src/core/survey/assistant/answer.ts)); the computed area beside, never instead of, a stated extent |
| Hand-over | divide a lot; dictated legs or coordinates | The divide panel, or the Import step's typed tables, filled in for checking there; the plan is saved first |
| Never | points, coordinates, the coordinate system, approval, the surveyor, exports | Said so, with where it's done |

## Reading values from words

[`spoken.ts`](../../src/core/survey/assistant/spoken.ts) reads digits, words, digit by digit and mixed forms:
- "twenty five point four", "four five zero zero one two point three four five" and "25 point 4" read as numbers; "oh" and "nought" are zero only inside a number;
- single digits in a row are one number, except in a list of points, where each is its own;
- cardinal runs with lakhs and thousands read as one number;
- ranges ("1 to 5", "101 through 104") expand only over the project's points;
- lot names ("lot B one" is B¹, "lot 1 superscript 2" is 1²);
- bearings, including "forty five thirty fifteen" said without words between the parts, and quadrant bearings with their letters ("S 45 30 E", "N45°30'E");
- scales ("one to five hundred", "set the scale to 1:500") and dates ("the twelfth of November twenty twenty six").

Anything that reads two ways is refused, never guessed:
- "four fifty thousand", or "twenty one twenty two" as one number;
- a leading "point" ("point five": the survey point, or 0.5);
- "lot 12 34" and "lot 2 1" (a number, or a number and its superscript);
- "450,012" (one number, or two): thousands separators join only with a decimal part, a first group of one or two digits, or groups of 000;
- a quadrant with one letter, or a stray word inside a bearing;
- a number alone as a scale, unless the word scale or a ratio is said ("500 perch lots" is not a scale).

"to", "too", "for" and "won" are never digits. In dictated coordinates, "point" after a number is a decimal point; a row that says the same value twice ran into the next one, and is stopped with a request to say "then" between points.

Read-backs go the other way: digit by digit, "decimal" for the point, degrees, minutes and seconds in words.

## Voice

- **Recognition is the browser's own** ([`use-speech.ts`](../../src/components/survey/assistant/use-speech.ts)). The page gets text, never sound.

| Browser | English | Sinhala | Sound goes to |
| --- | --- | --- | --- |
| Chrome, on a computer or Android | Yes (`en-IN`) | Yes (`si-LK`), online | Google |
| Edge | Yes | Unconfirmed | Microsoft |
| Safari, and every browser on iPhone or iPad | Yes | No | Apple |
| Firefox 160, on a computer | Yes, on the device | No | Nowhere |
| Firefox for Android | No | No | |

- **English on this computer** (Chrome 139 and later, on a computer): the settings offer "Download English for this computer", a one-time download by Chrome (it needs the click). After it, "Hear English on this computer" keeps the sound on the computer. Chrome then also listens for survey words such as bearing, perch and lot (contextual biasing, Chrome 142 and later, which Chrome does only on the device; [`languages.ts`](../../src/core/survey/assistant/languages.ts) has the list). The words only make hearing them likelier; they never make a value. Where the browser doesn't offer it, the choice isn't shown.
- **Push to talk** (the default):
  - hold the microphone, or Space while the sheet has focus, and let go to send (400 ms more is heard after letting go);
  - or tap to start and tap again to send.
- **Live talk:**
  - one tap opens a conversation, and each pause (0.8, 1.2 or 2 s, in the settings) ends an instruction, sent after a short countdown that typing or a tap on the words stops;
  - it listens again after each reply;
  - "apply", "discard", "undo" and "stop listening" work by voice;
  - a minute of silence closes it, and so does a recogniser that keeps ending with nothing heard;
  - a microphone error (blocked, no connection) ends it without sending anything;
  - saving carries the conversation on; going to another step ends it.
- **Each listen is a session:** a recogniser from an earlier one can't restart or send. A newer instruction replaces one still being worked out, and a reply is checked and applied against the plan as it is when it arrives.
- **Chrome on Android** hears one phrase at a time, so recognition restarts and the words carry on.
- **The level** shown while listening is the microphone's real level, on computers only. Phones show the growing caption instead.
- **Spoken replies** are opt-in and use local voices only, so plan text doesn't go to a network voice. They're never spoken over the microphone, and they're off on iOS 27.0 to 27.2. Where there's no voice for a language, the reply stays text and says so.
- **First use:** before the first listen, the bar says who turns speech into text in this browser and that Farbaek gets only the text.
- **The settings** (the sliders button on the bar; [`settings-panel.tsx`](../../src/components/survey/assistant/settings-panel.tsx)), kept on this device:
  - spoken replies;
  - "Check my words before sending": what's heard waits in the line to be checked, changed and sent (numbers that read two ways are always held);
  - live talk's pause;
  - English on this computer, where offered.

## Questions

A question card offers answers to tap. A tapped, typed or spoken answer carries on the instruction that raised the question ("create the boundary using these survey points", then "lot C"), unless the answer is an instruction of its own.

## The picked points

Shift, Ctrl or Cmd plus a tap, or "Select several" on phones, picks items in order; picked points show their order on the sheet. "These points" in an instruction means them, in that order.

## Records and undo

- **Applying:** an applied turn is one step in the editor's history, and keeps a patch of the parts it changed. "Take back" restores those parts after a save too, if nothing has changed them since.
- **The record:** every turn that reaches the model is recorded in `survey_assistant_turns` (migration v96; [DATA_MODEL.md](DATA_MODEL.md)) with the words, the reply, the operations as checked, what was left out, the outcome and, when applied, the SHA-256 of what was applied.
  - Changes the local rules read and the surveyor applied are recorded too, as model `local` (`recordLocalAssistTurnAction`), so the record has every change the assistant made.
  - Views and answers change nothing and aren't recorded.
- **The drawer:** "Earlier on this project", the latest 20 instructions from the record, anyone's in the workspace, with what came of them ("No change made" for answers, questions and changes never applied) and "Use again". Then this visit's, with "Use again" and "Take back". It opens at the newest.
- **The record of a local change** is read again on the server from the words, by the same local rules: the browser sends only the words and the hash of what was applied, never operations, so the record holds only what the words ask for. 20 a minute per person.
- **Marks:** what the assistant adds is marked `ai_assist` (checked: the surveyor applied it after seeing it). History's compare names it: "added or changed with the drafting assistant, each applied after you saw it".
- **Divisions stay on the Lots step:** a division is handed to the divide panel there, after the plan is saved, so nothing is lost. The panel needs that step's room, with the lots editor and the block-out plan beside it, so it isn't repeated on the Plan step. The Import and Lots steps say the assistant is on the Plan step.

## Cost and limits

- **Metering:** each model turn is metered as `survey_assist` ([docs/billing/usage.md](../billing/usage.md)). It's refunded when the call fails or when nothing in the answer survives the checks.
- **Rate limit:** 20 turns a minute per person.
- **No model turn:** the local reader, the answers and the hand-overs use no AI.
- **Off:** in the demo and on read-only plans the model is off with the reason. The local reader still works.

## Tests

- [`spoken.test.ts`](../../src/core/survey/assistant/spoken.test.ts): every spoken form and refusal.
- [`assistant.test.ts`](../../src/core/survey/assistant/assistant.test.ts): checks, applying, patches, answers, the reader, the conversation states and the languages.
- [`review195.test.ts`](../../src/core/survey/assistant/review195.test.ts): what the stage's reviews found, each as a test of its fix.
- [`assistant.test.ts`](../../src/server/survey/assistant.test.ts) (server): metering, refunds, roles and what the model is sent, with a labelled fake model.
- [`survey-studio.test.ts`](../../tests/db/survey-studio.test.ts): v96's constraint, grants, roles, decisions, retention and cascade, and a local change recorded as `local`.
- [`compare.test.ts`](../../src/core/survey/compare.test.ts): History naming the assistant's changes.
- [`permissions-policy.test.ts`](../../tests/security/permissions-policy.test.ts): where the microphone is allowed.

## Not yet

- **A real model call and real speech on production** (English): the owner's check after the merge.
- **The iPhone and Android apps' microphone permissions:** the apps' own release, not this web feature.
- **Sinhala and Tamil beyond what's here:** the owner decided on 2026-11-16 that Sinhala isn't a priority. Sinhala stays as built (Chrome's recogniser, the command words); Sinhala number words, Sinhala recordings and a self-hosted Sinhala recogniser aren't planned. Tamil stays off.
