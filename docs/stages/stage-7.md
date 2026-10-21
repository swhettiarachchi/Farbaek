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

## 2026-10-21: Phase 2, controls enforced in the database

### Done

**Migration v21** (`20261023090000_office_controls.sql`):
- **Workspaces:** suspension columns, and `require_contributor` refuses a suspended workspace's members.
- **Activity guards:** `guard_activity` BEFORE INSERT triggers on the 16 tables where activity starts. They catch the functions that check membership themselves, and the five platform switches.
- **Sites:** blocking columns, plus a trigger so a blocked site can't go live again.
- **Serving:** `app_site_for_serving` returns live, none, blocked, paused or suspended.
- **Staff functions:** suspend and restore, block and unblock, add AI usage (an adjustment grant capped by role, with a fresh code above $100, never billing), set a switch (owner and a fresh code), and publish or end an announcement. Each records one chained event; workspace actions also write a customer `farbaek.*` audit row with the public notice only.

**Customer app:**
- a suspended workspace turns writes off with the staff notice;
- AI, sandbox and publish messages explain a pause (a 15-second snapshot of the switches; the database stays the authority);
- new error codes have plain messages;
- announcements show across the top (notices can be closed, incidents can't);
- a site owner sees why their site was taken offline;
- visitors get a neutral 403 or 503.

**Office:**
- **Workspace 360:** members, projects and sites, runs, AI usage and grants, Add AI usage, and Suspend or Restore with a typed name;
- **Sites:** take a site offline or restore it;
- **Controls:** the five switches;
- **Announcements;**
- a **More** page for the phone bar.

Suspending a workspace, or pausing AI, stops live runs on this server.

### Applied to the hosted database

Migration v21 went in through the SQL Editor:
- **Hash check:** the editor held exactly the tested file (SHA-256 `ffde3dbb014b43091720478957da28619ea6bcbc6ef313d08c1dec42fbc6f5c7`, 23,385 bytes). There was no RLS warning this time.
- **Read-only checks afterwards:**
  - five switches, none paused;
  - 17 guard triggers;
  - both column pairs present;
  - all nine functions;
  - `authenticated` can't run `app_staff_set_flag` or update the switches;
  - no workspace suspended;
  - `app_site_for_serving` answers `none` for an unknown name.

It had to go in before this code deploys, because the workspace query now reads the suspension columns.

### Verified

- PGlite `office-controls.test.ts` (10 tests):
  - suspension blocks members' writes through `require_contributor` and the insert guards, keeps the data and lets plain updates through;
  - a restore brings writes back;
  - a blocked site can't go live again but can stay offline;
  - each switch blocks its work and only that;
  - usage caps and the fresh code, with no billing change;
  - announcements are readable while live, without the author;
  - browsers are refused;
  - refused calls record nothing.
- Database suite: 187 passed. Unit, design and serve tests: passed.

## 2026-10-21: Phase 3, the owner's numbers, trial extensions and quick search

### Done

**Migration v22** (`20261024090000_office_metrics_and_trials.sql`):
- A trial can now run 14 to 44 days (`trials_length_14_to_44_days`). New trials are still exactly 14.
- `app_staff_extend_trial`: support adds up to 7 days, once; admins up to 14; owners up to 30. Never past 44 days from the start. It moves the trial's usage grant with it, writes `farbaek.trial_extended` to the workspace's log and one chained staff event.
- `app_office_metrics(p_now)`: counts only, in one call:
  - sign-ups, with 14 days by day;
  - workspaces, active in 7 days and suspended;
  - activation of the 8 to 60 day cohort;
  - live and blocked sites;
  - AI list cost by day;
  - runs this week;
  - the trial funnel.
  No names, no emails, no revenue.
- `app_office_search(p_query)`: up to 8 workspaces (name or id prefix), people (email) and sites (name). Wildcards are treated as text, and anything under 2 characters returns nothing.

**App:**
- `trialWindow` uses the stored end when it's a valid 14 to 44 days, so an extension shows everywhere: plan label, days left, wallet expiry.
- **Overview:** two trend tiles (sign-ups, and AI cost marked as an estimate) with 14-day sparklines, then three counts (active workspaces, activation, live sites). Below them:
  - the trial bar, where "Became paid" says "Billing not connected";
  - runs this week;
  - the month's cost;
  - revenue tiles that stay unavailable;
  - connections.
- **Workspace 360:** an "Extend the trial" form. It shows the days so far, the role's cap and the 44-day ceiling, and says so plainly when support has already used its one extension.
- **Quick search:** Ctrl or Cmd+K, or the header button (an icon on phones).
  - Pages match as you type; records come from the server after 2 letters.
  - A slower answer never replaces a newer one.
  - Emails are masked on the server for roles that may not read them.
  - It only navigates, so every rule still applies on the page it opens.

### Applied to the hosted database

Migration v22 went in through the SQL Editor:
- **Before:** v21 present, none of the v22 functions, the old trial check in place, and no trial other than 14 days.
- **Hash check:** the editor held exactly the tested file (SHA-256 `6c8e4e8d8a98d657b756bf4118bbf680399d0a4d53a81819de268184c303b428`, 9,800 bytes).
- **After:**
  - the three security-definer functions are in place;
  - the old check is gone and the new one is present;
  - `authenticated` can't read the metrics, and `anon` can't search;
  - the service role can extend;
  - a 1-letter search returns empty lists;
  - the metrics return 14 days of AI cost.

### Verified

- PGlite `office-metrics.test.ts` (5 tests):
  - the caps per role, support only once, and the 44-day ceiling;
  - the grant's expiry moves, with one event per success and none on failure;
  - the metrics on seeded data, with no billing fields;
  - search by name, id prefix and email, with wildcards treated as text;
  - browsers are refused.
- The schema test follows the new trial rule.
- Unit tests: `trialWindow` with a stored end, the sparkline path, and search query rules and masking.
- `pnpm typecheck`, `pnpm lint` and `pnpm build` pass. Full `pnpm test`: 965 passed. The one failure was the known executor race, which passes on its own (3 of 3).
- **Layout:** checked with a static render of the overview and Workspace 360 using sample numbers, at 960px and 375px. No horizontal scroll, and the palette fits a phone.

### Not verified yet (needs the owner)

- The live console with real data. That needs the CEO's first office sign-in, after Railway deploys #6 and the office host is set up.

## 2026-10-21: Phase 4, support requests and system health

### Done

**Migration v23** (`20261025090000_support_and_health.sql`):
- **`support_threads` and `support_messages`:**
  - a request belongs to the person who wrote it;
  - RLS shows them only their own requests and never internal notes;
  - column grants hide the assignee, a message's author and the `internal` flag, so staff identity never reaches a customer;
  - browsers can't write.
- **No activity guard on support tables:** a suspended workspace, or a paused platform, can still reach Farbaek.
- **Customer functions:** `app_support_open` (5 new requests a day each), `app_support_reply` (30 messages an hour, and it reopens a closed request), `app_support_close` and `app_support_mark_seen`.
- **Staff functions:** `app_staff_support_reply` (a reply, or an internal note) and `app_staff_support_update` (assign, unassign, close, reopen). Each writes one chained staff event that records the action, never the message.
- **Permissions:** `support.read` and `support.reply` for owner, admin, support and trust and safety. Viewers don't read customers' messages.
- **Office reads:** `app_office_support_queue`, `app_office_support_thread` and `app_office_health`.

**Customer app:**
- **Help and support at `/app/help`:**
  - your requests, each with its status in words and an icon;
  - a new request form: topic pills, subject and message, with "never include passwords or secret keys";
  - a request page with the conversation: replies signed "Farbaek support" under the logo, and a compact reply box that stays in reach on phones;
  - Close request.
- **Unread replies:** a badge on Help in the sidebar, a dot on More on phones, and a count on the More page.
- **No more dead ends:**
  - the suspension banner links to "Contact Farbaek support";
  - a site taken offline links to "Ask Farbaek about this".

**Office Space:**
- **Support:**
  - Waiting on us, Answered and Closed, with an abuse-only filter;
  - each row shows the email, workspace, message count, wait time and assignee;
  - the nav shows a waiting count;
  - a request page with internal notes on a hatched background, a Reply or Internal note switch, a side card with the workspace (plan, trial days, suspension), and Assign to me, Close and Reopen.
- **Health:**
  - checks for the database round trip, agent runs (stuck after 10 minutes), failures in 24 hours, the audit chain (unknown until checked, needs a look after 7 days or a break), paused switches and the support queue (needs a look after a day);
  - each check says OK, Needs a look or Unknown, in words and with an icon;
  - this server's commit, region, uptime, memory and live runs;
  - connections.
- **Phone bar:** Overview, Workspaces, Support, Controls and More.

### Applied to the hosted database

Migration v23 went in through the SQL Editor:
- **Before:** v22 present, no support tables or functions.
- **Hash check:** the editor held exactly the tested file (SHA-256 `48ce97b02d30c06aefc389ef0f91e923f05a3367459ad29677d3809163f54b6a`, 17,020 bytes).
- **After:**
  - RLS on both tables;
  - all nine security-definer functions in place;
  - support can read requests, viewers can't;
  - `authenticated` can't call `app_support_open`, can't see the assignee or `internal`, and can't insert;
  - no requests yet;
  - the health read and the queue answer.

### Verified

- PGlite `support.test.ts` (7 tests):
  - open, answer, close and reopen;
  - another person sees nothing;
  - the column grants hold;
  - the topic, workspace and length checks;
  - writing while suspended and paused;
  - the daily limit;
  - staff events without the body;
  - viewers refused;
  - the queue and thread reads;
  - the health read.
- Permission matrix: the TS and SQL copies are still equal.
- Unit: support rules, unread logic and wait times; support writes and their error mapping; the health verdicts.
- `pnpm typecheck`, `pnpm lint` and `pnpm build` pass. Full `pnpm test`: 982 passed.
- **Layout:** checked with a static render of all six new pages using sample data, at 375px and 1100px. No horizontal scroll. Fixed from that check:
  - status chips now sit under the subject;
  - a compact reply box on phones;
  - short tab names;
  - message headers that wrap cleanly.

### Not verified yet (needs the owner)

- Sending and answering a real request end to end. That needs a signed-in customer on www and the CEO's office sign-in, after Railway deploys.
