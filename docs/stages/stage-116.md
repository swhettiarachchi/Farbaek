# Stage 116: Continue on my computer

From a phone or browser, a contributor can send a task to one of the workspace's paired computers. The Farbaek Agent app there lists it with the exact checks it will run. When the person there starts it, the app runs them on a copy of the project with the waiting change written in, and reports back. Farbaek shows the report labelled as reported by that computer.

- **Decision record:** `docs/adr/0139-continue-on-my-computer.md`.
- **Branch:** `feat/handoff` (from `feat/mesh-delta`).
- **Migration:** v84, `supabase/migrations/20261225090000_agent_handoffs.sql`.

## 2026-10-30

### Done

- **Migration v84:**
  - `agent_handoffs`: one open per task and computer, lapsing after a day, keeping the whole report and its digest;
  - `app_request_handoff`, `app_cancel_handoff`, `app_agent_open_handoff` and `app_agent_finish_handoff`, all server-only and audited.
- **`src/core/agent/handoff.ts`:**
  - splitting a check into a program and arguments, refusing shell syntax with a reason;
  - the report schema;
  - the digest;
  - the overall result.
- **`src/server/agent/handoffs.ts`:**
  - the store;
  - the agent's side (list within the lease, detail with the change, open, and report, with the digest worked out on the server and a version check);
  - the person's side (request with the contract's checks and the waiting change; withdraw);
  - the reader.
- **Agent API:**
  - `GET /api/v1/agent/handoffs`;
  - `GET /api/v1/agent/handoffs/{id}`;
  - `POST /api/v1/agent/handoffs/{id}/open`;
  - `POST /api/v1/agent/handoffs/{id}/result`.
- **The task page:** "Continue on your computer":
  - choose a computer and add a note;
  - each handoff's status with an icon and words;
  - reports with each command's result, its output, the digest and the "doesn't verify" label;
  - **Withdraw**;
  - **Open Agents** when no computer is paired.
- **The desktop app:**
  - a `HandoffManager` that copies the project, writes the change in, installs without scripts, runs each check through the broker with a time limit, reports, and removes the copy;
  - "From your phone or browser" on Tasks;
  - IPC and preload.
- **Also:** the agent client's handoff calls and the Activity verbs.

### Verified

- `src/core/agent/handoff.test.ts` (3): splitting and refusals; the overall result; the digest is stable whatever the key order and tied to its handoff.
- `tests/db/agent-handoffs.test.ts` (6):
  - binding to the proposal hash, one open per computer, the audit event;
  - refusals: outsiders, revoked or other workspaces' computers, a change not waiting, bad checks;
  - withdraw, and lapse after a day;
  - only the computer it was handed to opens and reports, once, with validation;
  - the failure reason;
  - read access for members only.
- `src/server/agent/handoffs.test.ts` (3): the lease filter; the digest from the received report; the version mismatch refused; the request uses the contract's checks and the waiting change; refusals.
- `desktop/src/main/handoffs.test.ts` (3):
  - the install and checks run on a copy with the change in;
  - a check needing a shell is reported as not run;
  - the copy is removed;
  - a failed install reports why and runs nothing;
  - no double start.
- **A demo production build:** the card at 375px, empty (no computers) and filled (swapped into the live page with sample data): 16px inputs, 44px controls, nothing under 12px, no sideways scroll.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **A real handoff end to end:** phone, Farbaek, a paired desktop app running the checks, and the report on the phone. It needs a signed-in workspace with a paired computer.
