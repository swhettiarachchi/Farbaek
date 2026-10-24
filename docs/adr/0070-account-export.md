# ADR 0070: Download your data

- Status: accepted (2026-10-24).
- Builds on ADR 0066 (the Privacy Policy) and ADR 0039 (a project's own export).

## Context

The Privacy Policy offers people a copy of their data. Until now, the only way to get it was a project's "Export everything" or writing to support. GDPR's right of access expects an answer within a month; a button answers at once.

## Decision

**One function, `app_account_export(user)`** (migration v42, server key only), returns one JSON document (`farbaek-account-export/v1`):
- **Account:** the account and email choices;
- **Membership:** workspaces with roles;
- **Support:** support requests with Farbaek's replies, never staff-only notes;
- **Created:** the projects, tasks (newest 2,000) and sites the person created;
- **Actions:** the actions they took (newest 5,000), without the details, which can name other people;
- **AI use:** their AI use (newest 10,000) as tokens and models, not internal units;
- **Trial:** whether a fingerprint of their address is kept to stop repeat trials.

**One route, `GET /app/account/export`:**
- takes the person from their own session, never from the request;
- 5 downloads an hour;
- never cached;
- in the demo, 404 with the reason.

**Settings > Your data** has the button, and the Privacy Policy points to it.

**Project files stay in each project's export.** They belong to the workspace, and the account export lists the projects instead.

## Consequences

- People get their data themselves at any time, and support handles only what the file can't answer.
- New personal data needs a section here. The test checks what's included, what's left out, and that each person sees only their own.
