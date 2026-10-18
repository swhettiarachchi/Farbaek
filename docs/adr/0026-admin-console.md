# 0026. The admin console: one allowlist, checked on the server, read-only first

- Status: accepted
- Date: 2026-10-18

## Context

The owner needs to see the whole platform: who signed up, which workspaces exist and what they use, what the agent and security checks are doing, what the AI is costing, and what this deployment has connected. Until now every page in Farbaek was scoped to one workspace, read with the person's own session under Row Level Security.

The owner chose hello@farbaek.com as the admin sign-in. Sign-in is by email link, so whoever signs in as that address controls that mailbox.

## Decision

**A console at `/admin`, outside the workspace app.** Its pages: Overview (with this month's AI list cost and the deployment's connections), Workspaces, People and Activity.

**Who gets in** (`src/server/admin/access.ts`, `requireAdmin`, failing closed):
1. `FARBAEK_ADMIN_EMAILS` lists the person's email. Unset or empty means nobody.
2. They have a valid session.
3. Their stored email, read with the server key, is still the listed one and is confirmed.
4. The server key is set.

Anyone else gets a 404, so the console's existence isn't revealed. Every admin page calls `requireAdmin` itself, not just the layout. The links to it in the app are shortcuts shown only to listed people; they aren't the boundary.

**How it reads.** Only after the check passes does `requireAdmin` hand out the server-key client, and every loader in `src/server/admin/data.ts` takes that client as an argument. The loaders only read.

**What it never shows.** No secret value: the connections list names variables and says on or off. AI cost is the settled units in `ai_credit_ledger` at $0.0001 of list cost each, labelled as list cost.

## Consequences

- The owner can run the platform day to day from one place, on a phone too.
- **Read-only to start.** Extending a trial, adding usage and pausing a workspace need their own `app_*` functions, audit entries and a migration, so they come next rather than as buttons that can't work.
- **Sized for today's scale.** Lists are capped at 1,000 and say so when the cap is hit. Paging comes with growth.
- **One email, one password-less sign-in.** Requiring a second factor for admins is a later step.
