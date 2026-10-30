# Stage 110: Tool Definition Pinning

Each paired agent's tools are pinned by hash, one by one, at first use. A changed description or schema, or an unknown tool, pauses the agent's AI steps until an owner or admin reviews the exact difference and approves it.

- **Decision record:** `docs/adr/0133-tool-definition-pinning.md`.
- **Branch:** `feat/tool-pins` (from `feat/trust-graph`).
- **Migration:** v81, `supabase/migrations/20261222090000_agent_tool_pins.sql`.

## 2026-10-30

### Done

- **Migration v81:**
  - `agent_tool_pins`;
  - `app_check_agent_tools`, per tool and atomic: first use, Farbaek tools added as runs offer them, match, or quarantined;
  - `app_approve_agent_tools`, for owners and admins, bound to the reviewed manifest's identifier;
  - `app_agent_tools_pending_id`.
  
  Pins are per tool because the agent offers different tools in different run modes.
- **`src/core/agent/tool-pins.ts`:** the manifest, its hash, and the diff.
- **The model gateway:** checks a paired agent's tools before reserving anything, and refuses with `TOOLS_CHANGED` (423). It fails closed when the check can't run. Cloud runs aren't pinned.
- **The Agents page:** a pin line per agent; when quarantined, the diff (added, removed, descriptions before and after) and **Approve these tools**.
- **Activity:** names the three events.

### Verified

- `tests/db/agent-tool-pins.test.ts` (4):
  - pin on first use, Farbaek tools added as a run offers them, then match;
  - a changed tool or an unknown one quarantines;
  - still refused when the agent goes back to the old tools before review;
  - approval by owners and admins only, for exactly the reviewed hash;
  - revoked agents are refused;
  - only the server writes; members read.
- `src/core/agent/tool-pins.test.ts` (2): per-tool hashes independent of order, any change detected, and the diff.
- `src/server/agent/gateway.test.ts` (2 new): pinned tools pass; changed ones are refused before reserving or calling the model; cloud runs aren't checked.
- `pnpm typecheck`, lint.
- Full `pnpm test` (2,343 passing).

### Not verified

- **The pin panel in a browser:** the demo workspace has no paired agents, so the Agents page has nothing to show it on.
- **A real agent's tools pinned in production:** that needs a paired desktop agent taking an AI step.
