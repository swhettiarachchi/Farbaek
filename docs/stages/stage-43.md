# Stage 43: Sign-in protection

The fourth launch stage: limits on sign-in emails now, and Cloudflare Turnstile ready to switch on with the owner's keys.

- **Decision record:** `docs/adr/0067-sign-in-protection.md`.
- **Branch:** `feat/sign-in-protection`, stacked on `feat/legal-pages` (#50), because it adds Cloudflare to the Privacy Policy.

## 2026-10-24

### Done

**Migration v39** (`20261110090000_sign_in_guard.sql`):
- `app_rate_limit` deletes every window older than a day, whatever its key;
- it refuses windows longer than a day;
- an index on `window_start` keeps the cleanup cheap.

**Sign-in rules** (`src/server/auth/sign-in.ts`), in order:
1. a valid address;
2. a browser check token once Turnstile is on;
3. 3 links per email address every 15 minutes, and 20 per network address an hour, both counted by hash, failing closed;
4. then Auth.

Auth's refusals have their own words: too many, check failed, or not sent.

**Turnstile:**
- `TurnstileCheck` loads Cloudflare's script only when `TURNSTILE_SITE_KEY` is set;
- it shows the widget only when a click is needed;
- it puts the token in `captchaToken` and resets after every answer;
- it says in words whether the script couldn't load or the check didn't pass.

**Office Space** sends codes with the server's secret key, which Auth doesn't check.

**Server setup:**
- `compose.farbaek.yaml` passes `GOTRUE_SECURITY_CAPTCHA_*`, off by default;
- `scripts/vps/set-turnstile.ps1` switches it on (page first, then Auth, then reads it back);
- `-Off` reverses it;
- `docs/deploy/vps.md` has the steps.

**Privacy Policy:**
- Cloudflare is in the processors;
- sign-in counts are described, and deleted within 24 hours;
- `src/config/legal.test.ts` reads the migration that defines `app_rate_limit`.

### Verified

- **Tests:**
  - `src/server/auth/sign-in.test.ts` (8): order, hashing, both limits, failing closed, token required and passed, oversized token, Auth's refusals, no em dashes;
  - `tests/db/sign-in-guard.test.ts` (4): counting, the day-old cleanup across keys, window bounds, browsers refused;
  - `tests/db/sandboxes.test.ts` still passes with the new function;
  - `src/config/legal.test.ts` (4).
- **The widget, on a dev server at 375px with Cloudflare's test site keys** (the form wasn't submitted, since dev uses the real Auth):
  - forced click (`3x…FF`): the widget fills the form's width, and ticking it puts a token in `captchaToken` inside the form;
  - always passes (`1x…AA`): nothing shows, the token is there, and the email field and button keep their 20px gap;
  - always fails (`2x…AB`): "The browser check didn't pass…" with an icon.
- **Not verifiable here:** Auth enforcing a real token, and the office's secret-key exemption with the check on. Both are proven by the first sign-ins after `set-turnstile.ps1`.

### Next

- **Owner:** create the widget and run `set-turnstile.ps1`, then sign in on both sites.
- **Code:** heartbeat pings for the timers, encrypted off-site backups, an export of everything a person has.
