# Stage 62: Priority support

The plan catalog's "Priority support" (Max and up), which was marked coming.

- **Decision record:** `docs/adr/0084-priority-support.md`.
- **Branch:** `feat/plan-features`, on top of `feat/incidents`.

## 2026-10-25

### Done

- `priorityFirst` in `src/core/support/support.ts`: priority requests first, each group keeping its order.
- `priorityWorkspaces` in `src/server/office/support-data.ts` reads the plans of the queue's workspaces with the server key and resolves `priority_support`. When plans can't be read, nobody is marked.
- Office Space > Support:
  - "Waiting on us" puts priority first, and each such request carries a "Priority" chip (icon and word);
  - the page says so;
  - the other lists stay in time order.
- Help shows workspaces with the plan what priority support means, with no response time promised.
- `FEATURE_STATUS.priority_support` is now live.

### Verified

- `support.test.ts`: the ordering.
- `support-data.test.ts` (3): Max marked while Pro and Free aren't, nobody marked when plans can't be read, and the mark carried onto rows.
- `pnpm typecheck` and lint are clean, and the design tests pass.

### Not checked

- The chip in Office Space and the Help line in a browser: the queue needs a staff session, and the line a Max plan, which neither the demo nor any workspace has while payments aren't connected. Both reuse existing components (`Chip`, the Help header).
