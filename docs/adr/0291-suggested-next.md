# ADR 0291: Home suggests what to do next, and says why

- **Status:** accepted (stage 283, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0174 (what needs you, first thing on Home), ADR 0073 (a new workspace's first steps), ADR 0290 (a chat knows its project).
- **Changes:** what Home shows when nothing is waiting for the person. No migration, no new dependency, no paid service.
- **Part of:** Telepathy, part 1 (the briefs' "next-step recommendations", "explanation of suggestions" and "user corrections").

## Context

Home's first card says what needs the person: a question from the agent, a change waiting for a yes or no, a task Farbaek paused. When nothing does, that place was empty, and the person was left to remember where they stopped: which task failed last week, which project was verified and never published.

The briefs ask for next-step recommendations that explain themselves and can be corrected. The owner's rule is maximum intelligence behind the scenes and minimum complexity for the person, and an honest product: nothing invented.

## Decision

**When nothing is waiting for the person, Home may show one suggestion, worked out from their own records by tested rules, with its reason and a way to put it away.**

### What is suggested

One suggestion at most for a project, from its newest task, since what happened last in a project is what its next step follows from:

| The newest task | The suggestion |
| --- | --- |
| Its checks failed | Fix what failed |
| Its run was interrupted | Carry on where the agent stopped |
| Its plan is written and waiting | Read the plan and approve it |
| It is verified, and the project has no live site | Publish the project |

- In that order: what a person would most regret missing comes first. Up to three are worked out; Home shows the first one not put away.
- **Not** for an archived project, for work left more than thirty days, or for a project with newer work after the failed task.
- **Publishing** is suggested only where publishing is set up, and only when the list of live sites could be read. If it couldn't, nothing is said about publishing either way.
- **Only for someone who can act on it,** and only once a new workspace's first steps are behind them. What needs the person always comes first: a suggestion never takes that card's place.

### How it is worked out

- **By rules, not by a model** (`core/telepathy/next-steps.ts`). The facts are the workspace's tasks and which projects have a live site, read as the person. No model is asked and nothing leaves the workspace, so a suggestion costs nothing and is the same every time.
- **Every suggestion carries its reason:** a sentence built from the record it came from, with the time it happened. "Why this?" shows it, and says how it was worked out.

### How the person corrects it

- **"Not now"** puts that one suggestion away for a week. A task that fails again is a new suggestion.
- **"Stop suggesting ..."** switches that kind off. It is switched back on in Settings, under "Suggestions on Home", where every kind has a switch.
- Both are kept **in the person's browser**. They are about what this person wants to see on this device, not facts about the workspace, and so need no table.
- **Nothing is drawn until the browser has said what was put away,** so a dismissed suggestion never flashes back while the page loads.

## Consequences

- Home's first card is never empty while there is something worth doing: what needs you, else what to do next.
- **A suggestion is as good as the record.** It knows states and times, not intentions: a project left verified on purpose is suggested for publishing until the person says "Not now" or switches the kind off.
- **Put away on a phone, it still shows on a laptop.** Choices kept in a browser don't travel.
- **Not yet:**
  - suggestions from Chat's own history ("you asked for this news three mornings running");
  - suggestions inside Chat, Images, Video and Build;
  - choices that follow the person across devices (needs a table);
  - goal tracking and decision support, the rest of Telepathy.

## Verified

See `docs/stages/stage-283.md`.
