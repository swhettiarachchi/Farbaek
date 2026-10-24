# ADR 0065: Launch guards

- Status: accepted (2026-10-24).
- Builds on ADR 0064 (one trial per address), ADR 0020 (usage), ADR 0013 and 0016 (sandboxes).
- Based on the research report `reports/Farbaek public launch readiness.md`.

## Context

**Every verified address gets a 14-day trial paid from Farbaek's own keys:** about $3.70 of AI and, before this change, up to 5 sandbox hours.

**Before a public launch:**
- **Disposable addresses** made trial farming free.
- **Nothing capped the platform's total AI spend in a day.** A burst of sign-ups or a bug could spend without limit until someone noticed.
- **Trial sandbox time didn't fit the platform's budget.** It was 5 hours, 2 sandboxes at once and 2-hour sessions per trial. Vercel Sandbox Hobby gives the *whole account* 5 CPU hours a month, and is non-commercial only. Pro costs about $0.0014 to $0.0043 per site check.
- **Uptime monitors had nothing to check the database with.** `/api/health` answers without touching Postgres.

## Decision

**Disposable addresses get no trial:**
- Sign-in isn't blocked, since some listed domains are real mailboxes. The workspace starts on Free.
- The list is the CC0 `disposable-email-domains` project, pinned at commit `e4f0910` (23 Oct 2026, 9,927 domains), in `disposable_email_domains` (migration v38). A domain and its subdomains count.
- `billing_accounts.trial_withheld` records why a workspace started on Free (`disposable_address` or `address_used`), and Billing says it in words.
- No trial claim is spent on a disposable address.

**A platform-wide daily AI limit:**
- `app_reserve_usage` takes the day's limit in units from the server (`AI_DAILY_LIMIT_USD`: unset means $20, "off" removes it).
- Under one advisory lock, it refuses a reservation that would take today's reserved and settled units (UTC day, every workspace) past the limit.
- People see "Farbaek has reached its AI limit for today, so AI work is paused until midnight UTC", and the agent API answers 503.
- Older callers without the argument still work.

**The trial's sandbox shape:** 2 hours in total, one sandbox at a time, 45-minute sessions, small size only. That's about 40 to 120 site checks. AI usage stays a month of Starter.

**A readiness route:** `/api/ready` asks the database (head-only count, 5-second timeout) and answers 503 with "unreachable" when it can't. Monitors watch it. `/api/health` stays app-only, for the deploy's own check.

## Consequences

- **Worst-case cost per farmed trial falls:** about $0.34 of sandbox time on Vercel Pro instead of $1.70, plus the AI allowance, and the daily cap limits the total.
- **A real person on a listed domain gets Free,** with the reason and what to do: sign in with another address.
- **The daily cap can pause AI for everyone** on a very busy day. It's set by the owner, and a later stage can alert before it trips.
- **Not yet:**
  - **Turnstile at sign-in.** It needs a Cloudflare widget and the GoTrue CAPTCHA settings, an owner step.
  - **The real client IP for GoTrue's rate limits** (`GOTRUE_RATE_LIMIT_HEADER`). A server setting.
  - **A separate Anthropic workspace for trial traffic** with its own spend limit. An owner step.
