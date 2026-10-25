# ADR 0083: The emergency pause, incidents and the Incident Replay Theatre

- Status: accepted (2026-10-25).
- Builds on ADR 0046 (autonomy level 2), ADR 0080 (outcome watch) and ADR 0082 (workspace rules).
- Spec §9 asks for the following:
  - Incident response and cascade containment: "Centralize incidents: timeline, affected agents, resources and integrations, related evidence, notes, severity, remediation and outcome. Containment tools: an emergency pause for eligible future actions, scoped revocation, retry suppression, escalation and safe recovery planning … State clearly that a pause can't undo actions already committed elsewhere."
  - Incident-to-prevention memory.
  - Stage 8's Incident Replay Theatre: "the proposed rule is evaluated against historical events before activation."

## Context

When something goes wrong today, Farbaek reacts in pieces:
- autonomy pauses itself after a failed check;
- the outcome watch tells whoever turned it on;
- staff can suspend a workspace from Office Space.

A workspace has no brake of its own and no single record of what happened. The entitlements already promise that an emergency pause is always available (`agent.emergency_pause`). The plan catalog sells "Incident response tools" on Max 2x and up, marked coming.

## Decision

**An emergency pause that anyone who contributes can pull, on every plan.**
- `app_set_agents_pause` (migration v53) sets `organizations.agents_paused_at`, with an optional reason, audited.
- While a workspace is paused, the database refuses:
  - new cloud runs (`agent_runs`);
  - desktop agents' proposals;
  - anything that would apply on its own.
- The server also stops the workspace's live cloud runs at once.
- People's own reviews, approvals and changes carry on.
- Only an owner or admin resumes: stopping is safe for anyone, starting again is a decision.
- A banner on every page says agents are paused, and every place it's offered says a pause can't undo what was already applied or anything done outside Farbaek.

**Incidents open on their own, from signals Farbaek already records.** An after-insert trigger on `audit_events` opens incidents, so the functions that raise these signals stay untouched:

| Audited signal | Incident |
| --- | --- |
| `autonomy.suspended` | "A change applied on its own failed its checks" (high), linked to that change, its task, project and ProofPack |
| `watch.down` | "<project> is down" (high) |
| `watch.recovered` | Adds "Back up" to that incident; a person still resolves it |
| A pause | "Agents paused" (medium) |

A repeating signal adds to the unresolved incident it opened (a partial unique index on `source_key`) instead of opening another. Each incident has a timeline (`incident_events`), and members read their workspace's incidents. Resolving one needs a sentence on what happened and what was done, and is final.

**Plans.**
- Safety controls on every plan: the pause, incidents opened automatically, their timeline, and resolving them.
- "Incident response tools" on Max 2x and up, checked on the server:
  - opening incidents by hand;
  - notes;
  - severity and status;
  - escalation, where the hourly job tells every owner and admin about an open high or critical incident, once (claimed with `app_claim_incident_escalation` before anyone is told).

**The Incident Replay Theatre.** On each incident, Farbaek shows its changes:
- the change it's about; or
- for a watch, a pause or a manual incident, the changes applied in the 24 hours before it opened, said plainly: "Farbaek can't tell which, if any, caused it".

It reads only their shapes (`app_incident_changes`), never their content.

It suggests the narrowest workspace rule naming their files: a shared folder, else each file's folder, else the files. There are two strengths:
- "Always a person", which would have held a change that applied on its own;
- "Owner or admin approves".

Change by change, it shows what happened then and what each rule would have decided. Nothing changes there. "Open in the policy builder" adds the suggested rule to the builder (ADR 0082). There it must be tested against the last 90 days of changes before it can be activated, which is the spec's acceptance for the theatre. Activating it records a "Prevention" event on the incident with the rules version: the incident-to-prevention memory, with the link kept both ways.

The containment card also offers the other remedies Farbaek has, each a link with its own limits:
- undo the change file by file from its task;
- revoke a desktop agent;
- watch what's live every hour (the monitor).

## Consequences

- Any contributor can stop the agents in one press, and everyone sees that they're stopped.
- Failures that used to scatter now land in one place with a timeline, and lead to a rule tested on real history.
- There is no trust graph yet. The theatre steps through the real timeline and the linked changes, and doesn't claim a graph.
- Retry suppression comes from the pause itself: nothing an agent does starts again until someone resumes.
