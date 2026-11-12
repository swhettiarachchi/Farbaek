# ADR 0190: An app with sign-in

- **Status:** accepted
- **Date:** 2026-11-12
- **Stage:** 180
- **Amends:** ADR 0140 (REST API starter and CRM template), which named the Next.js starter as the place to build sign-in.

## Context

Published sites are static, and every template was a static site. Someone asking for "a members area" or "a dashboard where users log in" got the Next.js starter, with no accounts in it. The agent then had to invent sign-in from nothing, the part of an app where mistakes cost the most.

## Decision

**A new starter, App with sign-in (`members-app`):** Fieldnote, a members app in plain Node.js with no dependencies, like the REST API starter.

**Accounts:**
- sign-up, sign-in, sign-out;
- change password, which signs out every other device;
- password reset by a one-time link;
- delete the account and everything in it;
- a private notebook per person, which proves each person's data stays theirs.

**Security, built in and tested:**
- scrypt password hashes;
- sessions as a random token in an HttpOnly, SameSite=Lax cookie (Secure over https), kept on the server only as a SHA-256;
- form tokens on every form (the session's own when signed in, double-submit when signed out) and a same-origin check on every POST;
- the same answer and the same work for a wrong password and an unknown email;
- sign-in limits per address and per email;
- reset links that work once for 30 minutes, without saying who has an account;
- everything shown is escaped;
- a strict CSP, no framing and `nosniff`.

**Data:** one JSON file in `DATA_DIR`, written to a temporary file and renamed, one write at a time. It has no dependency and runs on any Node 22, whichever Node the test space or host has. The README says hosts wipe their disk without a volume, and how to move to a database.

**Reset links:** written to the server's log until an email service is connected. The link is a path, never built from the request's Host header.

**Its source is real files** in `starters/members`. They run and are tested as they are. `scripts/starters/members.mjs` turns them into `src/content/starters/members-app.ts`, with two static snapshots of its pages for the gallery. A test fails if the module is out of date, and runs the starter's own suite (7 tests).

**People find it three ways:**
- **From a prompt:** one about accounts, sign-in or a members area starts from it, unless a framework is named.
- **From the gallery:** it sits under Apps with a server, drawn from labelled snapshots.
- **From the plan:** the plan drafter is told to keep its security as it is and to add a test for each new route.

## Consequences

- **Sign-in comes ready-made:** a build that needs accounts starts from working, tested sign-in, not a blank page.
- **Where it runs:** it doesn't publish as a static site. It runs in a test space now, and on a server host once one is connected (stage 181).
- **Previews:** sign-in works when the preview is opened in a new tab. Browsers block its cookie inside another site's frame, and the README says so.
- **What it doesn't have:** no email sending, no social sign-in and no two-step codes. They're the next things a real product adds, and the README points to where.
