# Stage 122: Past incidents in the Failure Futures Lab

A change to a file that was part of a past incident is now rehearsed against the failure that incident describes, first.

- **Decision record:** `docs/adr/0145-incidents-in-the-failure-lab.md`.
- **Branch:** `feat/incident-futures` (from `feat/private-import`).
- **Migration:** none.

## 2026-10-31

### Done

- **`src/core/realityloop/failure-futures.ts`:**
  - `incidentKinds`: an incident's words, mapped to the lab's kinds;
  - `IncidentMemory`;
  - `withIncidents`: marks or adds scenarios, incident ones first, at most six;
  - the scenario's `incident` field.
- **`src/server/failure-futures/incidents.ts`:** `readIncidentMemories`, which reads an incident's own change or the changes applied in the day before it, as paths only.
- **The runner and its store:** they read incidents, so a scenario only an incident suggests can start.
- **The task page:** reads them as the person.
- **The card:** says which incident, how it's linked, and links to it.

### Verified

- `src/core/realityloop/failure-futures.test.ts` (5 new):
  - which words name which kinds, and that vague words name none;
  - a scenario is added with the change's added line;
  - an existing scenario is marked and comes first;
  - other files, tests and incidents that name no failure are ignored;
  - with no incidents, the output is the same as before.
- `src/server/failure-futures/runner.test.ts` (1 new): a scenario only an incident suggests starts, with its evidence.
- `src/components/failure-futures/failure-futures-card.test.ts` (1 new): the note's two wordings and its link.
- `pnpm typecheck`, lint and full `pnpm test`.

### Not verified

- **On production data:** it needs a project with an incident whose files a later change edits.

### Next

- Stacked pull requests, picking an element in a running app, tools and policies in the trust graph.
