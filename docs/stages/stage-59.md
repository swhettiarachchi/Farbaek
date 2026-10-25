# Stage 59: Counterfactual policy replay

Spec Stage 8 lists counterfactual replay. Here it's a replay of the autonomy limits an owner is considering over the workspace's real past changes.

- **Decision record:** `docs/adr/0081-policy-replay.md`.
- **Branch:** `feat/outcome-watch` (with stage 58).

## 2026-10-25

### Done

- **Migration v51** (`app_replay_history`):
  - returns each past change's shape: paths and kinds, contract breaks, desktop agent or not, checks or not, and its newest ProofPack's status;
  - never content;
  - runs as the caller under RLS, at most 90 days and 300 changes.
  - **Applied in production** and read back: callable when signed in, not signed out.
- **`src/core/trust/replay.ts`:** runs shadow mode's own evaluation over each change with the limits being considered. It leaves the desktop agent's changes out and counts them, and takes "was a verified sandbox connected" from today.
- **`replayAutonomyAction`:** 30 days, same plan as shadow mode, read as the person. It returns the summary and states its assumption.
- **Settings > Autonomy:** "Replay the last 30 days" with the limits. The result shows in the rehearsal record's replay variant: "Replay of the last 30 days", badged "Predicted from past changes", with its assumption and the desktop agent's changes left out. Changing the limits clears the result.
- **The threat model** has a replay section.

### Verified

- `tests/db/policy-replay.test.ts` (2): shapes without content, nothing of another workspace, closed signed out.
- `src/core/trust/replay.test.ts` (4): each judgement and reason; looser limits let more through; no sandbox means nothing verifiable; the desktop agent left out; set against what really happened.
- `rehearsal-record.test.ts`: the replay variant's labels and assumption.
- `pnpm typecheck` and lint are clean; the design tests pass.
- **Demo build at 1280 and 375:**
  - the replay button sits in the limits panel with the demo's reason ("The demo workspace has no past changes to replay.");
  - the first label, "Replay these limits over the last 30 days", was cut off at 375, so it's now "Replay the last 30 days", and the new label was measured to fit (210px in a 306px panel);
  - stage 58's watch card on the Launch page is read-only in the demo, with its reason;
  - no sideways scroll, no console errors.
- **`pnpm qa:a11y`** on `/app/settings` and a Launch page: 0 findings.

### Not checked

A replay over real history: the demo has none. The first real one will be the owner's on Settings, with Pro or the trial.
