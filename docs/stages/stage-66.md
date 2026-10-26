# Stage 66: The project graph

Spec Stage 8 "graph analytics", and §25's intent-to-proof graph built from real data with a 2D accessible view (Real-Project Loom).

- **Decision record:** `docs/adr/0089-project-graph.md`.
- **Branch:** `feat/project-graph`, from `main`.

## 2026-10-26

### Done

**Core.** `src/core/insights/project-graph.ts`:
- `buildLanes`: one lane per task through Intent, Contract, Change, Proof and Live, each node with a state, a short label, a detail and a link to its record. It also lists the versions published without verified evidence.
- `graphAnalytics`:
  - medians from the ask to verified, and for a person's approval;
  - checks passed, and evidence on releases;
  - policy outcomes and rework;
  - the most-changed files, with the changes that ended in failed checks;
  - linked incidents.
- `formatDuration`.

**Data.**
- `getProjectGraph` on the workspace reader. Live, it's `src/server/insights/project-graph.ts`: read as the person, queries in parallel, no file contents.
- In the demo, it's built from the same sample tasks, contracts, proposal and incident as the other demo pages, so it has no ProofPacks or versions.
- No migration.

**UI.**
- `/app/projects/:id/graph`:
  - "What it adds up to": four figures and three panels;
  - "Every task": the lane graph in one panel;
  - the versions published without verified evidence, with their reasons.
- Laid out from md up in columns under a sticky header, and as vertical paths on phones. The connectors draw in once (`motion-safe`), and every node has an icon and words.
- A "Project graph" link beside "Launch plan" on the project page.
- `#contract` on the task page, and `#version-N` on the Launch page, so nodes land on their record.

**Design pass** (the high-end visual design skill, inside White Signal):
- the lanes became hairline rows in one double-bezel panel instead of separate cards;
- the pills got short labels, with the details beneath, so nothing truncates;
- hovers use custom easing;
- lane titles got 44px targets.

**Also recorded:** the API gateway log check for Stage 65's privileges fix, in `docs/stages/stage-65.md`.

### Verified

- `project-graph.test.ts` (9):
  - a task followed from the ask to live;
  - newest first, and a blocked task;
  - releases without verified evidence;
  - failed checks, autonomy and incidents;
  - task-state fallbacks and cancellation;
  - the analytics and the empty states;
  - `formatDuration`.
- `pnpm typecheck` and `pnpm lint` are clean; the design tests pass (138).
- **Demo build at 1280 and 375:**
  - six Storefront lanes, newest first, with no truncated labels;
  - one sample incident shown on its lane;
  - "None yet" with reasons where the demo has no evidence;
  - the "Project graph" link on the project page.

  No sideways scroll, no console errors, no targets under 44px.
- `pnpm qa:a11y` on the graph and the project page: 0 findings. `pnpm qa:responsive` on the graph from 320 to 1440 (11 views): 0 findings.

### Not checked

- With real evidence: the demo applies nothing, so ProofPack, version and launch nodes, the release list and the files panel were checked by the unit tests, not on screen.
- The last fix, keeping the incident marker's icon from shrinking when its text wraps, came after the final screenshots. It's checked by typecheck and lint only; the next demo build will show it.
