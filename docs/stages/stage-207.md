# Stage 207: Chat remembers what it is asked to, keeps long conversations whole, and shares its sources

- **Date:** 2026-11-20
- **Branch:** `feat/stage-207-chat-memory` (built on stage 206's branch)
- **Decision:** ADR 0224
- **Migration:** v101, `supabase/migrations/20270111090000_chat_memory.sql`, SHA-256 `7b04d734cf074691f3aaa86eb7090c6a4df9b83666cacbcaf80324b3c85ce2f8` (of the file as it is in this checkout, with Unix line endings). Apply and read back before the merge (below). **New dependency:** none.

## What the owner asked

After stage 206's report listed what wasn't done, the owner asked for all of it to be finished in the same session. This stage is the part that belongs to Chat itself: sources on shared chats, long conversations, and memory.

## What was built

- **Sources on a shared chat.** The shared-chat read returns an answer's `search` facts and nothing else from its meta; `src/server/chat/share.ts` checks them like any saved answer's; the page draws citations as links and the closed Sources button.
- **Memory** (`src/core/chat/memory.ts`): a request to remember is read from the person's own message in English, Sinhala in English letters and Sinhala; their own words are saved (`app_chat_remember`), never anything a model or a page wrote; what is remembered goes beside the system prompt as information about the person; the model is told what came of a request and the answer shows it in a line. In Chat's settings: the list, Forget, Forget everything, a box to add one, and a switch. In the account export; gone when the person leaves the workspace.
- **Long conversations** (`src/core/chat/summary.ts`): after 64 messages since the last summary, the fast model folds all but the newest 24 into a summary, saved against the last message it covers; later turns read it at the head of the conversation. Made after the answer is delivered, on its own reservation.
- **The migration**: `chat_memories`, `chat_summaries`, `app_chat_remember`, `app_chat_forget`, `app_chat_save_summary`, `app_chat_memories_export`, a trigger that removes a departing member's memories, and the shared-chat read with one key added (copied by script from the migration that made it, so nothing about who may open a link was retyped).
- Also: the verb "live" no longer counts as a word for now ("I live in Kandy" was searched); a message that only asks for something to be remembered isn't searched.

## Verified

- **The database** (`tests/db/chat-memory.test.ts`, the real migrations on a local Postgres): a link shows an answer's search facts and none of its routing facts; a summary is written only on the person's own message, read only by them, replaced when written again, refused when empty or too long, and goes with the conversation; a remembered line is tidied and kept once, private to its person even from a member of the same workspace, refused when empty, over 300 characters, from a stranger or the fifty-first; forgetting removes one, never someone else's, then everything, and is refused outside the workspace; nobody reads or writes either table around the functions; the export lists them; leaving the workspace removes them.
- **The rules** (`src/core/chat/memory.test.ts`): ten requests to remember in three ways of writing give the person's own words; ten look-alikes (a question, a reminder, a story, a paste, something too long) give nothing; a key is never kept; the note lists the newest first within its limit and a line can't break out of it; summaries are due only after enough is said, build on the one before, stand in for what they cover, and are given to the model as a description.
- **The turn** (`src/server/chat/turn.test.ts`): what is remembered goes beside the system prompt and never into it or the messages; switched off, it isn't read; a request is saved in the person's words, isn't searched, and is recorded on the answer; full, off and failed are each told to the model; asking again doesn't save twice; a saved summary replaces the messages it covers and less is reserved; a due summary is made only after the answer, on its own reservation, against the right message, from the right messages; one that fails is refunded and breaks nothing; a short conversation is never summarised.
- The chat and web suites: 449 tests pass. The type check, lint and the whole suite: see the end of this record.

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
