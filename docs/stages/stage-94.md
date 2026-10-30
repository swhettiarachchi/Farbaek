# Stage 94: Permission leases for paired agents

The spec audit (`docs/architecture/spec-audit-2026-10-30.md`) found that a paired Farbaek Agent kept its access forever, on every project, with everything an agent can do. Spec §9 asks for leases that are scoped, expiring and revocable, with history and periodic review. This stage builds them.

- **Decision record:** `docs/adr/0117-agent-permission-leases.md`.
- **Branch:** `feat/permission-leases` (from `feat/honest-claims-context-readiness`, PR #121).
- **Migration:** v74, `supabase/migrations/20261215090000_agent_leases.sql`.

## 2026-10-30

### Done

- **The lease** on every agent: when it ends (at most 90 days ahead), which projects, what it may do (read, propose, Farbaek's AI, Mesh) and how many requests an hour. Agents paired earlier get 90 days from the migration.
- **The server checks it on every agent request:**
  - an ended lease refuses everything but unpairing;
  - a missing capability is refused;
  - tasks outside the lease's projects are hidden and refused, including by the model gateway;
  - an hourly limit applies, with Mesh's relay and unpairing not counted.
- **Setting it:** `app_agent_lease_set` (server key only) allows the pairer, owners and admins. It refuses a revoked agent and anything outside the limits, and records one audit event per change. The table holds the same limits as checks.
- **The Agents page:** each agent shows when its lease ends and what it allows, with **Renew for 90 days** and **Change lease** (length, projects, capabilities, hourly limit). A notice appears when a lease ends within 14 days or has ended.
- **The desktop app** reads the lease from its profile. It warns 14 days ahead, and says when the lease, not the role, is why it can't propose.
- **Cloud runs** carry their own short lease for the model gateway: their task's project and the model capability only.

### Verified

- `tests/db/agent-leases.test.ts` (8, PGlite):
  - a new agent's default lease;
  - narrowing, with one audit event;
  - widening back;
  - the pairer, owners and admins may set it; members and other workspaces may not;
  - 11 out-of-bounds leases refused, with nothing recorded;
  - revoked and unknown agents;
  - the table's own checks;
  - members can read the lease but not write it, and only the server key can set it.
- `tests/db/agents.test.ts`: still green with the wider session row.
- `src/core/agent/lease.test.ts` (7): days left and the warning, the summary sentence, refusals once ended (failing closed on a bad date), missing capabilities, what counts against the hourly limit, and the form's checks.
- `src/server/agent/service.test.ts` (3 new): the task list filtered by project, task, files and proposals refused outside the lease, and the profile's lease and `canPropose`.
- `src/server/agent/gateway.test.ts` (2 new): the gateway refuses a task outside the lease, or one whose project it can't see, before reserving usage.
- **Security evaluation SE-036** ("An agent past or outside its lease", ASI03, ASI10, LLM06): `pnpm security:eval` records 36 of 36 scenarios passing, so /security shows it.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`.

### Not verified

- The Agents page with a real paired agent in production. The demo workspace has no agents, so the page was only checked to render without them.
- A real desktop app against the new server: older apps ignore the lease and show the server's refusal messages.

### Next

- Apply v74 to production before the merge, checked against its hash.
- After the merge, open the Agents page on www.farbaek.com: every agent should show about 90 days left.
- Then the next item on the audit list: the visual builder.
