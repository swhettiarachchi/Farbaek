# ADR 0119: The workspace Activity page

- Status: accepted (2026-10-30).
- Implements the Activity and audit page the spec lists for the app (§12), and the "history" leases and policies need (§9). The spec audit of 2026-10-30 found it missing: the database recorded more than 90 kinds of audit event, but people could see them only through Office Space (staff) or not at all.

## Decision

**`/app/activity`** shows the workspace's audit log, newest first, 50 at a time, with **Show older** paging back by event id.

**Reading:**
- Events are read through the person's own session. The existing row-security policy ("members read audit events") decides which reach them, so a member sees their workspace's events and nothing else.
- No new grant or function.

**Each event is one sentence** (`src/core/workspace/activity.ts`):
- who did it;
- what happened, from a list of every action the database records;
- the name the event recorded, when it has one (a project, a task title, an agent's name);
- a link when there's a page for it (tasks, projects, workflows).

An action the list doesn't know is still shown, by its name, so nothing recorded is hidden.

**Who did it, in words:**
- "You".
- The address a teammate was invited at, when this person may see invitations (owners and admins).
- Their role otherwise ("An admin").
- "A former member" once they've left.
- "Farbaek" for what Farbaek did.

**Categories** filter on action prefixes in the query: people, projects and files, tasks and changes, agents, sites, policies and checks, billing and usage, and Farbaek.

**Details:** each event's recorded details show as JSON under **Details**. Members can already read them, so the page shows them in full rather than pretending they're private.

**CSV download** (`/app/activity/export`):
- the latest 5,000 events, with the same filter, through the same session;
- every cell is quoted;
- a cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a spreadsheet keeps it as text instead of running it.

## Not done

- **Search across events,** and a date range.
- **Events that aren't in the audit log yet**, such as single file saves. Those are in each file's own history.
- **Streaming the log out to the customer's own systems** (a webhook or SIEM export).
