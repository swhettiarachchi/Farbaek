# Stage 123: Tools and rules in the trust graph

The trust graph now shows the tools each paired agent may call, from its pin, and the workspace's rules, with what each one requires of changes in every project.

- **Decision record:** `docs/adr/0146-tools-and-rules-in-the-trust-graph.md`.
- **Branch:** `feat/trust-tools` (from `feat/incident-futures`).
- **Migration:** none.

## 2026-10-31

### Done

- **`src/core/trust/trust-graph.ts`:**
  - `tool` and `rule` nodes, and `uses_tool` and `governs` edges;
  - a quarantined agent's tool edges are limited;
  - `rulesOn`.
- **`src/server/trust/trust-graph.ts`:** reads the pins and the active rules as the person, and names them when they can't be read.
- **The map:** Tools, and Rules and services columns; empty columns are left out.
- **The page:** the kind words and icons, and the workspace rules on a project's changes under "Who and what can change a project?".

### Verified

- `src/core/trust/trust-graph.test.ts` (3 new):
  - the tools of active agents only, with a quarantined agent's edges limited and in words;
  - each rule governs every active project, with its effect and version, and doesn't change who can change it;
  - the graph is unchanged without pins or rules.
- `src/components/trust/trust-map.test.ts` (2, new): the new columns with their words and the dashed edge, and empty columns left out.
- `pnpm typecheck`, lint and full `pnpm test`.

### Not verified

- **In a browser:** the demo workspace has no pins or rules, so its map is the four columns it had. The render test covers the new columns.

### Next

- Stacked pull requests, picking an element in a running app, MCP servers as a tool source.
