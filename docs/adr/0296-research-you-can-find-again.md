# ADR 0296: Research you can find again

- **Status:** accepted (stage 288, the Farbaek program, 2026-11-27)
- **Builds on:** ADR 0222 and ADR 0223 (live web research in Chat, with numbered sources and a check of each citation against its page, kept with the answer), ADR 0278 and ADR 0282 (scheduled tasks and agents, each run a Chat turn in the task's own conversation), ADR 0280 (Chat offers to schedule a request said with a time), ADR 0295 (one list of places).
- **Changes:** a new place, Research, and what Chat does with a question handed over from it. No migration, no new dependency, no paid service.
- **Part of:** the briefs' Research Studio (A19, B10, B11): saved research, first step. What is still to do is under "Not yet".

## Context

Research lived inside Chat. A person who had asked a question that read twelve pages last week could only find it again by remembering which conversation it was in. The briefs ask for a Research Studio with saved research.

Everything needed was already kept. An answer that reads the live web saves, with itself, when it searched, what it searched for, the pages by number, which of them it cites, how far it went, and how its citations checked against the pages. So this decision stores nothing new: it lists what is there.

## Decision

**Research is a place: a box that starts a piece of research, and everything a person has researched, findable again.**

- **A row is an answer that searched the web and kept at least one page,** said from its own record, in the words Chat uses for the same facts:
  - the question, as its title;
  - what it was, in one sentence: a quick check, a search, a deep study or a roundup, and what it cited of what it checked ("3 sources cited, of 4 pages checked"). An answer that cited nothing says so. An older answer, from before citations were counted, says only how many pages it checked;
  - how its citations checked, in the check's own terms: "The names and numbers cited were found on 2 of 3 cited pages." The check looks for the names and numbers of the citing sentences on the page. It never says an answer is verified, and neither does this;
  - the first three sites it cites, named by their address as Chat names them and never by what a page calls itself, with "and others" only when there were more sites than that;
  - the day, and the project it is filed under.
  - A row opens its conversation in Chat.
- **Two lists.**
  - **Your research:** what the person asked for. A question answered again is listed once, by its newest answer. Sixty at most, newest first.
  - **Kept up to date:** what a scheduled task or an agent researches by itself, one row for each task's conversation, by its latest run. Every run asks the same thing again in the same conversation, so listed with the rest an hourly task would push everything the person asked for off the page within days.
- **What is left out:** answers that didn't search, searches that failed or kept no page, and archived conversations. Finished answers and stopped ones are both read: a stopped answer keeps what it read.
- **Whose.** Read as the signed-in person, so the database's row rules decide: nobody's research is listed for anyone else, in the same workspace or another.
- **When it can't be read,** the page says so. It never says there is none. If only the list of tasks or a question's words can't be read, the rows are still listed, without that grouping or with their chat's name as the title.
- **Only the listed rows' questions are read,** since a question can be a pasted document.
- **The box hands the question to Chat,** where research is done. It waits in Chat's box for the person to send, as a question from Home does. Sent as it was handed, that message asks for the live web even where the person's web switch is off. If something else is sent first, the hand-over is over; if the send fails, the same question sent again still asks. The question is kept in the browser only, never in the address.
- **A place in the one list** (ADR 0295), after Build, with the magnifier Chat's own "Research anything" card has. On a phone it is under More: the five tabs stay five.
- **The demo** shows research made from its sample chats by the same rules, labelled as a sample.
- **One rule in tested code** (`src/core/research/library.ts`): what counts as research, its title, its sentences.

## Consequences

- Research is found by what was asked and when, not by remembering a conversation.
- **The list is only as old as the record:** answers from before pages were kept with an answer (stage 205) aren't in it.
- **It reads a person's answers to find the ones that searched:** the 160 newest of their own and the 120 newest of their tasks'. That is small today. A person with years of research will want an index kept for this, and that needs a migration.
- A new place makes Chat's strip five icons and the rail ten. Chat's folded rail is taller by one icon, and scrolls on a screen under about 730 px tall.
- **Not yet:**
  - a report saved on its own, with a name, apart from its conversation;
  - opening the conversation at the answer itself: it opens at its latest message, so an answer on a branch that isn't showing, or far back, isn't on screen. An edited question is listed as two;
  - searching the list, and a filter by project;
  - what changed since the last run, for research kept up to date;
  - a project told about the research filed under it (ADR 0290's brief);
  - research on X (needs the owner's xAI key).

## Verified

See `docs/stages/stage-288.md`.
