# ADR 0087: Permissions per person

- Status: accepted (2026-10-26).
- Builds on ADR 0064 (people and roles), ADR 0029 (publishing), ADR 0078 (LaunchOS with Vercel), ADR 0076 (the Future-State Arena) and ADR 0046 (autonomy).
- Spec §19 plans: "Advanced RBAC" on Max and up. Spec §27: "RBAC plus resource and action scopes."

## Context

Roles are owner, admin, member and viewer. A member can do everything a contributor does: approve and apply anyone's changes, publish a site, launch to Vercel, and start agent runs that use the workspace's AI allowance. A workspace with juniors, contractors or a client who should propose but not ship has only two choices: trust them with all of it, or make them a viewer who can't propose either. The plan catalog sells "Advanced roles and permissions" on Max and up, marked coming.

## Decision

**Three permissions, on by default, that owners and admins can turn off for a member.**
- **Approve changes:** apply a change that needs a person's approval, their own or anyone's.
- **Publish and launch:** publish a Farbaek Site, roll it back or take it offline, and launch to a connected host.
- **Start agent runs:** let the agent build a task, or try a change in the Arena.

Everything else a member does stays as it is: making tasks and plans, editing files, proposing changes, discarding, running checks, pausing agents.

**Roles stay the frame.** Owners and admins always have all three; viewers have none. Permissions only narrow a member, so nobody gains anything they didn't have. A role change starts from that role's defaults.

**The database enforces each one** (migration v55), through the rows that already record who acted, whichever server path made them:
- a `change_proposals` row moving from pending to applied with a person's approval needs `approve` for `decided_by`;
- inserts into `site_deployments` and `launch_orders` need `publish` for `created_by` and `authorized_by`, and `app_set_live_deployment` needs it for rollbacks and taking a site offline;
- inserts into `agent_runs` and `arena_runs` need `run_agents` for `started_by`.

Each refusal is `PERMISSION_WITHHELD`. Only withheld permissions are stored (`organization_members.permissions`, e.g. `{"approve": false}`), with a check that allows nothing else. Members read them; only `app_set_member_permissions` (service role) changes them, for an owner or admin acting on a member, audited as `member.permissions_changed`.

**Changes the workspace's autonomy allows still apply on their own.** Autonomy is the workspace's decision, made by an owner or admin, and it applies under its own limits (ADR 0046, 0086). A withheld `approve` stops the person's own approval, not the workspace's.

**The server says why first.** Every place a member acts (the task page's approve button, "Let the agent build it", Approve and build, the Arena, the Publish panel and the Vercel launch) shows the control as unavailable with "An owner or admin turned off … for you in this workspace." The use cases refuse the same way before anything is spent, and the database refuses again.

**Plans: Max and up, checked on the server, for turning a permission off.** Turning one back on is always allowed, so a workspace that leaves the plan is never stuck with members who can do less than a member normally can.

**Settings > People** shows each member's permissions in words ("Can't publish or launch.", or "Every permission is on."), with a panel for owners and admins to change them. A member sees their own on their row.

## Consequences

- A workspace can have people who propose but don't approve, publish or spend AI on runs, without making them viewers.
- Editing files directly isn't one of the permissions: a member who shouldn't change files at all is a viewer. If workspaces need "propose only", that's the next permission, with its own enforcement on file writes.
- Per-project permissions and custom roles aren't built.
- ProofPacks now record the autonomy level that applied a change (2 or 3), which Stage 64 left at 2.
