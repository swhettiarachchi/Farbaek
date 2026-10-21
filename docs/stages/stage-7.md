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
