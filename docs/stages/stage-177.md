# Stage 177: Developer API keys

- **Branch:** `feat/api-keys`, on `feat/free-plan-fixes` (#223).
- **ADR:** 0187.
- **Migration:** v90, `supabase/migrations/20261231090000_api_keys.sql`. It goes to production before the merge.
- **Skills:**
  - **The API's design:** `api-design`.
  - **Security:** `ecc-security-review`'s checklist, with an independent review of the diff.
  - **The Settings screen:** `ui-ux-pro-max`'s rules. Its search script couldn't run because this PC has no Python, so its rule file was read directly.
  - **Checks:** the built-in browser.

## What the owner asked

"Should I build the developer API keys next?" "Yes, you can, and use the previous skills."

## What changed

**Settings, Developer API:**
- owners and admins make a key with a name and 30, 90 or 365 days;
- the key is shown once, with Copy, and a reminder to keep it in a secret store;
- keys are listed with their first characters, maker, last use and end date, and can be revoked after a confirm;
- a "How to call the API" guide has two working examples and every endpoint;
- members are told owners and admins make keys;
- a plan without the API is told so, but can still revoke its keys.

**The API:**
- A bearer token starting `fbk_` is a key, looked up by its hash in the database on every call.
- It acts as its maker, in its own workspace, through a server-side session, so Row Level Security, the plan check and the rate limits apply as for them.
- A revoked or expired key, or one whose maker isn't an owner or admin there any more, gets 401 at once. Another workspace's id gets 403.

**Elsewhere:**
- Importing files flags `fbk_` keys.
- History says who made or revoked a key.
- Pricing shows the developer API as available again.

## Applying migration v90

Auto mode refused my read-only query to production's database, so the owner applies it, before the merge. The new code needs the table. `scripts/vps/apply-migration.ps1` does it in one command:
1. It checks the file is exactly the tested one: SHA-256 `8faf027ccdcd1278662fcda9cb0cbe189c224a062b77ed39ff199d8357be7264`, of the file with Unix line endings.
2. It sends it with `scp`, and the server checks the hash again.
3. It runs the file in one transaction.
4. It records it in `supabase_migrations.schema_migrations`.
5. It reloads the API's schema cache and reads back the table and trigger.

The commands go to the server on standard input, because Windows PowerShell mangles quotes on a command line.

## The independent security review

It found nothing critical or high. It found five real issues and one gap in the docs, all fixed:

1. **A stopped key could come back.** A key whose maker was demoted or left stopped working, but worked again if they regained the role. Settings also still called it "Works". Now a trigger on memberships revokes their keys there for good, recorded as Farbaek's doing. Deleting a whole workspace isn't held up by it.
2. **Sessions lingered.** A session that's replaced, or dropped from the server's memory, is now signed out at Auth.
3. **A session was never checked for its owner.** A new session is now checked to belong to the key's maker before it's used, for the rare case of an address changing mid sign-in.
4. **A database outage looked like a revoked key.** It now answers 503 and says the key itself is fine, so nobody replaces a key for nothing.
5. **Keys couldn't be revoked while the workspace was paused or suspended.** Now they can, so a leaked key can be stopped then.
6. **The guide was missing the call that lists previews.** It's added.

**Kept, and why:** a key that has no session yet signs its maker in through Auth's one-time link, as the iPhone app does. That happens on its first call, after a restart, or after a failed refresh. It can cancel an emailed sign-in link the maker was about to use, and it counts as a sign-in in Auth's log. Nothing in this codebase can mint sessions any other way, and it happens rarely.

## Verified

- **Database:** 14 tests on the new table, functions and trigger:
  - only owners and admins make or revoke a key;
  - a key works as its maker;
  - it stops when it expires, is revoked, or the workspace is suspended;
  - it's revoked for good when its maker leaves or is demoted, even if they're promoted again;
  - deleting a workspace with keys still works;
  - a workspace holds at most 10 working keys;
  - the names and hashes keep their shape;
  - browsers can list keys but never read a hash;
  - only the server can call the functions.
- **Unit:** 10 tests on the key itself, the session it acts through (reused, refreshed, signed in again, one sign-in for simultaneous calls, never shared between keys or people, never another account's, replaced ones signed out) and the hash lookup. Also tests for flagging keys in files and History's words.
- **Checks:** `pnpm typecheck`, `pnpm lint` and the tests.
- **On the demo dev server:** Settings shows the section and the guide at phone width, with no sideways scroll and no console errors. The demo is read-only, so the form shows its reason there.
