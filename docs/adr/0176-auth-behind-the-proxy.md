# ADR 0176: Auth behind the proxy

- Status: accepted (2026-11-06).
- Extends ADR 0036 (the database on our own server), ADR 0065 (launch guards) and ADR 0067 (sign-in protection). Closes what ADR 0175 left open.

## Context

ADR 0065 and ADR 0067 both noted that Auth's per-address limits "see the proxy" and left `GOTRUE_RATE_LIMIT_HEADER` for later. The truth was worse. Without that header, Auth applies no per-address limit at all. Thirty-six wrong codes in a row for a made-up address, sent to `POST api.farbaek.com/auth/v1/verify`, were all answered without a limit.

That matters because a sign-in email creates a 6-digit code as well as its link, even when the email only shows the link. Someone could ask for a sign-in email in another person's name, then guess the code. It has a million values and lasts an hour, so guessing fast enough would have a real chance. That's an account takeover, and it had to be fixed before launch.

Separately, Auth's default allows 30 sign-in emails an hour across the whole platform. A busy launch day would have told people they couldn't sign in.

## Decision

**Close the door first.** Nothing outside the server needs these APIs: the browser, the phone apps and the desktop app all go through the app, which calls them from the server. So from outside, Caddy forwards only:
- `/auth/v1/authorize` and `/auth/v1/callback`, which signing in with Google or Apple needs;
- `GET /auth/v1/verify`, an email's link, which carries a long token nobody can guess.

Everything else answers 404, including `POST /auth/v1/verify`, `/auth/v1/token`, `/auth/v1/otp`, `/auth/v1/signup` and `/rest/v1`. This is enforced at the proxy, so it doesn't depend on any key staying private.

**Then limit what's left.** Caddy sets `X-Farbaek-Client-Ip` to the caller's address for those few paths, and removes any such header on the app's own calls. Auth limits by it. The app's calls carry no value, so one person's limit is never shared by everyone signing in through the app.

**More sign-in emails.** `GOTRUE_RATE_LIMIT_EMAIL_SENT` is 300 an hour. Each address still waits between emails.

## Consequences

- A script that talks to these APIs from elsewhere gets a 404. Scripts on the server itself still work.
- The server's own address is in the Caddyfile. If the server moves, this rule moves with it, along with the ones in `docs/deploy/vps.md`.
- Auth reads the settings when it restarts, not when the app deploys: `cd /opt/farbaek/supabase/docker && docker compose up -d auth`.
- Spacemail's own sending limit may be lower than 300 an hour. If it is, emails fail at Spacemail, and that's the next thing to change.
