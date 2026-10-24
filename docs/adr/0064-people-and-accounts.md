# ADR 0064: People and accounts

- Status: accepted (2026-10-24).
- Builds on ADR 0010-era roles (`org_role`), invitations (v15) and the trial (v13).

## Context

**Teams had no way to change.** Owners and admins could invite people, but nobody could:
- change a role or remove someone;
- leave a workspace;
- hand a workspace to someone else.

**There was no way to delete an account.** A privacy policy has to offer it.

**Trials could be farmed.** A trial was tied to the account's ID, so deleting an account and signing up again with the same address would start another one. So would `you+1@gmail.com`.

## Decision

**Roles** (`app_set_member_role`):
- owners set any role, including owner;
- admins move members and viewers between member and viewer;
- a workspace always keeps an owner (`LAST_OWNER`).

**Removing and leaving** (`app_remove_member`):
- owners remove anyone; admins remove members and viewers; anyone can leave;
- the last owner can't;
- the invitation the person joined with is deleted with them, so their address doesn't stay;
- every change is in the workspace's audit log.

**Deleting an account.** `app_account_deletion_plan` shows what happens to each workspace:
- **deleted:** the person is its only member;
- **left:** others stay on;
- **blocked:** the person is its last owner and others are in it ("make one of them an owner first"), or it has a paid plan ("cancel it first").

Settings shows the plan before anything happens. Then the person types their address to confirm, and the server:
1. runs `app_delete_account_data` under locks;
2. deletes the sign-in record, which takes their email choices and support requests with it;
3. signs them out.

Farbaek staff accounts are kept (Office Space), and Settings says so.

**One trial per address:**
- when a trial starts, `trial_claims` keeps a SHA-256 of the normalised address: lower case, no `+tag`, and Gmail's dots and `googlemail.com` ignored;
- the claim comes before the trial, so two variants signed up at once can't both get one;
- every existing trial was backfilled;
- the claim is a one-way hash kept only to stop repeat trials, and the privacy policy says so.

## Consequences

- **Teams can be managed** without writing to support, and a sole owner can hand a workspace over before leaving.
- **Deleting an account is immediate for live data.** Nightly backups that still hold it age out within 14 days, which the page says.
- **Records in workspaces that stay keep the person's ID:** task history, audit entries, ProofPacks. The ID no longer links to anyone.
- **A person who deletes their account and comes back starts on Free.**
- **Not yet:**
  - deleting a whole workspace on its own (archiving projects covers most of it);
  - disposable-address checks, which are the next stage, with the sign-up abuse guards.
