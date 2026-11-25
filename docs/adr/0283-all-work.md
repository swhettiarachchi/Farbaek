# ADR 0283: All work, one page for everything Farbaek is doing

- **Status:** accepted (stage 276, the Farbaek program, 2026-11-25)
- **Builds on:** ADR 0174 (Home leads with what needs the person), ADR 0083 (the workspace's pause), ADR 0092 (workflows), ADR 0278 and ADR 0282 (scheduled tasks and agents), ADR 0281 (scheduled work on Home), ADR 0183 (status kinds).
- **Changes:** a new page, `/app/work`; one tested function that sorts work into four lists; Home's two loaders moved to shared modules. No migration, no new dependency.

## Context

The briefs ask for an agent command center: one place that shows every agent, where it stands, what waits for approval and what it produced, with one pause. The coverage map had it as not started: "Approvals, the runs list and a workspace-wide pause exist on separate pages."

By stage 275 Farbaek did five kinds of work for a person, each on a page of its own: the agent's builds, changes waiting for a yes or no, workflows, scheduled tasks and agents. Home showed a little of each. Nowhere showed all of it.

The reference study found the same three groups in every product that has this: in progress, scheduled, completed, with what needs the person first.

## Decision

**One page, "All work", lists everything Farbaek is doing for the person, sorted by what it needs from them.**

- **Four lists, in this order:**
  - **Needs you:** an agent's question first, since the agent has stopped; then changes waiting for this person's yes or no; a build whose change the plan's checks stopped; a workflow that is waiting at a checkpoint or has stopped; a draft workflow whose plans are all approved, for the owner or admin who approves it; scheduled work Farbaek paused in the last seven days; and last, changes that ran out of time.
  - **In progress:** builds under way, running workflows, scheduled work that is running or due, and anything held for a person who isn't this one, said as "Waiting for someone else".
  - **Scheduled:** tasks and agents waiting for their time, soonest first, then the ones the person paused, then work Farbaek paused more than seven days ago.
  - **Just finished:** the latest eight that ended, builds and scheduled runs together, newest first, each as it ended. A finished agent's run says what it did, in its own note; a run that didn't finish says why.
- **Each thing is listed once.** A change waiting for the person is the change: not also the run that made it, nor the workflow whose step it is. A build a running workflow started is said by the workflow, which names the step. A change that is someone else's to decide is counted in a line under the list, not listed as this person's.
- **Nothing is "waiting for you" for someone who can't act.** A viewer, or anyone while changes are off, sees each thing where it stands, said as waiting on someone else.
- **A list that couldn't be read is said as missing,** and the opening sentence isn't given when any list is known to be incomplete.
- **One sentence before the lists** says the numbers the lists show: "2 things need you. Nothing is in progress, and 3 are scheduled."
- **One pause.** The workspace's existing pause (ADR 0083) is on the page, with a link to it beside the sentence. Since stage 275 it refuses new scheduled runs as well as new builds and workflow steps, so it is one pause for all of this. The card says what it does not do: a workflow with a step under way stops and has to be started again, and a scheduled run already under way finishes. Who may pause and who may resume is unchanged.
- **Sorted by tested code.** `core/command/board.ts` takes what the page read and returns the four lists; the page only draws them. Every row opens the page that owns the thing. Nothing is changed here but the pause.
- **The same reads as the pages it gathers.** Runs, changes, workflows and scheduled work are read as the person, with the readers Home, Approvals, Workflows and Scheduled use, so the page shows nobody anything they couldn't already see. A read that fails is said as missing, never as "none".
- **Where it lives.** Under More tools in the sidebar and in search ("All work", also found as "Command center"), and from Home's "What the agent is doing". The main sidebar doesn't grow.
- **Plain words.** The page is "All work", not a command center: it says what it is.

## Consequences

- The briefs' command center exists as a first version: one place, four groups, one pause.
- **Not yet, and said in the coverage map:**
  - the cost of each thing (a build shows its steps on its own page; scheduled runs have no usage of their own yet);
  - the tools and stage of each agent in the row itself;
  - acting from the row (approve, answer, pause one thing): every row opens its own page;
  - the paired desktop agents, images and video work, and other members' work for an owner;
  - a history beyond the latest eight that finished.
- Home keeps its own short sections. All work is where to look when there is more than Home shows.

## Verified

See `docs/stages/stage-276.md`.
