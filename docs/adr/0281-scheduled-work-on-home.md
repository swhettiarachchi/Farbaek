# ADR 0281: Scheduled work on Home

- **Status:** accepted (stage 274, the Farbaek program, 2026-11-25)
- **Builds on:** ADR 0278 (scheduled tasks), ADR 0174 (Home leads with what needs the person), ADR 0183 (status kinds), ADR 0228 (Home opens on a greeting and one box).
- **Changes:** a card on Home, one more rule in what Home leads with, and the Scheduled page's status words moved to one shared list. No migration, no new dependency.

## Context

Scheduled tasks run while nobody is looking (stage 271), and Chat offers them (stage 273). But the main screen said nothing about them. A person had to open the Scheduled page to learn what Farbaek would do next, what it last did, or that it had stopped a task. A task Farbaek pauses (five runs in a row that didn't finish, a plan that no longer allows it, a schedule that can't be read) sent one email and then sat paused, unseen.

The owner's direction is one simple main screen, as ChatGPT has. So Home should say this in a few lines, and only to a person who has scheduled something.

## Decision

**Home shows the person's scheduled work in one small card, and leads with a task Farbaek paused.**

- **The card** ("Scheduled", beside Recent tasks) has three rows at most, in this order: a task Farbaek paused, with why; what runs next, soonest first, each with its schedule in a sentence and "Next run in 5 hours"; then a task the person paused themselves. More than three: "And 2 more scheduled or paused."
- **A time that has come is never said as the past.** A task's next time stays behind the clock while it waits for the tick, while it runs, and while a failed try waits to be made again. The row then says "Running now" (its newest run is under way) or "Due now", never "Next run 12 minutes ago".
- **The last thing Farbaek did** is under the rows: how it ended, the task's name, how long ago, and a link to the answer. It is read from the runs themselves, not from the task's own record, which a run closed by a pause or a change doesn't update. The link is only offered for a run that finished, and only while its chat is still the task's: a task whose chat was deleted or filled up starts a new one, and the old run's answer isn't in it.
- **Only for a person with tasks.** Someone who has scheduled nothing sees no card and no empty state: Home stays as short as it was. A task whose schedule has ended asks for nothing and is left to the Scheduled page. When every task has ended (a one-time reminder that has run), the card stays for a week with only the last run and its answer, then goes.
- **A task Farbaek paused is the person's turn, for a week.** It has stopped until they look, so Home's "Your turn" card says so ("A scheduled task was paused", the task's name and the reason), after an agent's question and a change waiting for approval, and before a change that only ran out of time. After seven days it is a row in the card and no longer leads: some pauses can't be undone by resuming (a plan that allows fewer tasks), and Home mustn't lead with one for good. It is said only to someone who can resume it; a viewer, or anyone while changes are off, sees it in the card but is not told it is their turn.
- **One lead for every pause Farbaek makes.** Home and the Scheduled page tell Farbaek's pauses from a person's by how the reason starts ("Paused by Farbaek: "). Every such reason is now built from one constant, and a test holds each of them to it.
- **Read as the person, by tested code.** The tasks and their latest thirty runs are the person's own, through row-level security, as on the Scheduled page; Home reads only the columns it shows. What the card says is worked out in `core/automation/home.ts`; the browser decides nothing. If the tasks can't be read, Home shows no card (the Scheduled page is where a read fault is said); if the runs can't, the card has no last run and nothing is said to be running.
- **The same words in both places.** A task's and a run's status ("Scheduled", "Paused", "Ran", "Didn't finish", "Skipped") now come from one list (`components/scheduled/status.ts`). A task Farbaek paused is "Paused by Farbaek", an `attention` status; one the person paused is "Paused".
- **Everything is changed on the Scheduled page.** The card's rows open it. Home has no controls for a task.

## Consequences

- A person who schedules work sees it where they start, and a stopped task is no longer silent.
- This is a first piece of the command center the briefs ask for, not the command center: it covers scheduled tasks only, and it has no pause, cost or history of its own. Agent runs keep their own section on Home.
- The demo workspace shows the card with its labelled sample tasks.
- **Not yet:**
  - opening a task from its row (the Scheduled page has no address for one task);
  - the card for a person with no tasks, as an invitation.

## Verified

See `docs/stages/stage-274.md`.
