# ADR 0032: Office Space, the staff console

- Status: accepted (2026-10-21). Supersedes ADR 0026 once the CEO has signed in on production.
- Research: `reports/Secure staff office console design.md` (152 dated sources).

## Context

The owner asked for a private office from which Farbaek's CEO, admins and staff run the whole platform, on its own subdomain and with high security. The CEO signs in as info@farbaek.com.

The existing `/admin` (ADR 0026) was safe only because it couldn't change anything: it sat behind an email allowlist and a magic link, with no second factor. The first write button removes that defence. So the office's sign-in, staff table and audit log have to exist before any control.

## Decision

**Host:**
- `officespace.farbaek.com` (`OFFICE_HOST`), served by the same Next.js app and Railway service as www, as the owner chose.
- `src/server/http/hosts.ts` routes by host. On the office host, every path maps under `/office`, so no customer route answers there.
- Anywhere else, `/office` doesn't exist.
- Every other name under farbaek.com answers not found, including the office host while it's switched off. A wildcard `*.farbaek.com` on Railway can therefore replace the `www.farbaek.com` entry without exposing anything; Hobby allows two domains per service.
- farbaek.si was refused: it holds people's published sites.

**Session** (`src/server/office/supabase.ts`):
- The office has its own cookie, `__Host-fb-office`: Secure, HttpOnly, SameSite=Strict, path `/`, no Domain, 12 hours at most.
- All auth calls run in server actions on the office host.
- Writes must carry the office's Origin, or `Sec-Fetch-Site: same-origin`. The proxy checks this, and every action checks it again.

**Sign-in:**
- First an email code, never a link, so mail scanners can't use it up and the session is born on the office host.
- Then a TOTP code from an authenticator app, which gives `aal2`. TOTP is the floor because Supabase passkeys are still in beta (May 2026) and WebAuthn as a second factor is still experimental. Two authenticators per person replace recovery codes.
- A code is sent only to staff, open invites and the first-owner address while there's no owner, but every address gets the same reply.
- A new authenticator can be added from a mailbox alone only during the first-owner bootstrap, with an open invite, or inside a 24-hour reset window an owner opens. That closes the "own the mailbox, enroll your own factor" bypass.

**Every request** (`requireStaff` / `staffAction` in `src/server/office/access.ts`) checks, in order:
1. the host;
2. `aal2`;
3. the email code is no older than 12 hours (from `amr`, failing closed);
4. the database's session row: not idle for 30 minutes, not ended, the Supabase session still exists;
5. the role, read again from the database;
6. the permission matrix in `src/core/office/permissions.ts`.

The database repeats the matrix in `private.staff_can`, and a test keeps the two equal.

**Roles:**
- Five roles: owner, admin, support, trust and safety, viewer.
- Staff changes, kill switches and large usage additions are owner-only. Each consequential action needs a reason; the severe ones also need a fresh authenticator code checked in the same request.
- Nobody changes their own role, and a trigger refuses any change that would leave no owner.

**Audit log** (migration v20, `staff_audit_events`):
- Append-only:
  - the server key can only read it;
  - triggers refuse UPDATE, DELETE and TRUNCATE, even from the table's owner;
  - there are no foreign keys.
- Each event stores its facts as a JSON envelope and `row_hash = SHA-256(prev_hash + envelope)`. `src/core/office/audit-chain.ts` re-checks the chain from the console, and each check is recorded in its own append-only table.

**Headers:**
- Office responses get a nonce CSP (the office is always dynamic), `no-referrer`, COOP and CORP same-origin, `no-store`, their own HSTS and `noindex`.
- The hostname will be public through certificate logs, so obscurity isn't counted as protection.

## Consequences

- **Shared process:** the office's code runs in the same process as the customer app. The offsets are routing by host, a guard on every page and action, a design test, and a lint-style test that keeps customer code from importing office code.
- **Signing out elsewhere:** Supabase signs out a person's other `aal1` sessions when they verify a TOTP code. If the CEO also uses info@farbaek.com on www as a customer, those sessions end at each office sign-in. Use a different address on www.
- **No invite emails:** there's no email provider, so an invite is an allowlist entry the owner passes on in person.
- **Recovery** lives outside the app: `docs/runbooks/office-recovery.md`.
- **Later:** controls with enforcement (suspend, take sites offline, add AI usage, kill switches, announcements) come in migration v21. Metrics and polish come after that.
- **Optional, the owner's call:**
  - Supabase Pro (session time-boxes, longer auth logs);
  - Cloudflare Access (needs farbaek.com's DNS moved);
  - Railway Pro (a gap-free domain swap).
