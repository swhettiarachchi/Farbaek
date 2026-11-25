# Stage 273: scheduling from Chat

- **Date:** 2026-11-25
- **Branch:** `feat/stage-273-schedule-from-chat`, from main at #329's merge
- **Decision:** ADR 0280
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` for the chip and its card (the answer's own chip style, tokens, plain sentences, a status with its icon); `premium-app-ui` for restraint (one quiet control, opened on press); `ui-ux-pro-max`'s forms and feedback checklist (progressive disclosure, success said in place, focus kept). The owner's direction, said again with this stage: simple, like ChatGPT.

## Why

The owner asked again for every screen to be as simple as ChatGPT. Scheduled tasks worked (stage 271), but a person had to know the page existed. In ChatGPT a person says what they want in the chat and it is offered there.

## What was built

- **`core/automation/offer.ts`:** when a message is a request to do something at a time. It reads only the person's own words (no code, quotes or pasted material), needs both a schedule and an ask, offers a one-time run only for a reminder, and reads "tomorrow" from when the message was sent.
- **`core/automation/eval/offer-cases.ts` and `offer.eval.test.ts`:** 149 written messages with whether an offer belongs, and the floors the rule is held to.
- **`components/chat/schedule-offer.tsx`:** the chip under the newest answer; on press, the schedule in a sentence with Schedule it and Change it; what was scheduled said in place, with the keyboard's place moved to it; "This is scheduled." when it already is.
- **`app/scheduled/actions.ts`:** `scheduleOfferStateAction` (offer, already scheduled, or nothing) and `scheduleFromChatAction` (the Scheduled page's own save, once).
- **A scheduled run's note:** `RUN_NOTE` in `core/automation/tasks.ts`, carried by the runner through `headless-chat.ts` to `prepareTurn`'s new server-only `note`, beside the person's message for the model only.
- **The Scheduled form** takes a request carried from Chat, reads its schedule from its words and keeps that as its base.
- **A third sample chat** in the demo, labelled, that ends on a request to schedule.

## Verified

- **Tests:** `offer.test.ts` (9), `offer.eval.test.ts` (2, over the 149 messages), `actions.test.ts` (21, of which 6 are this stage's), `headless-chat.test.ts` (6, one new: the note reaches the model as context and the saved question is the instruction alone), `runner.test.ts` (13, the run carries the note). With the other automation and Chat turn tests, 178 in that run.
- `tsc --noEmit` with a 4 GB heap, and lint on the changed files.
- **In a browser, the demo workspace's sample chat,** at 375 and 1280 px, light and dark: the chip shows; pressing it opens the card in view; Schedule it says the demo saves nothing; Change it opens the Scheduled form with the request in it, its schedule read as "Every day at 8:00 AM", the cursor in the box, and changing "How often" keeps the time. No console errors. `qa:responsive --strict` at 320 to 1280 px, dark and at 200% text, and `qa:a11y`: no findings.
- **Not verified:**
  - **A real press.** In the demo the save is refused before anything is written, so the path past the save has not run in a browser: a real task scheduled from a real chat is the first live check.
  - **What a model writes at run time** with the note. The note reaches the model in tests; no scheduled run has been made on production yet (stage 271's live check is still open).
  - The chip under a long answer on a real phone.

## A fresh review, before the PR

A reviewer read the first version without my notes and tried the rule on 149 messages. It found the server side sound and the rest not ready. All of it is fixed, changed or said in the ADR:

1. **The offer fired on most ordinary messages that merely mention a time:** 74 of 89 that should get none ("write a script that runs every day at 9", "I wake up every day at 5", "can dogs eat rice every day", pasted emails, code). The rule was rewritten to need a request, read only the person's own words, and is now held to the two lists. The card under the answer became a chip, so a wrong offer costs a line.
2. **"Its answers will arrive in this chat" wasn't what an open chat showed,** and the person's next message would branch away from the run. The link to the chat was taken out: a task keeps its own chat, and the line says so.
3. **A delivered one-time reminder offered itself again for a later day,** and old chats re-read "tomorrow" from the moment they were opened. The words are now read from when the message was sent, a time past is never offered, and nothing is offered in a task's own chat.
4. **A scheduled "remind me…" would likely have been answered "I'll remind you"** at its due time, since the run sent the instruction as a new request. Every scheduled run now tells the model what it is. This fixes stage 271's runs too.
5. Natural requests were missed ("do this every day at 9", "can you check the gold price every morning?"): now offered.
6. "The connection dropped. Nothing was scheduled." could be untrue, and a second press made a second task: the press now asks what happened, and the same instruction is never saved twice.
7. The carried request's schedule wasn't the form's base (changing "How often" reset the time to 9:00): fixed. A carried request now expires after ten minutes.
8. Smaller: the card appearing out of view on a phone (it scrolls into view), focus dropped after a press (moved to what was said), a question with files offered (not now), the save re-reading the page the person was on (not from Chat).

## Next

- A scheduled task's answers arriving in the chat it was asked in: needs Chat to re-read a conversation that changed while open.
- Triggers other than time (a webhook in); then persistent agents; then one command center.
