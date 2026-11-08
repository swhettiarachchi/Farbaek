# ADR 0182: What the public can see

- **Status:** accepted
- **Date:** 2026-11-08
- **Stage:** 171

## Context

The owner found Farbaek's infrastructure listed on the public privacy page, by company and by town, with two lines still saying "we're confirming". An audit of everything a visitor can reach found more, and some of it worse:

- Every page's JavaScript carried what plans cost Farbaek: the target margin, the payment fee it plans for, the test space cost per hour, and every model's price per token. Client components imported the plan catalog for a price formatter or a model's name, and the catalog works plans out from those numbers when it loads.
- The sign-in email templates were public files, and named the staff console's address and how staff sign in.
- `/api/health` gave the deployed commit, `/api/ready` named the background jobs that were late, and responses named the server and the proxy.
- Customers saw the test space provider's name, setting names and commands meant for whoever runs the server, and a refusal that described Farbaek's own provider plan.
- robots.txt listed the staff and internal routes, and the public security page quoted rate limits.

## Decision

1. **Public means intended.** A visitor sees what Farbaek chooses to tell them: the product, its prices and limits, the policies, the security approach, and where their data goes. How Farbaek is built and run is not public.
2. **Names where people need them, categories where they don't.** The AI providers and Google Analytics stay named, because people need to know where their work and their visits go. The merchant of record is named, because it's the seller. The services that run Farbaek itself (hosting, backups, the test space, email, the bot check) are listed by what they do and where, as GDPR allows, and named to anyone who asks.
3. **Cost data stays on the server.** `allowance.ts`, `rate-card.ts`, `revenue.ts` and `catalog.ts` are never imported by browser code, directly or through other modules. Names (`model-names.ts`), money formatting (`money.ts`) and labels (`effort.ts`, `cap-choices.ts`, `second-check-labels.ts`) live in their own small modules. `tests/design/browser-imports.test.ts` traces every "use client" file's imports and fails on a path to the four.
4. **Server-only routes don't exist from outside.** Caddy answers not found from outside the server for `/auth-email/*`, `/api/internal/*` and `/api/sites/tls-allowed`, and strips the headers that name the server, the proxy and Next.js internals. `tests/ops/front-door.test.ts` holds it.
5. **Public endpoints say only what a monitor needs.** `/api/health` answers `{ ok, build }`, where `build` is an id made from the commit (`publicBuildId`); `node scripts/build-id.mjs <commit>` gives the id to check a deploy. `/api/ready` answers `{ ok }` and its status; the details are on Office Space's Health page.
6. **Customers read the product's words.** A test space is "a Farbaek test space" on screens, in API answers and in new signed records. Setting names, operator commands and provider details go to the server log and the staff console. Lines saved before this, and signed records that can't change, pass through `forPeople` (`src/core/text/operator-detail.ts`) when shown.
7. **The admin console isn't revealed.** `src/proxy.ts` answers a plain not found for `/admin` unless the signed-in email is on the console's list, so none of its code is sent to anyone else.

## Consequences

- Some of this was findable anyway, from DNS and certificate logs. Removing it stops advertising the map; it doesn't make it secret, and nothing here is a substitute for the server-side checks.
- A business customer that needs a named sub-processor list asks for it, and gets it under its data processing terms.
- Deploys are checked against the build id instead of the commit.
- Old messages in the database keep their text; they're only shown through `forPeople`. A one-off clean-up of those rows is optional.
