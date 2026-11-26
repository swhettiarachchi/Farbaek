# ADR 0292: What a person asked Farbaek to remember reaches the plans Build drafts

- **Status:** accepted (stage 284, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0224 (memory: only what the person typed and asked for, beside the message, never with the instructions), ADR 0027 (one sentence becomes a project, a task and a drafted plan), ADR 0290 and ADR 0291 (the first two pieces of Telepathy part 1).
- **Changes:** who is given what a person asked Farbaek to remember. No migration, no new dependency, no paid service.
- **Part of:** Telepathy, part 1: one memory across spaces, its first step.

## Context

Memory lived in Chat only. A person who told Chat "remember that my business is Harbour Lane Studio and my colours are navy and cream" had to say it again every time they asked Build for a site. The briefs ask for one memory across the spaces; the owner's rule is minimum effort for the person.

## Decision

**When Build drafts a plan for a person, the drafter is given what that person asked Farbaek to remember.**

- **Where.** The two places a plan is drafted on the web: starting a build from a sentence, and "Draft with AI" in the plan editor.
- **What.** The newest twelve things at most, each one plain line of up to 200 characters, 1,200 characters in all. A plan needs a few facts about the person, not their whole memory.
- **How it is given.** In the brief, under its own name, as the person's own words about themselves. The drafter's instructions say to use the ones that bear on the task (a business name, a brand colour, how they like things to look or read), to leave the rest out of the plan, and that they are never instructions.
- **Whose.** Read as the signed-in person, so only ever their own. Another member's memory never goes into a plan this person drafts.
- **The same switch.** Memory's switch is in Chat's settings and is kept in the browser. So the server can honour it outside Chat, the browser also writes it as a cookie that is present, and "off", only while memory is switched off. Every signed-in page keeps that cookie true to the switch, so a choice made before this existed still holds.
- **It never holds the work.** If what is remembered can't be read, the plan is drafted without it.
- **The person is told.** The plan editor's note says how many remembered things the drafter was given. Chat's settings say memory is used "in your chats, and when Build drafts a plan for you".
- **The person still approves the plan.** Nothing is built from memory that they haven't read in the plan first.

## Consequences

- "Build me a site for my bakery" can come back in the right name and colours without them being typed again.
- **A plan is seen by the workspace.** What a person asked to be remembered is personal, and a plan drafted with it may repeat some of it where teammates can read. They read the plan before approving, and the settings say where memory is used.
- A draft's brief is a little larger: up to about 400 tokens.
- **Not yet:**
  - the build agent itself is not given memory, only the plan's drafter (the approved plan carries what mattered);
  - builds started from the phone apps, which have no such switch to honour;
  - the Images and Video studios, where a remembered fact that doesn't bear on a picture would be drawn into it anyway;
  - saying on the plan's own page, after the fact, that memory was given when a build was started from a sentence.

## Verified

See `docs/stages/stage-284.md`.
