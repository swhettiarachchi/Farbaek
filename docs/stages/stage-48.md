# Stage 48: Download your data

People can download what Farbaek holds about them from Settings, without writing to support.

- **Decision record:** `docs/adr/0070-account-export.md`.
- **Branch:** `feat/account-export`, from `main` at `bf39f18`.

## 2026-10-24

### Done

- **Migration v42** (`20261113090000_account_export.sql`): `app_account_export(user)`, one JSON document, for the server key only.
- **`GET /app/account/export`:** the person from their session, 5 an hour, never cached, and a 404 with the reason in the demo.
- **Settings > Your data:** the download, unavailable in the demo with the reason. The account deletion text points to it.
- **Privacy Policy:** "Your rights" lists the download, and support is for anything else.

### Verified

- `tests/db/account-export.test.ts` (5):
  - the account, email choices, workspaces and what the person created;
  - Farbaek's replies included and staff-only notes left out;
  - actions without details (an invitee's address doesn't appear);
  - each person sees only their own;
  - browsers are refused.
- **Demo build:**
  - the route answers 404 with its reason;
  - `qa:responsive` (375 and 1280) and `qa:a11y` on `/app/settings` and `/privacy` are clean;
  - the card was looked at at 375px.
- `pnpm typecheck` and lint are clean; the full suite run is in the PR.

### Next

- The owner downloads their own data once after the merge, as the production check.
