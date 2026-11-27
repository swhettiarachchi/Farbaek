# Farbaek voice assistant

What the owner's briefs ask of a voice assistant (A15, B8), what exists today, and what comes next. A line says "built" only when it has a test or a look in a browser behind it; the stage and the ADR are named so the claim can be checked. Nothing here has been spoken into on a real device by the team writing it: where that matters, the line says so.

Last updated: 2026-11-27 (stage 290).

## What the briefs ask for

An assistant reachable from anywhere, by voice or by typing: on every page of the web app, and on the phones through what each platform supports (Android's assistant role, shortcuts and App Functions; the iPhone's Siri, Shortcuts, App Intents and Action Button). It answers, does quick things in place, speaks back, and works in Sinhala as well as English.

## Where each part stands

| Part | State | Where |
| --- | --- | --- |
| Dictation into Chat's box | Built, with the browser's own recogniser | ADR 0213, `src/components/chat/` |
| An answer read aloud in Chat | Built, with the browser's own voice | `src/components/chat/use-speaker.ts` |
| Survey Studio's drafting assistant: push to talk, live talk, hearing on the computer where the browser can | Built | ADR 0210, `src/components/survey/assistant/` |
| Asking from any page, typed | Built: the palette (Ctrl or Cmd+K) hands a question to Chat, where the person sends it | Stage 289, ADR 0297 |
| Asking from any page, spoken | Built, not spoken into here: a microphone beside the sidebar's search box opens the palette listening; the palette has its own | Stage 289, ADR 0297 |
| Answers in place | Built for two questions about a person's own work: what needs me, and what is in progress. Answered from the All work board, with no model | Stage 290, ADR 0298 |
| Spoken answers | Built for those two, when the question was spoken. Not spoken into or heard here | Stage 290, ADR 0298 |
| Quick actions that do work | Built for one: the workspace's pause, shown in place with its real button. Words alone never press it | Stage 290, ADR 0298 |
| An answer from a model in place, without opening Chat | Not built | After this |
| A question about one named thing ("how is the storefront build going?") | Not built | After this |
| A language picked for listening | Not built: it uses the browser's own language | After this |
| Sinhala listening and a Sinhala voice | Not built. The research found no dependable Sinhala voice and uneven Sinhala recognition between browsers | `reports/Voice drafting assistant technology.md` |
| Listening on Farbaek's server | Not built. It would need a speech model run or bought, a new place for audio to go, and the person's agreement | Needs a decision |
| A floating orb | Decided against for now: a round button fixed over the page covered the ends of list rows. The microphone is in the frame instead | ADR 0297 |
| Android: assistant role, shortcuts, App Functions | Not started | The Android app, with a release the owner publishes |
| iPhone: App Intents, Siri, Shortcuts, Action Button | Not started | The iPhone app, with a build the owner publishes |

## The rules it keeps

- **The browser hears, not Farbaek.** Listening is the browser's own recogniser. Which company receives the sound is the browser's choice (Chrome sends it to Google, Edge to Microsoft, Safari uses Apple's dictation); no audio reaches Farbaek's server. Where a browser has no recogniser, no microphone is shown.
- **Nothing is sent by speaking.** Spoken words land in a box. A question for a model waits in Chat's box until the person sends it.
- **Words alone change nothing.** A recogniser mishears. A request that changes something shows its real button, with the same roles and the same server check, and waits for the press.
- **A spoken question that only reads is answered at once,** from the person's own records, read as them.
- **Spoken in, spoken back; typed in, shown.** Nothing is read aloud to someone who typed. The voice is the browser's own; on some phones it is a network voice, so what is said aloud goes where the browser sends it.
- **One microphone at a time.** Starting to listen in one place ends the listening anywhere else and hands it its words.
- **Listening is for one question.** A short silence ends it. Typing over what was heard takes the box back. Closing the palette drops what was being heard.

## How it is put together

- `src/components/survey/assistant/use-speech.ts`: the one hook over the browser's recogniser, used by Chat's box, Survey's assistant and the palette.
- `src/components/chat/use-speaker.ts`: the one hook over the browser's voice.
- `src/components/app/command-palette.tsx`: the palette, where a person asks from any page.
- `src/components/app/command-match.ts`: what leads the palette's list, with its tests.
- `src/core/assistant/quick.ts`: the few whole requests answered or done in place, with its tests.
- `src/core/command/status.ts` and `work-status.ts`: the All work board said short, and what is said aloud.
- `src/app/app/work/status/route.ts`: the read-only route the answer comes from.

## What comes next, in order

1. Speak into it on production, in Chrome and on a phone, and fix what that shows.
2. More questions answered from a person's own records: one named project or build, what is scheduled today, what finished since yesterday.
3. Acting from a row of an answer (approve, answer, run now), each with its real button.
4. A language picked for listening, kept with the person's other choices.
5. The phones. Each platform's features have to be read in its current documentation when this is built, and each needs a store release, which is the owner's step. `FARBAEK_ANDROID_SPEC.md` and `FARBAEK_IOS_SPEC.md` are written with that stage, not before it.
