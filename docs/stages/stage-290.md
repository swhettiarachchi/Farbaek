# Stage 290: the assistant answers in place

- **Date:** 2026-11-27
- **Branch:** `feat/stage-290-assistant-answers`, from stage 289's branch (merged as #346 while this one was being built)
- **Decision:** ADR 0298 (the assistant answers in place)
- **Part of:** the briefs' universal voice assistant (A15, B8): answers in place and quick actions, on the web; the command center (A7). Items 14 and 5 in the order of work.
- **Migration:** none. **New dependency:** none. **New paid service:** none. **New provider:** none. **Model calls:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` (an answer is a sentence and rows, numbers only where they are real, "sample" said where it is one); `premium-app-ui` and `ui-ux-pro-max` (the answer where the question was asked, two-line rows, 44px fields and 16px text on a phone); `ecc-security-review` (a route with no parameter, read as the person; words alone change nothing; an error that says nothing of its cause).

## Why

After stage 289 a question asked from any page went to Chat. For a question about a person's own work that is the long way round: the answer was already worked out, by tested code, on the All work page.

## What was built

- **Four whole requests the palette answers or does itself** (`quickAction` in `src/core/assistant/quick.ts`): "what needs me?", "what is in progress?", "pause everything", "resume agents", each in the ways people put it. Anything else stays a question for Chat.
- **The answer, in the palette:** the board's own sentence, then the rows, each opening the page that owns it, then All work with how many more there are.
- **Ctrl or Cmd+K, then Enter:** with nothing typed, "What needs me?" is the first row.
- **Spoken in, spoken back.** A spoken question that only reads is answered as soon as it has been said, on the screen and aloud. A typed one is answered on the screen only.
- **The pause, in place:** "pause everything" shows the workspace's real pause control inside the palette. It still takes the press, and says why when this person can't.
- **One board, two places.** All work's reads moved into `src/server/command/load-work.ts`; the page and the new route `GET /app/work/status` both draw it.
- **`docs/farbaek/FARBAEK_VOICE_ASSISTANT.md`,** one of the documents the briefs ask for: what exists, the rules it keeps, and what comes next.

## What a person no longer has to do

- Go to All work, or to Home, to find out what is waiting for them.
- Find the pause on its page when something is going wrong.

## Verified

- **Tests,** all new unless said:
  - `core/assistant/quick.test.ts` (7): 21 wordings of "what needs me", 12 of "what is in progress", 14 of pause and 9 of resume are known; 36 phrases that only share their words are left as questions ("what needs to change in my essay", "how do I pause a video", "write a resume", "continue my work", "what's running on port 3000"); a very long line is turned away before any rule reads it; the rules stay quick on words short enough to reach them and built to make them work hard; only what reads is answered without a press.
  - `core/command/status.test.ts` (6): the board's own sentence and rows; a few listed and the rest counted; incomplete said as incomplete; sample said as sample, aloud too; someone else's changes never said as this person's; what is said aloud, and that every sentence ends as one.
  - `app/app/work/status/route.test.ts` (6): a signed-out person's redirect to sign-in passes through, and nothing is read for them; a server with no accounts says so; no workspace is said as that; the answer's exact shape, with the pause and the reasons worked out from the same read; incomplete and sample said; a failed read says so without its cause.
  - `server/command/load-work.test.ts` (8): a change is this person's turn only when they contribute and changes are on; a viewer's are counted as someone's; an owner or admin may approve a workflow; work in an archived project is left out; which part couldn't be read; the demo reads no agent builds; the workspace asked about is the one the person is in; why this person can't pause or resume, in the control's own words.
  - `components/app/command-match.test.ts` (changed, 14): a request leads when the words are that request, whole; only the one asked for is listed; a question that shares its words stays a question; a page that was named still opens; "What needs me?" first when nothing is typed.
  - The whole suite, run after the last change: 5,630 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed after the last change, with the 4 GB heap.
- **The project's own audits,** on the running demo: `qa:responsive --strict` on Home, All work, Tasks and Chat at 375, 1180 (touch) and 1280, 14 page views; `qa:a11y` on Home and All work: no findings.
- **Looked at in the demo workspace,** at 1280 and 375 px:
  - Ctrl+K then Enter answered in the palette: "One thing needs you. Nothing is in progress, and 3 are scheduled. This is the demo workspace's sample work.", with the waiting change as a row and All work under it;
  - Enter on the row opened that task;
  - "what needs me" typed was answered the same way, and nothing was said aloud;
  - "pause everything" led the list, and choosing it showed the pause control in the palette, with its button off and "The demo workspace is read-only." beside it;
  - typing again put the answer away;
  - after the review's fixes: "whats waiting for me" led with the answer; "continue my work" was left a question; "resume agents" showed the control under "Agents are running. Nothing is paused until you press the button below.";
  - All work itself said the same sentence as the answer;
  - the route answered 200 with `cache-control: no-store`.
- **A fresh review** of the change by a separate agent, after the first checks had passed. It found no way for one person to see another's work, nothing that pauses without the press, and no difference in the All work page. It found six real things, all fixed:
  1. a request chosen while the microphone was still listening was answered twice, the second cutting off the first as it was read aloud, and words heard afterwards were written over the answer: choosing now ends the listening;
  2. a note left by a blocked or missing microphone hid the answer's sentence, so its count, its "incomplete" and its "sample" were never shown: asking for an answer, or typing, puts the note away;
  3. a pause made in the palette brought its panel back over whatever the person had typed meanwhile, and a failed re-read replaced "Agents are paused." with "couldn't be read": the re-read changes nothing once the person has moved on, or when it fails;
  4. "continue my work", "resume my work" and "stop work" were read as requests to resume or pause everything, and "is anything waiting for me", "whats waiting for me", "pause all the builds" and "what do I need to do" were missed: "work" alone is no longer "everything", and the missed wordings are known, each with its test;
  5. three tests could not have failed: the route's test checked reasons its own stand-in had made up, nothing kept a signed-out person's redirect out of the "couldn't be read" answer, and the timing test's inputs were turned away by the length check before any rule read them. The real reads and reasons have their own test now, the redirect has one, and the rules are timed on words short enough to reach them;
  6. the pause appeared in the palette with nothing said to a screen reader, and the demo's answer was said aloud without "sample": a line above the control says nothing is paused until the button is pressed, and the spoken answer says it is sample work.
- **Left as it is, and written down** (ADR 0298): a spoken answer uses the browser's voice, which on some phones is a network voice, so the names said aloud go where the browser sends them, as the spoken question did.
- **The fixes were checked by the tests and in the demo, not by a second review.**
- **Not verified:**
  - **Speaking into it, and hearing the answer.** Nothing was spoken here. That a spoken question is answered at once and aloud, and a typed one silently, is read from the code; only the typed half was seen.
  - **Pausing and resuming from the palette on a real workspace.** The demo is read-only, so the button was off. The control and its server action are the All work page's own.
  - **A real person's board on production,** through the route.
  - **Safari, Firefox and a real phone.**

## Next

- After the merge: Ctrl+K and Enter on production, compared with All work; speak the question if the owner's browser allows the microphone.
- Acting from a row (approve, answer, run now), each with its real button.
- More questions from a person's own records: one named project, what is scheduled today, what finished since yesterday.
