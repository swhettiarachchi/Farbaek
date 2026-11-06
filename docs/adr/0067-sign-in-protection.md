# ADR 0067: Sign-in protection

- Status: accepted (2026-10-24).
- Builds on ADR 0065 (launch guards), ADR 0064 (one trial per address) and ADR 0032 (Office Space sign-in).
- Based on the research report `reports/Farbaek public launch readiness.md` (abuse section).

## Context

Anyone could ask Farbaek for as many sign-in emails as they liked. Every new address gets a workspace and, unless it's disposable or already used, a trial paid from Farbaek's keys.
- **Supabase Auth's own limits** are global or see the proxy's address, not the visitor's.
- **A script** could send floods of sign-in emails to strangers, or farm trials with fresh addresses.

The research recommended Cloudflare Turnstile at sign-in, enforced by Supabase Auth (GoTrue) so calling Auth directly can't skip it. GoTrue v2.197.0's source shows:
- the check covers the email-sending endpoints;
- it reads the token from `gotrue_meta_security.captcha_token`, which supabase-js fills from `captchaToken`;
- it skips requests made with admin credentials, the server's secret key.

## Decision

**Limits in the app, on now.** Before Auth is asked to send a link, the sign-in action counts requests with `app_rate_limit`:
- 3 links per email address every 15 minutes;
- 20 per network address an hour (`src/config/sign-in.ts`).

The keys are SHA-256 hashes, never the addresses. If the limiter can't answer, no email is sent.

The address is the first `X-Forwarded-For` entry. Caddy sets that header from the connection, so the browser can't choose it.

**Rate limit windows last a day at most** (migration v39):
- `app_rate_limit` deletes every window that started more than a day ago, whatever its key;
- it refuses windows longer than a day, so the cleanup can't cut a live one short.

The Privacy Policy says sign-in counts are deleted within 24 hours, and a test reads the migration.

**Turnstile, ready for the owner's keys:**
- **Page:** with `TURNSTILE_SITE_KEY` set (public, read at request time), the sign-in form shows `TurnstileCheck`.
- **What people see:** Cloudflare's widget in `interaction-only` mode. Most people see nothing; it shows only when Cloudflare needs a click.
- **Token:** goes into the form as `captchaToken`, and the action passes it to `signInWithOtp`.
- **Without a token:** the action refuses ("Your browser is still being checked").
- **Each answer resets the widget,** because tokens work once.
- **If the script can't load,** or Cloudflare refuses the browser, the form says which in words with an icon.
- **Enforced by Auth:** `deploy/vps/supabase/compose.farbaek.yaml` passes `GOTRUE_SECURITY_CAPTCHA_*` from the Supabase `.env` (off by default).
- **Owner setup:** `scripts/vps/set-turnstile.ps1` switches on the page first, then Auth, and `-Off` reverses it in the opposite order.

**Office Space keeps working:** it sends codes with the server's secret key, which Auth exempts. The office already limits code requests per email and per address, and only sends to staff, invites or the first owner.

**Privacy Policy:** Cloudflare joins the processors (IP address and browser signals while signing in), with the sign-in counts and their retention.

## Consequences

- **Floods are capped** per address and per network address, with or without Turnstile.
- **Once the owner switches Turnstile on,** scripts need a real browser and Cloudflare's judgement to get a sign-in email, even when calling Auth directly.
- **Auth verifies the token from the app server's address,** not the visitor's. Cloudflare treats `remoteip` as optional, but this is only proven once real keys are in, with the first sign-in after `set-turnstile.ps1`.
- **People behind one network address** (an office, a school) share 20 links an hour.
- **Not yet:** GoTrue's own per-IP limits still see the proxy (`GOTRUE_RATE_LIMIT_HEADER`). Done in ADR 0176.
