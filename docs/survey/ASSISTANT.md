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
   - every quote must be in the instruction, and code reads the value from it ([`spoken.ts`](../../src/core/survey/assistant/spoken.ts), [`measure.ts`](../../src/core/survey/assistant/measure.ts));
   - points must be the project's, and lots, roads, adjoining lands, lines and notes must be on the plan;
   - the model's own sentence may hold no digit or number word;
   - at most 12 steps a spoken instruction, 30 a typed one;
   - what fails is listed with its reason, or becomes a question.
5. **What comes of it.**

| Kind | Operations | What happens |
| --- | --- | --- |
| View | zoom, focus, select, undo, redo | At once |
| Now | layers, labels, paper, orientation, layout, sheet switches | At once, one undo step, Undo beside it; on a read-only plan, shown in a card |
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
- lot names ("lot B one" is B¹);
- bearings, including "forty five thirty fifteen" said without words between the parts;
- scales ("one to five hundred") and dates ("the twelfth of November twenty twenty six").

Anything that reads two ways is refused, never guessed: "four fifty thousand", "twenty one twenty two" as one number. "to", "too", "for" and "won" are never digits.

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

- **Push to talk** (the default):
  - hold the microphone, or Space while the sheet has focus, and let go to send (400 ms more is heard after letting go);
  - or tap to start and tap again to send.
- **Live talk:**
  - one tap opens a conversation, and each pause (1.2 s, a setting) ends an instruction, sent after a short countdown that typing or a tap stops;
  - it listens again after each reply;
  - "apply", "discard", "undo" and "stop listening" work by voice;
  - a minute of silence closes it.
- **Chrome on Android** hears one phrase at a time, so recognition restarts and the words carry on.
- **The level** shown while listening is the microphone's real level, on computers only. Phones show the growing caption instead.
- **Spoken replies** are opt-in and use local voices only, so plan text doesn't go to a network voice. They're never spoken over the microphone, and they're off on iOS 27.0 to 27.2. Where there's no voice for a language, the reply stays text and says so.
- **First use:** before the first listen, the bar says who turns speech into text in this browser and that Farbaek gets only the text.

## Questions

A question card offers answers to tap. A tapped, typed or spoken answer carries on the instruction that raised the question ("create the boundary using these survey points", then "lot C"), unless the answer is an instruction of its own.

## The picked points

Shift, Ctrl or Cmd plus a tap, or "Select several" on phones, picks items in order; picked points show their order on the sheet. "These points" in an instruction means them, in that order.

## Records and undo

- **Applying:** an applied turn is one step in the editor's history, and keeps a patch of the parts it changed. "Take back" restores those parts after a save too, if nothing has changed them since.
- **The record:** model turns are recorded in `survey_assistant_turns` (migration v96; [DATA_MODEL.md](DATA_MODEL.md)) with the words, the reply, the operations as checked, what was left out, the outcome and, when applied, the SHA-256 of what was applied. The drawer lists this visit's turns, with "Use again" and "Take back".
- **Marks:** what the assistant adds is marked `ai_assist` (checked: the surveyor applied it after seeing it), and History names it.

## Cost and limits

- **Metering:** each model turn is metered as `survey_assist` ([docs/billing/usage.md](../billing/usage.md)). It's refunded when the call fails or when nothing in the answer survives the checks.
- **Rate limit:** 20 turns a minute per person.
- **No model turn:** the local reader, the answers and the hand-overs use no AI.
- **Off:** in the demo and on read-only plans the model is off with the reason. The local reader still works.

## Tests

- [`spoken.test.ts`](../../src/core/survey/assistant/spoken.test.ts): every spoken form and refusal.
- [`assistant.test.ts`](../../src/core/survey/assistant/assistant.test.ts): checks, applying, patches, answers, the reader, the conversation states and the languages.
- [`assistant.test.ts`](../../src/server/survey/assistant.test.ts) (server): metering, refunds, roles and what the model is sent, with a labelled fake model.
- [`survey-studio.test.ts`](../../tests/db/survey-studio.test.ts): v96's constraint, grants, roles, decisions, retention and cascade.
- [`permissions-policy.test.ts`](../../tests/security/permissions-policy.test.ts): where the microphone is allowed.

## Not yet

- **Measured accuracy:** recordings from surveyors, 100 to 200 per language, to measure exact-match accuracy per value. That decides whether a self-hosted recogniser (a Sinhala Whisper fine-tune on the server) is worth running.
- **Sinhala number words**, once recordings show how Chrome writes them.
- **Tamil**, which is in the registry but off.
- **The iPhone and Android apps' microphone permissions.**
- **A real model call on production.** It's the owner's check, shared with stage 191.
