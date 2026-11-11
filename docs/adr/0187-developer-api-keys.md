# ADR 0187: Developer API keys

- **Status:** accepted
- **Date:** 2026-11-11
- **Stage:** 177
- **Builds on:** ADR 0175 (the developer API is Lite and up) and the v1 test space API (`src/app/api/v1/sandboxes`).

## Context

The pricing page sold "Developer API and SDK access" from Lite up. The API worked, but only with a person's sign-in session token, which lasts an hour, and the website gave no way to get one and no docs. Stage 176 marked it "Coming soon". The owner asked for it to be built.

## Decision

**Owners and admins make keys in Settings, under Developer API.**
- **A key** is `fbk_` plus 32 random bytes in base64url (256 bits). It's made on the server, shown once with a Copy button, and only its SHA-256 is stored. Settings shows its first eight characters later, so people can tell keys apart.
- **Each key has a name** and works for 30, 90 or 365 days. There is no key that never ends.
- **At most 10 working keys** per workspace. The database holds that under a lock, so two clicks can't pass it.
- **Making a key needs the plan's developer API.** Revoking never does, so a workspace that moves to Free can still turn its keys off.
- **Making and revoking are audited** with the key's name and first characters, never the key or its hash. History shows them under Rules and checks.

**A key acts as the person who made it, in its one workspace,** with the role they have there at the moment of each call.
- **Checked in the database on every call** (`app_api_key_session`), by the key's hash. The key must be unrevoked and unexpired, and its maker still an owner or admin of its workspace. Otherwise the answer is 401 at once. A suspended workspace gets 403, and a database that doesn't answer gets 503, never "revoked".
- **Revoked for good when its maker leaves or stops being an owner or admin.** A trigger on memberships does it, so a key that leaked can't come back if they're promoted again.
- **Revoking works while the workspace is paused or suspended,** so a leaked key can be stopped at any time.
- **Row Level Security still applies.** The server opens a sign-in session for the maker that never leaves the server. It's kept in memory per key and refreshed with its refresh token, then every call reads and writes as that person, under the same rules as when they're signed in.
  - Concurrent first calls share one sign-in.
  - A new session is checked to belong to the maker.
  - A session that's replaced, or dropped from memory, is signed out at Auth.
- **The same checks as before then apply:** the plan's developer API, the per-person rate limits (429 with Retry-After), and the test space service's own workspace checks.
- **One workspace per key.** A key's calls go to its own workspace, and naming another in `X-Farbaek-Workspace` gets 403.

**Docs sit beside the keys:** how to send a key, two working `curl` examples, and every endpoint with what it does.

**Keys in files are flagged.** Importing a project screens out files holding an `fbk_` key, as it does for other credentials.

**Pricing says the developer API is available again.**

## Consequences

- **Stage 176's "Coming soon" label is gone:** the feature is sold as working, and it is.
- **Every key call starts by looking up the key's hash.** A new key's first call also signs its maker in, which shows in Auth's own log. Sessions are capped at 500 in memory, and a restart means each key signs in again on its next call.
- **The TypeScript client in `src/sdk` works with a key** (pass it as `accessToken`). It isn't published as a package, so the docs show plain HTTP.
- **Migration v90** adds the `api_keys` table and three service-role functions. It goes to production before the merge, checked by its SHA-256.
