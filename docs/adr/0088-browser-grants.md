# ADR 0088: Browsers' database privileges, restored and pinned

- Status: accepted (2026-10-26).
- Builds on ADR 0036 (the database on the VPS) and the rule that writes go through service-role-only `app_*` functions.

## Context

Every migration revokes what Supabase's default privileges grant (`grant all` to `anon` and `authenticated` on new tables and functions), then grants browsers only what they need: reads under Row Level Security, `organizations.name` for renaming, and a few functions that run as the person.

Reading back migration v55 in production showed otherwise. Every table and function from the first 24 migrations had all privileges for `anon` and `authenticated`, including the `app_*` functions that only the server may call and that trust the actor they're given. Later migrations' objects were right. The likeliest cause is the move to the VPS (ADR 0036): a dump restored without its privileges takes the defaults. Row Level Security still kept every table's rows to their workspace, and no browser write was allowed by a policy except renaming. But it didn't cover the functions, or an owner updating columns of their own workspace other than its name.

## Decision

- **Migration v56 sets every table, column, sequence and function** in `public` and `private` to exactly what the migrations before it define for `anon` and `authenticated`. It runs as one transaction. On a database whose privileges are already right, it changes nothing: the state read back after it is identical.
- **`scripts/ops/browser-grants.mjs`** builds the intended state from every migration in an in-process Postgres:
  - writes it as SQL to apply after any restore;
  - with `--state`, lists it one line per object;
  - with `--check`, gives the query that lists production's state in the same form, so the two can be compared line by line.
- **`tests/db/browser-grants.test.ts` pins it.**
  - Signed out, nothing runs and nothing is read.
  - Signed in, seven functions run.
  - No table can be written, except a workspace's name.

  A migration that forgets its revokes fails the test.
- **The restore runbook** (`docs/deploy/vps.md`) applies the generated SQL after any restore, then compares.

## Consequences

- Production matches what the tests have always checked. v55 and later were already right.
- Whether anything used the extra privileges can only be told from what the server recorded: the audit log and the API gateway's logs. That check is open in `docs/stages/stage-65.md` until it's done.
- Any future privilege change is a migration, and it updates the pinned test.
