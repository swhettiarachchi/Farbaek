# Stage 109: The trust graph

Who and what can act in a workspace, and on what, as a searchable 2D map with questions, from the workspace's own records.

- **Decision record:** `docs/adr/0132-trust-graph.md`.
- **Branch:** `feat/trust-graph` (from `feat/task-modes`).
- **No migration.**

## 2026-10-30

### Done

- **`src/core/trust/trust-graph.ts`:**
  - nodes and edges from members, permissions, agents, leases, projects, workflows, repository links and connected services;
  - `whoCanChange`, `neighbours`.
- **`src/server/trust/trust-graph.ts`:** reads everything as the person; anything unreadable is named, not guessed.
- **`/app/trust`:**
  - the project question;
  - the 2D map (`src/components/trust/trust-map.tsx`);
  - selection;
  - search;
  - **Trust graph** in the navigation.

### Verified

- `src/core/trust/trust-graph.test.ts` (3):
  - people, agents and workflows that can change a project, each with how;
  - a viewer's agent shown as limited and not counted;
  - expired, revoked and archived records reach nothing;
  - workflows run as their approver;
  - the services and who connected them.
- `pnpm typecheck`, lint, the design tests.
- Full `pnpm test` (2,336 passing).
- **A demo build:**
  - the project question answers with people and the running workflow, each with its path and source;
  - the map draws the demo's 7 records and 11 connections;
  - selecting the owner highlights its 4 connections and lists them;
  - no sideways scroll at 375px (the map scrolls inside its frame).

### Not verified

- **Agents and services on the map:** the demo workspace has no paired agents or connected services, so only the core tests cover those edges.
