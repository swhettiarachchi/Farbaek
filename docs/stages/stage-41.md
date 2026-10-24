# Stage 41: Launch guards

The second launch stage: limits on what free trials, and any bug, can spend from Farbaek's own keys, and a check for uptime monitors that touches the database.

- **Decision record:** `docs/adr/0065-launch-guards.md`.
- **Research:** `reports/Farbaek public launch readiness.md`.
- **Branch:** `feat/launch-guards`, stacked on `feat/people-and-accounts` (#48).

## 2026-10-24

### Done

**Migration v38** (`20261109090000_launch_guards.sql`, built by a script from the pinned list):
- `disposable_email_domains`: 9,927 domains, CC0, commit `e4f0910`;
- `private.is_disposable_email`: whole labels, subdomains included;
- `billing_accounts.trial_withheld`;
- `create_organization` gives disposable addresses no trial and records why a workspace started on Free;
- `app_reserve_usage` takes `p_platform_daily_units` (default null) and refuses past it under an advisory lock;
- an index on `ai_credit_ledger (created_at)`.

**Server:**
- `platformDailyAiUnits()` reads `AI_DAILY_LIMIT_USD`: $20 by default, "off" to remove it, and nonsense falls back to the default;
- every reservation passes it;
- `PLATFORM_DAILY_LIMIT` has words and a 503 on the agent API.

**Billing** says why a workspace started on Free.

**The trial's sandbox shape:** 2 hours, one small sandbox at a time, 45-minute sessions.

**`/api/ready`:** a database round trip, for monitors.

### Verified

- **Tests:**
  - `tests/db/launch-guards.test.ts` (4):
    - disposable domains and subdomains start on Free with the reason, and spend no claim;
    - the second workspace says `address_used`;
    - whole-label matching, and the list is unreadable from the browser;
    - the daily limit across two workspaces, refunds not counting, no limit, and the older 7-argument call;
  - `src/server/ai/config.test.ts` (2);
  - catalog and trial tests updated for 2 sandbox hours.
- **Full `pnpm test`:** 1,396 passed. The v37 test's audit expectation was updated for the new `trial_withheld` field. The mesh packing test timed out under load and passes on its own (a known flake).
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean.
