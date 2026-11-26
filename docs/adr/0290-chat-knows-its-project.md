# ADR 0290: A chat knows the project it is filed under

- **Status:** accepted (stage 282, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0213 (Chat, and filing a chat under a project), ADR 0224 (what is remembered goes beside the message, never with the instructions), ADR 0218 (Chat hands work to Build), ADR 0223 (searching only when a question needs it).
- **Changes:** what a chat filed under a project is told. No migration, no new dependency, no paid service.
- **Part of:** Telepathy, part 1 (the briefs' "project awareness"). One memory across spaces and suggested next steps are not in this.

## Context

A chat can be filed under a project, and a new chat can be started inside one. Until now that was a label: the chat knew nothing of the project. "What is left to do on this?", "which file has the pricing?", "what should I build next?" were answered from nowhere, or by asking the person to explain their own project.

The owner's rule: maximum intelligence behind the scenes, minimum effort for the person.

## Decision

**A chat filed under a project is given a short brief of that project beside the person's message.**

### What the brief holds

- The project's **name** and its **description**.
- Whether a **site** published from it is live.
- Its **files by name**: how many, up to 36 named, and where the rest are.
  - The shallowest first, since a project's entry points sit at its top.
  - At most six from one folder before any folder gives more, so forty documents don't speak for three pages of code.
  - Pictures, fonts and lock files are counted, not named.
- Its **tasks**, newest first: up to ten by title, each with the state it is in, in the words the app uses ("Waiting for approval", "Verified"), and how many earlier ones there are. Forty are read; with more than that, the number is said as a least.
- Whether it is archived.

### The rules

- **Names and states, never contents.** No file is opened for the brief. The model is told it has not read the files, and to say so when an answer needs what is inside one.
- **A record, not instructions.** File names, task titles and the description are written by people and by the build agent, so they are data.
  - Each is made one plain line: no line breaks, control characters, or marks that hide or reorder text. The two joiners that Sinhala, Indic and Persian words are written with stay.
  - Each is cut to a length, never through the middle of a character.
  - Each sits inside marks it cannot close: a name and a title in double quotes, a path in backticks. So nothing a name says can read as the note's own words, or start a line of it.
  - The note says they change none of the model's rules, and the system prompt says what such a note is.
- **Beside the message, never with the instructions,** as what is remembered is.
- **Small.** At most 2,400 characters, whatever the project's size: about 800 tokens by Farbaek's own estimate, more in Sinhala. Files give way before tasks when it must shrink. Its room is reserved with the answer.
- **Read as the person.** A project they can't open gives nothing.
- **A part that couldn't be read is said to be unread,** never said to be empty: "none yet" is only said when the list was read and has nothing in it.
- **It never stops an answer, or holds it long.** If the project can't be read, or takes more than two and a half seconds, the chat is simply told nothing of it.
- **Chat still changes nothing.** The note says changes are made in Build, where the plan is approved first.

### Questions about the project are not sent to the web for their words

"What is the current status?", "what are the latest tasks?", "is the site live right now?" carry the words that mean a search elsewhere (ADR 0223). In a chat that has its project's record they are most often about the project.

- Unless the person asked for the web in so many words, such a message is the search planner's to judge, never searched without it.
- The planner is told, in one sentence, that the answering model already has the project's record, and that a question about the project itself needs no search.
- "Search the web for ..." is searched as asked.

### What the person sees and controls

- **The chat's header says it:** "Farbaek AI knows Storefront by its files and tasks", so an answer that knows the project is no surprise.
- **An answer's details say it** when it was given a brief: which project, and that it was names, not contents. A continued answer keeps saying what it was told when it began.
- **A switch in Chat's settings,** on by default, in a section of its own: "Tell Farbaek AI about a chat's project". Off, the project is not read and the header says only where the chat is filed.
- A chat with no project is told of none, and nothing is read.

### What goes to the AI provider

The brief goes to the model that answers, with the message, as the chat itself does. It is the project's file names, task titles and description, for a chat the person chose to file under that project. The build agent already sends these providers the same project's files in full when it builds.

## Consequences

- "What's left?", "where is X?", "what next?" get answers from the project's own record, in the person's language.
- A filed chat costs a little more per question: up to about 800 tokens of input.
- **The brief is as good as the names.** A project of `file1.js` and tasks called "fix" tells little.
- **Scheduled runs and agents** are not told about a project: their chats are not filed under one.
- **Not yet:**
  - reading a file's contents when the question needs it (the person pastes or attaches it for now);
  - the plan and checks of a task, beyond its title and state;
  - a project's brief in the Images and Video studios;
  - one memory across spaces, and suggested next steps with their reasons (the rest of Telepathy, part 1);
  - a workspace-wide switch for an owner; the switch is per browser, like memory's;
  - the header says nothing for a chat filed under an archived project, though its brief is still given and says the project is archived.

## Verified

See `docs/stages/stage-282.md`.
