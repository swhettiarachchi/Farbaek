# Stage 178: Share one project

- **Branch:** `feat/project-sharing`, from `main` (e0f64fb).
- **ADR:** 0188.
- **Migration:** v91, `supabase/migrations/20270101090000_project_sharing.sql`. It goes to production before the merge.
- **Skills:**
  - **Security:** `ecc-security-review` (its checklist), with an independent review of the risky files.
  - **Screens:** `farbaek-ui` and `farbaek-human-made`.
  - **APIs:** `api-design`, for the routes and their refusals.
  - **Checks:** `built-in-browser`, for the demo build.

## What the owner asked

"Sharing one project" was one of the six parts not built, and the owner said "setup all and use skills". Until now, an invitation always gave someone the whole workspace.

## What changed

**Project, then Share** (`/app/projects/<id>/share`), linked from a new Share card on the project page:
- **Invite someone to this project only:** Can view or Can edit. The one-time link is shown once, like workspace invitations.
- **People with access:** change view or edit, remove, and revoke open invitations.
- **A read-only link:**
  - it lasts 7 days, 30 days, or until it's turned off;
  - a .zip download is optional;
  - the screen says it was last opened, and the link can be turned off.
- **Who can share:** owners, admins, and members who may publish. Others see why they can't.

**Shared with you** (`/shared`), the guest's own area:
- **The list:** the projects shared with them, and which workspace each is from.
- **A project:** its files, its tasks, its live site, and leaving.
  - **Edit guests** also change files, add new ones and add tasks (no AI).
  - **A task** shows its plan, latest change and proof, read-only.
- **Finding it:** it's in the account menu (Shared with you). Someone with no workspace of their own sees their shared projects first at `/app`.
- **Accepting:** the invitation page tells project invitations apart from workspace ones, and opens the project.

**A read-only link** (`/share/<token>`):
- **What it shows:** the project's current files, never older versions.
- **What it hides:** credentials files and dependency folders, by path; text that looks like a key, checked again when it's served. The page says how many files are hidden.
- **How it's served:**
  - text is shown escaped in the page, never as its own page;
  - images come from a sandboxed route with their exact type;
  - pages are noindex and no-referrer, limited to 600 opens an hour per address;
  - a closed link says why, without naming the project.

**Office Space** gains a sixth pause switch, Shared links.

**The rules underneath (v91, ADR 0188):**
- **Reading:** guests read through a second policy on an explicit list of tables. Members' own policies are unchanged.
- **Writing:** only saving, adding and deleting files and making tasks admit an edit guest. Applying, approving, ProofPacks, undo, imports, AI and test spaces still need a member, because their functions were not touched.
- **Seats:** an edit guest takes a seat. View guests are free, up to 10 per project.
- **Housekeeping:** a member who leaves or is removed closes the links and open invitations they made. A guest who joins the workspace loses their guest rows, which are redundant then.
- **Your data:** the export also lists projects shared with the person.

## Verified

- **PGlite** (`tests/db/project-sharing.test.ts`, 22 tests):
  - a viewer reads only that project's files, history and tasks, and none of the workspace (organization, members, audit, AI ledger, billing, trial, invitations, launches);
  - a viewer can't write;
  - an editor saves and deletes files and makes tasks in that project only;
  - AI, imports, task moves, plan approval and archiving are refused to them;
  - seats count the editor once, and a full plan refuses another editor;
  - only sharers invite, and members, double invitations and an eleventh viewer are refused;
  - the wrong account and a used invitation are refused;
  - removal and leaving end access at once;
  - joining the workspace drops guest rows;
  - links work only while live, show current files only, stop while paused or archived and when turned off, close when their maker leaves or loses the right to share, and are never callable or readable from a browser;
  - a seat counts once per person;
  - closing access works while suspended, and opening it doesn't;
  - a download is one read, only when the link allows it.
- **Security scenarios:** SE-042 (a guest reaching past their project) and SE-043 (a link turned off, or reaching history). `pnpm security:eval`: 43 of 43.
- **Existing suites:** v91 first copied three file functions from their original migrations, which still raised error code 40001; v89 had rewritten that code to P0001 in production (ADR 0178). `no-endless-retries` caught it, and the copies now use P0001.
- **Other checks:** unit tests for the sharing rules, typecheck, lint on every changed file, and the whole suite after the review's fixes (2,935 passed).
- **In the built-in browser (demo build):**
  - the Share page at 1280 and 375 px, with no sideways scroll and every control explaining that the demo can't share;
  - the Share card on the project page;
  - `/shared` and a closed link page;
  - no console errors;
  - `qa:a11y` on the three routes: 6 page views, no findings.
- **What the demo can't show:** a guest's pages with real data, which need a real database. The first real guest on production is the check.

## The independent review

A fresh agent read the risky files. It found no hole that lets a guest past their project. It found six smaller problems, all fixed:
1. **Suspended workspaces:** closing access was refused in a suspended workspace, and a pending invitation could still be accepted. Now closing always works and nobody new comes in.
2. **Downloads:** a download made one database read per file, and a link turned off midway gave a partial zip. Now it's one read.
3. **Seats:** a person could count as two seats. Now seats count people once.
4. **Lost permissions:** a member who lost the right to share kept their links live. Now they close.
5. **Flooding:** guests could make revisions and tasks without limit. Now they get 200 file changes and 30 tasks an hour.
6. **The guest editor:** a second new file failed with "someone saved this file", and editors had no delete button. Now a new file opens on its own page, and editors can delete, with confirmation.

Fixing them, one text replacement turned `$$` into `$` in the migration, and another removed the viewer limit from the wrong function. The PGlite tests caught both before anything was committed.

## Applying migration v91

The owner runs it before the merge, because the new pages call its functions. It changes who may read project tables (guests), so it's the owner's step, like v90:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\apply-migration.ps1" -File "supabase\migrations\20270101090000_project_sharing.sql" -Sha256 bcbc371d3dabcb7e0f93fe19600d223b15a9b66e0e86422cc322203d79b7287e -Check "select 'check', count(*) from pg_catalog.pg_proc where proname in ('guest_project_ids', 'app_project_for_share', 'app_share_files', 'app_shared_with_me');"
```

The read-back should say `check|4`.

## Not done

- **Guests in the phone apps:** the phone API doesn't serve guests yet.
- **Email:** project invitations aren't emailed; the link is copied, as for workspace invitations.
- **Images from the guest's page:** an edit guest can't upload images there yet, though the database allows it.
- **A real guest on production:** the first is the owner inviting their second account.
