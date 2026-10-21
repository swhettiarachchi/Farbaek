# Stage 7: Office Space

The owner asked for a private office for Farbaek's CEO, admins and staff, on its own subdomain and with high security, with the CEO signing in as info@farbaek.com.

- **Plan:** approved 2026-10-21.
- **Decision record:** `docs/adr/0032-office-space.md`.
- **Research:** `reports/Secure staff office console design.md`.
- **Recovery runbook:** `docs/runbooks/office-recovery.md`.

## 2026-10-21: Phase 1, the foundation and the read-only office

### Done

**Migration v20** (`20261022090000_office_space.sql`):
- **Tables:** staff members, invites, sessions, the hash-chained audit log and its verifications. RLS is on with no policies, and the server key can only read them.
- **Functions:** service-role-only `app_staff_*`:
  - sign-in eligibility;
  - the first-owner bootstrap (race-safe, only while there's no owner);
  - joining from an invite;
  - session checks (30 minutes idle, 12 hours in all, ended when Supabase signs the session out);
  - staff management (invite, revoke, change role, remove, allow an authenticator reset, end sessions).
- **Rules:** nobody changes themselves; a trigger keeps an owner; triggers refuse edits and deletes in the log.

**Routing** (`src/server/http/hosts.ts`):
- the office host maps every path under `/office`;
- `/office` is not found anywhere else;
- every other name under farbaek.com answers not found, including officespace while `OFFICE_HOST` is unset;
- previews and published sites are unchanged.

**Session and headers:**
- the `__Host-fb-office` cookie, hardened whatever @supabase/ssr asks for;
- a nonce CSP, COOP and `no-store` from the proxy;
- the static office headers from `next.config.ts`, with the customer headers kept off the office host.

**Sign-in:**
- an email code (never a link), then an authenticator code;
- the same reply for every address;
- limits per address, per network and on wrong codes;
- enrolment only for the bootstrap owner, an invite, or inside a reset window.

**Pages:**
- **Overview:** AI list cost marked as an estimate, and revenue tiles that say "Billing not connected".
- **Workspaces, People and Activity:** ported from `/admin`; people's emails are masked for viewers.
- **Staff:** invite, change role, end sessions, reset an authenticator, remove, each with a reason, and severe ones with a fresh code.
- **Audit log:** a chain check and older pages.
- **My security:** a second authenticator, removing one, ending other sessions.

The proxy, `requireStaff` and `staffAction` check the host, `aal2`, the 12-hour limit, the session row and the role on every request.

**Docs and tooling:**
- ADR 0032 and the recovery runbook;
- the `farbaek-office` project skill;
- `OFFICE_HOST` and `OFFICE_OWNER_EMAIL` in `.env.example`;
- a `farbaek-office` launch configuration for local checks.

### Applied to the hosted database

**Migration v20** went in through the Supabase SQL Editor, after the plan's approval.
- **Hash check:** the editor held exactly the tested file (SHA-256 `508edfaa7c2994b3d22eb1fad0ff1d5bbfb52d9a0ea3821f161e46638c27481f`, 38,731 bytes).
- **RLS warning:** Supabase warned about `private.staff_audit_head`, which has no row-level security. That schema isn't exposed through the API and all access is revoked, so it was run as written.

Read-only checks afterwards:
- 15 `app_staff_*` / `app_record_staff_event` functions;
- every staff table has row-level security on, the server key can only read it (no insert or update), and `authenticated` can't read it;
- `authenticated` can't run `app_staff_begin_session`;
- the five protective triggers exist;
- the chain head is at genesis (0);
- the functions' owner (`postgres`) can read `auth.sessions`, so a session signed out in Supabase ends in the office too.

### Supabase Auth, set up ahead of the merge

- **The "Magic link or OTP" and "Confirm sign up" email templates:** both now show the 6-digit code under the existing link, with a line telling office staff to use the code. Customers' links are unchanged. Both were checked after a reload.
- **Redirect URLs:** `https://officespace.farbaek.com/sign-in` added (five in all). The Site URL stays www.
- **Multi-Factor:** TOTP (app authenticator) is enabled. SMS MFA stays off (it's a paid add-on).

### Verified

**Unit and database tests:**
- 15 PGlite staff tests: grants, the bootstrap and its limits, sessions (replaced, idle, 12 hours, signed out in Supabase), invites, no changing yourself, the last-owner rule, removal, the authenticator reset window, refused event names, and the chain (gapless, accepted by the verifier, triggers refuse edits, tampering detected);
- the SQL and TypeScript permission matrices match;
- routing cases, header rules, sign-in use cases, cookie hardening and the office gate;
- design guards: every console page and action checks the staff member, no `/office` links, and customer code doesn't import office code;
- full suite: 938 passed.

**A local production build with `OFFICE_HOST=officespace.localhost:3000`, against the hosted Supabase project:**
- `localhost:3000/office` and `/office/staff` answer 404;
- the office root redirects to `/sign-in`, and `/api/health`, `/app` and `/office/staff` there are 404;
- office responses carry the nonce CSP (every script has the nonce), COOP, `no-store`, `no-referrer`, their own HSTS and `noindex`;
- the customer site keeps its headers;
- a POST from `http://localhost:3000`, or with no Origin, is refused with 403;
- asking for a code for an address that isn't staff shows the same reply as for staff, sends nothing, and the server logs no errors.

### Not verified yet (needs the owner)

- The CEO's first sign-in. The code, the authenticator, the bootstrap and the console pages can only be exercised by someone with the info@farbaek.com mailbox and their own authenticator app.
- Production routing: it waits for the merge and the domain swap.
