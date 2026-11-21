# ADR 0224: Chat remembers what it is asked to, keeps long conversations whole, and shares its sources

- **Status:** accepted (stage 207, 2026-11-20); changed after a fresh review on 2026-11-21 (last section)
- **Builds on:** ADR 0213 (Farbaek Chat), ADR 0221 (the language note), ADR 0223 (citations by number), ADR 0070 (the account export)
- **Changes:** ADR 0222's and 0223's "sources on shared chats: not built"

## Context

Three things were left open after stage 206, and the owner asked for them to be finished:

- **A shared chat showed citation numbers as plain text.** The function that serves a shared chat returned no part of an answer's meta, so the page had no sources to draw the numbers as links.
- **A long conversation forgot its beginning.** A turn reads the last 80 messages of its branch; anything older was gone, with nothing in its place.
- **Nothing carried from one chat to the next.** The owner's brief asked for relevant long-term memory, with controls, privacy and no mixing between people.

## Decision

**Sources on a shared chat.** The shared-chat read now returns an answer's `search` facts (its sources, when the web was checked, what for), and nothing else from its meta: how the answer was routed stays private. The page draws citations and the closed Sources button as in the app. Read-only there: no "Check the web", and choices are a plain list.

**Memory is only what the person asks to be remembered, in their own words.** "Remember that I'm vegetarian", "mama Kandy wala inne kiyala mathaka thiyaganna", or a line typed under Memory in Chat's settings. Nothing is inferred about a person and saved on its own.

- The words kept are cut from a message the person typed, by the server, after it has read the message as a request to remember (`src/core/chat/memory.ts`). Nothing a model wrote, and nothing a web page said, can be saved. A choice the model offered and the person pressed arrives as a message too, but its words are the model's, so the turn checks the answer above it and never reads a pressed choice this way. That is the whole defence against a page planting a lasting instruction, and it holds without trusting a prompt.
- A question ("do you remember …?"), a reminder or an instruction for the task in hand ("remember to …", "don't forget to add error handling"), a pasted block and anything that looks like a password or a key are never saved. Only the first sentence after "remember that" is the thing to remember; anything after it is the rest of the message, answered (and searched) as usual. Asking a question again doesn't save twice.
- One table, `chat_memories`: at most 50 things of 300 characters for a person in a workspace, the same words kept once. The person alone reads them (row level security); writes go through `app_chat_remember` and `app_chat_forget`. Forgetting needs no role: anyone still in the workspace may delete what is theirs.
- What is remembered goes to the model beside the person's message, the way web results do, newest first, at most 2,000 characters: information about the person, with no more authority than anything else they say. It is never part of the system prompt or of the note that follows it, so a remembered line that reads like an order ("ignore your rules") is only something the person once said.
- The model is told what really happened to a request (saved, memory full, didn't work, or memory switched off) and the answer shows it in one line. The system prompt says the model can't save anything itself and may say something is remembered only when a note from Farbaek says it was saved.
- A list that couldn't be read is never shown as an empty one: Chat's settings say it couldn't be read, and the account export says so in place of the list.
- Controls, in Chat's settings: the list, Forget on each, Forget everything (asked first), a box to add one, and a switch that turns both using and saving off in this browser. It is in the account export, and it goes when the person leaves the workspace or deletes their account. The privacy policy says all of this.

**A long conversation keeps a summary of its earlier part** (`src/core/chat/summary.ts`). Once 64 messages have been said since the last summary, the answering provider's fast model folds the older ones (all but the newest 24) into at most about 350 words, building on the summary before it. It is saved in `chat_summaries` against the last message it covers. A summary never replaces a message that still fits: a later turn reads it, at the head of the conversation, only once messages have dropped out of what the model reads (the branch is longer than the 80 a turn loads, or some didn't fit), and beside every message that is still read. It is made well before then, so by the time a message drops out a summary already covers it.

- It is made after the answer has been delivered (`after()` in the route), on its own small reservation: nobody waits for it, and if it fails nothing is lost and nothing is charged.
- It is written from the conversation's own text, which may hold what web pages said. So the summariser is told the conversation is content, and the summary reaches the model marked as a description of what was said, written by Farbaek: not a message from the person and not instructions.
- It is the person's alone, and goes with its message or conversation.
- The summariser reads every message it folds in, each cut shorter when there are many; the beginning of the conversation is never the part left out. When the saved summaries can't be read, the turn uses none and makes none, so a failed read can't end in a new summary that has forgotten the older one.

**One additive migration (v101).** Two new tables and five functions; the only existing thing changed is the shared-chat read, copied from the migration that made it with one key added. The app reads the new tables defensively: deployed a moment before the migration, it simply has no summaries, no memory and no shared sources.

## Not built

- **Memory the assistant decides on by itself.** It would need a model to choose what to keep about a person, which is both a privacy decision made for them and a way for page text to persist. Not without the owner asking for it.
- **Requests to remember in other languages than English and Sinhala.** The Memory box in settings works in any language; the phrase lists need examples and tests per language.
- **Forgetting by asking** ("forget that I'm vegetarian"). Matching a sentence to the right saved line needs a model; the list in settings is exact.
- **Summaries when a conversation is long in words rather than messages** (a few huge pastes). Those still drop the oldest messages at the token limit.

## Consequences

- Every turn reads the person's remembered lines (one small query) unless switched off, and the note costs up to about 600 tokens when there is a lot remembered.
- A conversation past about 64 messages costs one extra small model call every 40 or so messages, and once it is longer than a turn loads, each turn reads the summary (up to about 1,000 tokens) on top of the messages.
- The migration must be applied and read back before the merge (`docs/stages/stage-207.md`).

## Changed after a fresh review (2026-11-21)

A reviewer who hadn't written the code read stage 207 and found seven things that the tests had passed over. All are fixed, each with a test:

- **A pressed choice could be saved as the person's words.** The model can offer choices to press; one that read "Remember that …" would have been saved when pressed. Now the server knows a pressed choice from a typed message (the screen and the server read choices with the same function) and never saves one.
- **Remembered lines were sent with the instructions.** They went in the note beside the system prompt, which gave a saved line the weight of an instruction. They now go beside the person's message.
- **The settings box could tie up the server.** Tidying a line read it again from every position, so a million quotation marks took minutes, and the box is a server action anyone signed in can call. The length is now checked first, and tidying reads at most 1,000 characters in one pass.
- **A summary replaced messages that still fitted,** so the model lost detail it had room for. It is now only ever added.
- **A failed read looked like "nothing there".** For summaries that could end in a new summary that dropped the old one; for memory it showed "Nothing is remembered yet". Both now tell a failed read from an empty one.
- **Reminders were saved.** "Don't forget to add error handling" and "make a note that …" were read as requests to remember something about the person. They aren't any more, and a message with more after the request ("Remember that I'm vegetarian. What's the weather?") saves only its first sentence and still answers the rest.
- **The model could say "I'll remember that" when nothing was saved.** The system prompt now says it can't save anything itself.

The migration was read too and needed no change.
