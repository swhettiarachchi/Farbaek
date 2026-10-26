# ADR 0084: Priority support

- Status: accepted (2026-10-25).
- Builds on ADR 0032 (Office Space) and the support requests of migration v23.

## Context

The plan catalog sells "Priority support" on Max and up, marked coming. Support requests already exist: people write from Help, and staff answer from Office Space's queue, longest waiting first. Nothing tells staff which requests come from plans that paid for priority, and nothing tells customers what priority means.

## Decision

**Priority means first in the queue, and nothing more is promised.**
- In Office Space's "Waiting on us" list, requests from workspaces whose plan includes `priority_support` come first. Within each group, the longest waiting come first, as before.
- Those requests carry a "Priority" chip, with an icon and the word.
- The answered and closed lists stay in time order.

**Read from the plan at the time the queue is read.** The server resolves each request's workspace plan from its billing record, as entitlements do everywhere else (`priorityWorkspaces` in `src/server/office/support-data.ts`). No migration is needed. If plans can't be read, nobody is marked and the queue keeps its own order: a failure never hides a request.

**Said plainly to customers.** On Help, a workspace with the plan sees: "Your plan includes priority support: requests from this workspace go first in Farbaek's queue while they wait on us." It names no response time, because none is promised.

## Consequences

- `FEATURE_STATUS.priority_support` is live, and pricing stops showing it as coming.
- If a response-time commitment is ever made, it's a business decision for the owner, recorded in its own ADR and in the terms, not in this code.
