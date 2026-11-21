# Stage 207: Chat remembers what it is asked to, keeps long conversations whole, and shares its sources

- **Date:** 2026-11-20; a fresh review and its fixes on 2026-11-21 (below)
- **Branch:** `feat/stage-207-chat-memory` (built on stage 206's branch)
- **Decision:** ADR 0224
- **Migration:** v101, `supabase/migrations/20270111090000_chat_memory.sql`, SHA-256 `7b04d734cf074691f3aaa86eb7090c6a4df9b83666cacbcaf80324b3c85ce2f8` (of the file as it is in this checkout, with Unix line endings). Apply and read back before the merge (below). **New dependency:** none.

## What the owner asked

After stage 206's report listed what wasn't done, the owner asked for all of it to be finished in the same session. This stage is the part that belongs to Chat itself: sources on shared chats, long conversations, and memory.

## What was built

- **Sources on a shared chat.** The shared-chat read returns an answer's `search` facts and nothing else from its meta; `src/server/chat/share.ts` checks them like any saved answer's; the page draws citations as links and the closed Sources button.
- **Memory** (`src/core/chat/memory.ts`): a request to remember is read from the person's own message in English, Sinhala in English letters and Sinhala; their own typed words are saved (`app_chat_remember`), never anything a model or a page wrote, and never a choice the model offered and the person pressed; what is remembered goes beside the person's message as information about them, never with the instructions; the model is told what came of a request and the answer shows it in a line. In Chat's settings: the list, Forget, Forget everything, a box to add one, and a switch. In the account export; gone when the person leaves the workspace.
- **Long conversations** (`src/core/chat/summary.ts`): after 64 messages since the last summary, the fast model folds all but the newest 24 into a summary, saved against the last message it covers; a later turn reads it at the head of the conversation once messages have dropped out of what the model reads, beside every message that is still read. Made after the answer is delivered, on its own reservation.
- **The migration**: `chat_memories`, `chat_summaries`, `app_chat_remember`, `app_chat_forget`, `app_chat_save_summary`, `app_chat_memories_export`, a trigger that removes a departing member's memories, and the shared-chat read with one key added (copied by script from the migration that made it, so nothing about who may open a link was retyped).
- Also: the verb "live" no longer counts as a word for now ("I live in Kandy" was searched); a message that only asks for something to be remembered isn't searched.

## Verified

- **The database** (`tests/db/chat-memory.test.ts`, the real migrations on a local Postgres): a link shows an answer's search facts and none of its routing facts; a summary is written only on the person's own message, read only by them, replaced when written again, refused when empty or too long, and goes with the conversation; a remembered line is tidied and kept once, private to its person even from a member of the same workspace, refused when empty, over 300 characters, from a stranger or the fifty-first; forgetting removes one, never someone else's, then everything, and is refused outside the workspace; nobody reads or writes either table around the functions; the export lists them; leaving the workspace removes them.
- **The rules** (`src/core/chat/memory.test.ts`): ten requests to remember in three ways of writing give the person's own words; look-alikes (a question, a reminder, an instruction for the task, a story, a paste, something too long) give nothing; a message with more after the request gives only its first sentence; a key is never kept; tidying and the settings box are quick on a million characters; the note lists the newest first within its limit and a line can't break out of it; summaries are due only after enough is said, build on the one before, leave out no message, and are given to the model as a description.
- **The turn** (`src/server/chat/turn.test.ts`): what is remembered goes beside the person's message and never with the instructions, and room for it is reserved; switched off, it isn't read; a request is saved in the person's words, isn't searched, and is recorded on the answer, also when the answer is continued; a pressed choice is never saved; a message that asks for more saves its first sentence and is still searched; full, off and failed are each told to the model; asking again doesn't save twice; a saved summary is never read in place of messages that fit, and goes at the head once the branch is longer than a turn loads; when summaries can't be read none is used and none is made; a due summary is made only after the answer, on its own reservation, against the right message, from the right messages; one that fails is refunded and breaks nothing; a short conversation is never summarised.
- The type check, lint and the whole suite: see the end of this record.

## Not verified

- **On production.** The migration isn't applied yet, so memory, summaries and shared sources have only run against the local test database and stand-in models. After the migration and the merge: share a chat with a sourced answer and open the link signed out; say "remember that …" in a chat, see it under Memory, start a new chat and see it used; forget it; download the account data.
- **What the model does with the note**: whether it uses a remembered fact naturally, and whether it ever recites the list. That needs live answers.
- **A real summary's quality**: whether 350 words keep what matters of forty turns. It needs a real long conversation; the first one past 64 messages will show it.

## Apply v101 before the merge

```
powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\apply-migration.ps1" -File "supabase\migrations\20270111090000_chat_memory.sql" -Sha256 7b04d734cf074691f3aaa86eb7090c6a4df9b83666cacbcaf80324b3c85ce2f8 -Check "select to_regclass('public.chat_memories') is not null and to_regclass('public.chat_summaries') is not null"
```

Then `scripts/vps/check-migrations.ps1`, which now reads v101 back too (the two tables, and that the shared-chat read carries `search`). If the first script refuses the hash, the file's line endings changed on checkout: say so and it will be re-hashed, never forced.

The app is written to run without the migration (no memory, no summaries, no shared sources, nothing broken), so the order protects features, not uptime.

## A fresh review, and what it found (2026-11-21)

Every check had passed when a reviewer that hadn't written the code read this stage. It found seven real faults. All are fixed, each with a test; ADR 0224 has the reasons.

| What was wrong | What it could have done | Now |
| --- | --- | --- |
| A choice the model offered ("Remember that …") was saved when pressed | A web page, through the model, plants a lasting line in someone's memory | The server tells a pressed choice from a typed message and never saves one (`offeredChoices`, shared with the screen) |
| Remembered lines were sent in the note beside the system prompt | A saved line read as an instruction in every later chat | Sent beside the person's message, like web results, said to be what they told Farbaek about themselves |
| Tidying a line read it again from every position, and the settings box is a server action | One request with a million quotation marks tied up the server for minutes | Length checked before anything reads it (`memoryToSave`); tidying reads 1,000 characters in one pass |
| A summary replaced the messages it covered, even when they still fitted | The model lost detail it had room for | Only ever added: read once messages have dropped out, beside the ones still read |
| A failed read of summaries or memory looked like "none" | A new summary written over an unread older one; "Nothing is remembered yet" shown when the list couldn't be read; an export that left memory out silently | A failed read is told apart everywhere: no summary used or made, the list says it can't be shown, the export says so |
| "Don't forget to add error handling", "make a note that …" were read as requests to remember | Task instructions piling up in someone's memory; the rest of a longer message swallowed, and not searched | Reminders and task instructions aren't requests; only the first sentence is kept and the rest is answered as usual |
| The model could answer "I'll remember that" when nothing was saved | A promise Farbaek didn't keep | The system prompt says it can't save anything itself and when it may say something is remembered |

Also fixed: a continued answer lost its record of what was saved; a stopped answer wasn't charged for the memory and summary it had read; "its ownAnthropic key" on the privacy page.

The migration was read and needed no change, so its hash is the same.

One limit that remains: if making a summary fails many times in a row, until the last saved one is more than 80 messages back, the next summary starts fresh and the part before it is lost to the model (the messages themselves are always kept and shown). A summary is tried again after every answer, so it would take about eight failures in a row.

## Checks at the end

Run on 2026-11-21, after the review's fixes, for stages 207 and 208 together:

- `pnpm typecheck` and `pnpm lint`: clean.
- `pnpm test`: 477 files and 4,189 tests pass, 17 skipped (4,156 before the review's tests were added). The run also reported one error that isn't a test: `src/agent-runtime/mesh/mesh.test.ts` (last changed on 2026-11-12, not part of this work) sometimes leaves a rejected promise when a temporary folder can't be removed on Windows (`ENOTEMPTY`). Run alone three times it happened once; all 57 of its tests pass each time. It makes `pnpm test` end as failed on this PC when it happens, and is worth its own fix.
- After the last edits: the type check, lint, and the design, chat, agent and web suites again (50 files, 746 tests pass).
- In a browser (demo workspace, development server): Chat's settings show the Memory section with its switch, the box to add one and the note about where what's remembered goes. The demo can't read a list, and the section now says the list isn't available with the reason under it, where before the review it said "Nothing is remembered yet". The sample chat with sources still draws its citations. No console errors.
