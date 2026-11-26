# Stage 282: a chat knows the project it is filed under

- **Date:** 2026-11-26
- **Branch:** `feat/stage-282-chat-knows-project`, from `main` after stage 281 was merged (#338)
- **Decision:** ADR 0290 (a chat knows the project it is filed under)
- **Part of:** Telepathy, part 1 (project awareness). The briefs' order of work, item 6.
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `ecc-security-review` (what leaves for a provider, reading as the person, names that try to be instructions); `farbaek-ui` and `farbaek-human-made` (one quiet line in the header, a plain switch, sentences in the details).

## Why

The owner told me not to stop until the platform is built, and the briefs' order of work put Telepathy part 1 next. A chat could be filed under a project and knew nothing about it: "what is left to do on this?" was answered from nowhere.

## What was built

- **A brief of the project beside the person's message** (`core/chat/project-brief.ts`): its name and description, whether its site is live, its files by name (up to 36, a few from each folder, the rest counted) and its tasks with the state each is in (up to ten, the rest counted).
- **Names and states, never contents.** No file is opened. The model is told it hasn't read the files.
- **A record, not instructions.** Every name is one plain line, cut safely, inside quotes or backticks it cannot close.
- **Read as the person** (`server/chat/project-facts.ts`). A part that couldn't be read is said to be unread, never empty. A slow read is left behind after two and a half seconds.
- **Questions about the project aren't sent to the web for their words** ("current", "latest", "right now"): the search planner decides, and is told the record exists.
- **The person sees it and controls it:** a line in the chat's header, a line in the answer's details, and a switch in Chat's settings under its own heading.
- **Beside it:** the Scheduled page now says "within a minute" while the every-minute tick is arriving, and "within 15 minutes" otherwise (the owner switched the timer on today).

## What a person no longer has to do

- Explain their own project to Chat before asking about it.
- Open the project to see what is waiting, what is verified and whether the site is live: they can ask.

## Verified

- **Tests,** new unless said:
  - `core/chat/project-brief.test.ts` (15): what the brief says; nothing for no project; a part that couldn't be read is unread, not empty; more tasks than were read is a least; a name with line breaks stays one line; a name can't close its quotes or backticks; hidden and reordering characters go while Sinhala's and Persian's joiners stay; a cut never splits a character; never over the limit for 5,000 files and 200 tasks; which files are named, a few from each folder; one sort however often it is fitted; the same note whatever order files came in; the planner's sentence.
  - `server/chat/project-facts.test.ts` (7): what is read; only this project in this workspace; nothing for a project the person can't open; a failed part is unread; forty tasks means there may be more; archived; a file's path and nothing else of it.
  - `server/chat/turn.test.ts` (14 new): a chat started inside a project is told beside the message and the answer records it, from its first moment; a filed chat is told on every question; a chat with no project reads nothing; switched off, nothing is read, for a new chat and for a filed one asked again; a project that can't be read, or is slow, never stops the answer; room is reserved; a name like an instruction stays a name; a continued answer keeps what it was told; a picture reads no project; a question about the project goes to the planner with the record named, and an explicit search is searched; the system prompt says what the note is.
  - `server/web/research.test.ts` (one new): the planner's input carries what the model already has, on one line.
  - `server/automation/minute-tick.test.ts` (5): not running before a tick, running for three minutes after one, off after three missed, never for a tick in the future, one value for the process.
  - The whole suite: 5,508 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed, with the 4 GB heap its type check needs on this PC.
- **In the demo workspace, in a real browser** (before the review's fixes): a new chat opened inside the Storefront project showed "Farbaek AI knows Storefront by its files and tasks" in its header, and Chat's settings showed the switch with its explanation, at phone width.
- **Not verified:**
  - **A real answer.** The demo can't send, so no model has been given a brief yet. To be asked on production after the merge: a chat filed under a real project, "what is left to do?".
  - **The header and settings after the review's fixes** (the demo now says "Filed under", the switch has its own section): type-checked and tested, not looked at again.
  - **The Scheduled page's line on production,** where the minute tick is on.

## A fresh review, before the PR

A fresh agent read the brief, its reading and the turn. Nine real faults, all fixed with tests:

1. **A cut could split a character pair** (an emoji at the limit). The note and the saved details then held half a character, which the database refuses: the answer would never have finished saving.
2. **Joiners were turned into spaces,** breaking Sinhala, Indic and Persian words; and some invisible characters were kept.
3. **A name could close its own quotes** and carry on in the note's voice, or forge a second task; paths weren't quoted at all.
4. **The feature's own questions were sent to the web:** "what is the current status of the project?" was searched by its words, with no model in the loop.
5. **A read that failed was told as a fact:** "Files: none yet", "Site: not published yet".
6. **"And N earlier" was wrong** for a project with more than forty tasks.
7. **A continued answer lost what it had been told,** and the details line only showed after a reload.
8. **The header line vanished after the first message** in a chat that wasn't in the sidebar's list.
9. **Every fitting pass sorted all the paths again:** 162 ms of blocked time at 3,000 files.

Also changed from its notes: a few files from each folder; files give way before tasks; a read is capped at two and a half seconds; the demo says "Filed under"; the details line wraps; "not named here" when no file is named; the Projects switch has its own section; the ADR's token figure.

Checked by the reviewer and found sound: no project from another workspace can be read (every read carries the workspace and runs as the person), shared chats carry no project, and the note never exceeds its limit.

## Next

- Ask a real question in a filed chat on production.
- Telepathy part 1, the rest: suggested next steps with their reasons and a way to dismiss them; one memory across spaces.
- Reading a file's contents when a question needs it.
