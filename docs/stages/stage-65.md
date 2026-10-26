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

## Found while reading v55 back: browsers' privileges (ADR 0088)

### Done

- Production's privileges compared, line by line, with what the migrations define (`scripts/ops/browser-grants.mjs`).
  - Every difference was production granting more: 170 function lines, 80 table lines, and table-wide reads where only some columns should be readable.
  - Nothing the migrations grant was missing.
  - Row Level Security is on for all 63 tables.
- Migration v56 sets the intended state. On a freshly migrated database it changes nothing (the state read back is identical).
- `tests/db/browser-grants.test.ts` (3) pins what browsers' roles may do.
- The restore runbook in `docs/deploy/vps.md` now puts privileges back after a restore.
- The live code was checked for anything relying on the extra privileges. The only calls made as the signed-in person are `app_autonomy_record`, `app_incident_changes`, `app_replay_history`, `get_project_file`, `search_project_files` and `create_organization`, and the rename of a workspace. All of them stay granted.

- **v56 applied in production** by the owner (it was blocked for Claude by the permission classifier), then read back by Claude:
  - signed out, no function runs;
  - signed in, the seven intended functions run;
  - no table can be written from a browser;
  - only a workspace's name can be changed.

  The full comparison (`--check` against `--state`) matches the migrations on all 645 lines. `/api/health` answered `ok` afterwards.

- **The API gateway's log was checked** for calls before v56 closed the functions. The owner ran a read-only script, since reading the logs was blocked for Claude.
  - The log covers the whole time on the VPS: from 2026-10-22 09:01, when the gateway (Envoy) started, 4,646 lines.
  - Every function call came through Caddy with the client `node`, Farbaek's own server.
  - Every function called is one the server uses (jobs, sandboxes, staff sessions, file reads). No browser or script client called any.

  A client can claim to be `node`, so this rules out the obvious misuse rather than proving there was none. The data API's own log keeps errors only, so it has no per-call record.
