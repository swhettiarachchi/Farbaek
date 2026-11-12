# ADR 0188: Share one project

- **Status:** accepted
- **Date:** 2026-11-12
- **Stage:** 178
- **Builds on:** ADR 0017 (invitations), ADR 0087 (permissions per person), ADR 0032 (Office Space pause switches).

## Context

Invitations always gave a person the whole workspace: every project, its people, its billing and its history. There was no way to bring a client, a contractor or a friend into one project, and no way to let someone read a project's code without an account. The owner asked for it.

Every content table decides who can read it by workspace (`private.is_member(org_id)`), and every write function checks a workspace member (`require_contributor`, `lock_project`, `apply_transitions`). Applying changes, ProofPacks and undo all go through `lock_project`.

## Decision

### Guests on one project

A person is invited to one project, as **Can view** or **Can edit**. They never become a member of the workspace.

- **Can view** reads that project's files, file history, tasks, plans, changes, ProofPacks, checks and site.
- **Can edit** also saves, adds and deletes its files (revisions under their name, undoable from history) and writes tasks without AI.
- **Kept with members:** AI of any kind, test spaces, approving or applying a change, approving a plan, publishing, launching, settings, people, billing, history and every other project. No function that does those was widened.

**How it's enforced (migration v91):**
- **Separate tables.** Guests live in `project_guests`, and their invitations in `project_invitations`. Workspace invitations are untouched, so no older code path can turn a guest into a member.
- **Reading through a second, permissive policy** on an explicit list of tables: `project_id in (select private.guest_project_ids())`. The function is security definer, so it runs once per query. Child rows go through their parent: task history, plans and checks through the task, signatures through the ProofPack. Members' own policies are unchanged.
- **Never readable by a guest:** the workspace row, its members, invitations, audit log, AI ledger, billing, trial, launches, watches, Capsules, incidents, handoffs, runs and test spaces.
- **Writing:** `private.lock_project_for_edit` admits a member contributor or an edit guest of that project. Only `app_save_file`, `app_save_binary_file`, `app_delete_file` and `app_create_task` use it. `lock_project`, `require_contributor` and `apply_transitions` are unchanged, so applying, approving, ProofPacks, undo, imports, AI and test spaces still refuse a guest.
- **Who shares:** owners, admins, and members who may publish (`member_may(..., 'publish')`).
  - Closing access (removing a guest, moving an editor to view, revoking an invitation, turning a link off) works even while a workspace is suspended.
  - Opening it (inviting, accepting, moving a viewer to edit, making a link) doesn't.
- **Seats:** an edit guest takes a seat. Seats count people once, by email, across members, invitations and editors, so someone who already holds one needs no second. View guests are free, up to 10 per project.
- **Housekeeping:**
  - guest rows go when the person joins the workspace (they're redundant then) or deletes their account;
  - when a member leaves, is removed, or may no longer share (a lower role, or publishing withheld), the links and open project invitations they made close.
- **Limits on guests' writes:** 200 file changes and 30 tasks an hour per guest, so an outsider can't flood a workspace with revisions.
- **Audit:** one event for each invite, revoke, accept, change, removal and leaving.

**In the app:**
- **A guest area,** `/shared`, with its own small frame: Shared with you, then one project at a time.
- **The workspace comes from the guest's own row,** never from the workspace cookie. A guest gets a 404 on every member page, because those read through the current workspace.
- **No plan, switcher, test-mode band or workspace nav** is shown to a guest. The phone API doesn't serve guests yet.
- **Project → Share** has invite by email (the one-time link is shown once, like workspace invitations), the people with access with change and remove, and read-only links.

### Read-only links

A link lets anyone read a project's **current** files without an account.

- **The token:** 32 random bytes; only its SHA-256 is stored. It lasts 7 days, 30 days, or until turned off. At most 5 work at once per project.
- **Checked on every request** by a service-role function (`app_project_for_share`, `app_share_file`). It answers `revoked`, `expired`, `paused`, `archived`, `suspended`, `blocked` or `none`, and only when live, the file list.
- **No revision parameter.** Older revisions can hold deleted files and content that newer screening would catch, so they're never reachable.
- **What's never shown:**
  - credentials files and dependency folders (by path);
  - text that looks like a key (by content, checked again when it's served).
- **Text is escaped inside the page and never served as a page of its own** on Farbaek's origin.
- **Images** come with their exact type, `nosniff`, `Content-Security-Policy: sandbox` and `no-store`.
- **Pages** are `noindex`, `no-referrer`, and limited to 600 opens an hour per network address. A download, if the link allows one, is limited to 10 an hour.
- **Office Space** gains a sixth pause switch, Shared links, with the same step-up as the others.

## Consequences

- **The database is the boundary.** The TypeScript checks (`requireEditor`, the guest context) only explain refusals early.
- **Guests read through the same reader as members.** Its queries still name the project's workspace, so nothing changed for members.
- **Emails aren't sent for project invitations,** as for workspace invitations: the link is shown once to copy.
- **A download is one read** (`app_share_files`): one check of the link and every current file, so a link turned off midway never gives half a project.
- **Not done here:** guests in the phone apps, and a guest uploading images from the page (the database allows it).
