# Stage 65: Permissions per person

The plan catalog's "Advanced roles and permissions" (Max and up), the last plan feature marked coming, and spec §27's "RBAC plus resource and action scopes".

- **Decision record:** `docs/adr/0087-member-permissions.md`.
- **Branch:** `feat/member-permissions`, on top of `feat/autonomy-level-3`.

## 2026-10-26

### Done

**Database: migration v55.**
- `organization_members.permissions`: only withheld permissions (`approve`, `publish`, `run_agents`), checked by a constraint. A role change resets them.
- `private.member_may` and `private.require_permission`: owners and admins always, members unless withheld, viewers never.
- `app_set_member_permissions` (service role): owners and admins, for members only, audited.
- Triggers that refuse with `PERMISSION_WITHHELD`:
  - a person's approval applying a change;
  - a site deployment, a launch order, an agent run, an Arena run.
- `app_set_live_deployment` needs `publish` for rollbacks and taking a site offline.

**Core.** `src/core/workspace/permissions.ts`: the three permissions, their labels, `may`, `withheldFor` and the words.

**Server.**
- The member list and the request context carry permissions.
- `setMemberPermissions`:
  - owners and admins, for members;
  - Max and up to turn one off;
  - always allowed to turn one back on.
- `applyProposal` (a person's approval), `startCloudRun`, `startArena`, `authorizeVercelLaunch` and the publish actions refuse with the reason before anything is spent.
- New error codes `PERMISSION_WITHHELD` and `INVALID_PERMISSIONS`. The agent API answers 403.

**UI.**
- Settings > People: a line explaining the roles. Each member's permissions are shown in words, and owners and admins get a Permissions panel. Without the plan, what's on stays on, and what's off can be turned back on.
- Unavailable with the reason, for a member who had it turned off: approving on the task page (discarding stays), "Let the agent build it" on the task and Build pages, Approve and build, the Arena, the Publish panel and the Vercel launch.
- `FEATURE_STATUS.advanced_rbac` is now live.

**Also fixed.** A change applied at autonomy level 3 recorded `autonomyLevel: 2` in its ProofPack. The policy decision now carries the level that allowed it, and the ProofPack records it.

### Verified

- `tests/db/member-permissions.test.ts` (8):
  - setting permissions is for owners and admins, members only, audited, and idempotent;
  - browsers can't call it or write the column, and members read their own;
  - a role change resets them;
  - approving, publishing, launching, rollback, agent runs and Arena runs are refused when withheld and allowed again after;
  - autonomy still applies within its limits;
  - viewers never may.
- `member-permissions.test.ts` (4): roles, the plan, and turning back on without it.
- `permissions.test.ts` (3): the rule matches the database, and the words.
- `proposals.test.ts`, `executor.test.ts`, `provider-launch.test.ts` and `runner.test.ts` each refuse a member without the permission. The ProofPack names level 3.
- New security scenario **SE-028**, "A member acting beyond their permissions". `pnpm security:eval`: 28 of 28.
- All database suites (49 files, 365 tests); the server, core and component suites (150 files, 1,125 tests); the design tests. `pnpm typecheck` and `pnpm lint` are clean.
- **Demo build at 1280 and 375:** Settings > People shows the roles line and "Can't publish or launch." on the sample member. The panel lists the three permissions, the plan reason, and Save unavailable in the read-only demo. No sideways scroll, no console errors, no targets under 44px.
- `pnpm qa:a11y` on `/app/settings` and `/app/tasks`: 0 findings.
- **v55 applied in production** and read back:
  - the column and its default, with no permissions set anywhere;
  - the six triggers;
  - the setter closed to browsers and open to the server;
  - the rollback function checking the permission;
  - every owner, admin and member still allowed.

### Not checked

- A real Max workspace with members: no workspace has a paid plan while payments aren't connected, so turning a permission off can't be used in production yet. Turning one back on can.
