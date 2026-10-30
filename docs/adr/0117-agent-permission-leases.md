# ADR 0117: Permission leases for paired agents

- Status: accepted (2026-10-30).
- Implements master spec §9 ("Permission leases and autonomy limits"): "Leases are least-privilege, scoped, expiring and revocable, with history and periodic access review", and "Expired or revoked leases can't authorize new actions". The spec audit of 2026-10-30 (`docs/architecture/spec-audit-2026-10-30.md`) found them missing.
- Builds on ADR 0018 (the Farbaek Agent), ADR 0021 (the model gateway), ADR 0022 (cloud runs), ADR 0094 (Mesh's relay) and migration 14 (paired agents).

## Context

A paired Farbaek Agent held a token with no end. It worked on every project in the workspace, could do everything an agent can do, and was limited only by a per-minute rate limit. Revoking it was the only control. Nobody was ever asked to look at an agent again, so a forgotten computer kept its access for good.

## Decision

**Every agent holds a lease** (migration v74, columns on `agents`):

| Part | Values | Start |
| --- | --- | --- |
| Ends | 1 to 90 days from when it was set | 90 days after pairing |
| Projects | every project (null), or 1 to 100 of this workspace's projects | every project |
| Capabilities | read, propose, model, mesh (at least one) | all four |
| Requests an hour | 10 to 5,000 | 600 |

The capabilities map to the agent API:

| Capability | Routes |
| --- | --- |
| read | tasks, a task, its files, a proposal's status |
| propose | submitting a change proposal |
| model | the model gateway (Farbaek's AI) |
| mesh | Mesh's relay |

**The server checks the lease on every agent request** (`withAgent`, using `leaseRefusal` in `src/core/agent/lease.ts`):
- **An ended lease refuses everything** with `403 LEASE_EXPIRED`, except unpairing, so an agent can always be let go. The agent's own profile needs a live lease but no capability, so the app can say what's wrong. An unreadable end date counts as ended.
- **A missing capability** gets `403 OUTSIDE_LEASE`.
- **A task outside the lease's projects** is left out of the task list, and refused by the task, file, proposal and model routes (`403 FORBIDDEN`). The gateway refuses a task whose project it can't see when the lease names projects.
- **The hourly limit** is a rate-limit bucket per agent (`429 LEASE_LIMIT`). It counts every request but Mesh's, which sends many small ones by design, and unpairing.
- **Each refusal says who can fix it**: an owner, an admin or the person who paired it, on the Agents page.

**Setting a lease** goes through `app_agent_lease_set`, callable by the server key only:
- it is allowed for the person who paired the agent, and for owners and admins;
- it refuses a revoked agent, and anything outside the limits (`INVALID_LEASE`);
- the table's checks hold the same limits, so nothing can store an invalid lease;
- each change records one `agent.lease_set` audit event. That event carries the name, the end, the number of projects, the capabilities and the hourly limit, never project names.

**Renewing** keeps what the lease allows and only moves its end 90 days from now. The scope is read from the database, never from the form, so a renewal can't widen it.

**Periodic access review** comes from the end date. Every agent must be looked at again at least every 90 days, or it stops. The Agents page warns 14 days ahead, and so does the desktop app.

**Agents paired before v74** get 90 days from the migration with everything they had, so nothing stops on the day it ships.

**Cloud runs** (Farbaek's own agent on the server) aren't paired agents. Each run carries its own lease for the model gateway: that task's project, the model capability, and an end of twice the longest a run can last.

**The security evaluation** gains SE-036, "An agent past or outside its lease" (ASI03, ASI10, LLM06).

## Consequences

- An agent nobody renews stops on its own within 90 days.
- A person can give an agent less than everything: one project, or read and propose without Farbaek's AI.
- The hourly limit bounds what a stolen token can do between noticing and revoking it.
- The desktop app reads the lease from its profile; older apps ignore it and show the server's refusal message.

## Not done

- **Per-capability hourly limits, spend ceilings per lease, and concurrency limits:** the plan's run caps (ADR 0040) and AI usage still bound spend.
- **An email before a lease ends:** the Agents page and the desktop app show it.
- **Leases for other kinds of access,** such as a future developer API key or an integration: each will need its own lease when it's built.
