# Stage 61: Emergency pause, incidents and the Incident Replay Theatre

Spec §9 incident response and cascade containment, incident-to-prevention memory, and Stage 8's Incident Replay Theatre. The plan catalog's "Incident response tools" (Max 2x and up) were marked coming.

- **Decision record:** `docs/adr/0083-incidents-and-emergency-pause.md`.
- **Branch:** `feat/incidents`, on top of `feat/policy-builder`.

## 2026-10-25

### Done

**Database: migration v53.**
- **The pause:**
  - `organizations.agents_paused_*`;
  - `app_set_agents_pause`: any contributor pauses, only an owner or admin resumes, both audited;
  - triggers refuse new `agent_runs`, proposals from desktop agents or cloud runs, and automatic outcomes while paused.
- **Incidents:**
  - `incidents` and `incident_events`, members read, server writes;
  - `private.open_incident`, with one unresolved incident per signal;
  - an `audit_events` trigger opens incidents from `autonomy.suspended` and `watch.down`, and adds "Back up" on `watch.recovered`;
  - `app_open_incident`, `app_add_incident_event`, `app_update_incident` (resolving needs an outcome and is final), `app_claim_incident_escalation`;
  - `app_incident_changes` returns shapes only, as the caller.
- **Applied in production and read back:** the columns, RLS, select-only grants, functions closed to browsers (except the shapes read), and the three triggers. Nothing was paused and there were no incidents yet.

**Core.** `src/core/trust/incidents.ts`:
- words for severities, statuses, sources and events;
- `suggestPreventionRules`: the narrowest patterns, "always a person" and "owner or admin";
- `replayIncident`: then, and with each rule;
- `linkWords`, which says when the link is only timing.

**Server.**
- `src/server/workspace/incidents.ts`:
  - readers;
  - `pauseAgents`, which also stops live runs on this server through `abortCloudRuns`;
  - `resumeAgents` (owners and admins);
  - the tools on Max 2x and up: `openIncidentByHand`, `addIncidentNote`, `changeIncident`;
  - `resolveIncident` on every plan;
  - `recordPrevention`.
- Error codes `AGENTS_PAUSED` (423 for the desktop agent), `INVALID_INCIDENT` and `INCIDENT_RESOLVED`.
- Escalation in the hourly jobs (`incident_escalation`): every owner and admin, once, by email and push, on plans with the tools.
- Activating rules opened from an incident records "Prevention" with the rules version on the incident.

**UI.**
- **`/app/incidents`:** the emergency pause, with what it does and can't undo; incidents with severity and status badges (icon and words); opening one by hand.
- **`/app/incidents/[number]`:**
  - containment: pause or resume, undo the change, revoke a desktop agent, watch what's live;
  - the Replay, which links to the policy builder;
  - the timeline;
  - notes, severity and status, and resolving.
- `/app/policies?incident=N&effect=…` adds the suggested rule to the builder, with a note linking back.
- A banner on every page while agents are paused.
- "Incidents" in the navigation and on More.
- One sample incident in the demo, labelled "Sample incident".
- `FEATURE_STATUS.incident_response` is now live.

### Verified

- `tests/db/incidents.test.ts` (9):
  - pause and resume roles;
  - automatic applies refused while paused, people's changes not;
  - closed to browsers;
  - incidents from the watch and from an autonomy failure, with repeats appending and reopening after resolve;
  - manual incidents, notes, severity, status and a final resolve;
  - workspaces kept apart;
  - escalation claimed once.
- `src/core/trust/incidents.test.ts` (7), `src/server/workspace/incidents.test.ts` (5), `src/server/jobs/incident-escalation.test.ts` (2).
- New security scenario **SE-026**, "An agent that won't stop": a run insert and an automatic apply are refused while paused, a person's change goes through, a member can't resume, and automatic applies work again after resuming.
- `pnpm security:eval`: 26 of 26 passed, and the run report was updated.
- **Demo build at 1280 and 375:**
  - `/app/incidents`: the pause, the sample incident and opening by hand, each read-only with the demo's reason.
  - `/app/incidents/1`:
    - containment and its links;
    - the Replay: "Then it applied on its own", "With 'Always a person', it would have waited for a person.";
    - the two suggested rules;
    - the timeline and the tools.
  - `/app/policies?incident=1&effect=person_approval`: the suggested rule in the builder with the incident's note, matching three files.
  - No console errors, no sideways scroll.
  - The incident row on a phone squeezed the title beside its badges, so the badges now wrap under the title below the `sm` breakpoint.
- `pnpm qa:a11y` on `/app/incidents`, `/app/incidents/1` and `/app/policies`: 0 findings. `pnpm qa:responsive` on the incident pages: 22 page views, all clean.
- The full `pnpm test`: 1,726 passed, 17 skipped, and 1 failed. The failure was `broker.test.ts`'s cmd.exe test at 5,082 ms under full-suite load. It passes on its own, 10 of 10, and is unrelated to this stage; a pending task already covers process-spawning tests under load.
- `pnpm typecheck` and `pnpm lint` are clean.

### Not checked

- A real pause and resume, an incident opened by a real autonomy failure or watch, and escalation email: the demo is read-only. After merging, the owner can pause and resume on the Incidents page.
