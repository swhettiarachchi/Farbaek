# Stage 37: Production, connected

Several things production needed were set up but not switched on. Today they were.
- **Signing:** stage 35 built it, but the key wasn't set.
- **Email:** stage 33 built it, but the password wasn't set.
- **The check sandbox:** it hasn't been connected since the move to the VPS.
- **The bare domain:** Spaceship's forwarding sent every path to the homepage.

Without the sandbox, every task page said "No isolated sandbox runtime is connected yet" and "Check the site now" was unavailable. That's why production has no check runs and no signed ProofPacks.

- **Branch:** `feat/production-setup`, from `main` after #41.

## 2026-10-24

### Done

**The signing key** (stage 35): the owner ran `set-signing-key.ps1`. The key list publishes `farbaek-e8ba74d4b1da3559`.

**The bare domain** (stage 36): `farbaek.com` points at the server, and Caddy redirects every path and query to www.

**Email** (stage 33, #41):
- I brought #41 up to date with main;
- the password script now stops on a failure;
- the owner merged it and ran the script, and the app restarted with it at 07:35:37 UTC.

**The check sandbox** (ADR 0016):
- **Why it was off:** the Railway incident (2026-10-21) listed the Vercel token for rotation, but only the two random sandbox secrets were set on the VPS.
- **`scripts/vps/set-sandbox.ps1` (new):**
  - asks for a Vercel access token (hidden) and checks with Vercel that it reaches the sandbox project, showing only the status;
  - saves the four settings on the server and in the checkout's local settings, for the smoke test.

  Its local-settings update was tested on a scratch file: it keeps other lines, replaces old values, and writes LF with no BOM. It parses in Windows PowerShell 5.1 and refuses malformed IDs.
- **The token:** the owner made `farbaek-sandbox-2`, scoped to the team, with a 90-day expiry, and ran the script.
- **The guide:** `docs/deploy/vps.md`, "The check sandbox".

### Verified

- **`pnpm check:env`:**
  - the provider is vercel, the token and both IDs are well formed, and Vercel Sandbox accepts the token;
  - the stale local Supabase, Anthropic and Gemini keys fail, as expected after the incident's rotation;
  - production's keys live only on the VPS.
- **`pnpm sandbox:smoke` passed 8 of 8 on a real Vercel sandbox:**
  - starts a sandbox with no network;
  - real output and exit codes;
  - a timeout that kills;
  - file round-trips;
  - no Docker socket, and none of the server's secrets inside;
  - cloud metadata and the internet unreachable;
  - destroyed on request.

**Checks switched on.** With the owner's go-ahead, I saved `SANDBOX_ISOLATION_VERIFIED_AT=2026-10-24` on the server and restarted the app (live 08:03:58 UTC). The task page then said "Sandboxed · Vercel Sandbox", and "Check the site now" was available.

**The first press failed: "Your workspace has used its sandbox minutes for this period."**
- The cause was session `bd325814` from 18 October, counted at 428,105 seconds (119 hours).
  - Its stop was recorded about five days late, while no runtime was connected to finish it.
  - Running time counted up to that record, though the runtime had killed the sandbox at its 15-minute expiry.
- **Migration v35** (`20261106090000_sandbox_time_cap.sql`) fixes it:
  - running time counts only until `expires_at`, in the plan's minutes check and when a segment closes;
  - sessions already counted past it are capped at their lifetime, each with a `session.billing_corrected` event;
  - the old two-argument function is dropped.
- `runningSeconds` in `src/core/sandbox/usage.ts` counts the same way for the usage display.
- **Tests:** `tests/db/sandbox-time-cap.test.ts` (5) covers the late stop, a session running now, a session left marked running, and the correction. The existing sandbox tests still pass.
- **Production:**
  - a read-only preview showed one row to correct;
  - v35 was applied with the hash-verified pattern (`39e5ed68…2b25c6`);
  - read back: `bd325814` now counts 900 seconds, with its correction event, and only the three-argument function exists;
  - the workspace has used 17.9 minutes.

**The second press worked, end to end:**

| What | Result |
| --- | --- |
| The check | A real Vercel sandbox (`5913c84e`) ran `node .farbaek-checks/check-site.mjs`, which exited 0 |
| The task | Now `VERIFIED` |
| The ProofPack | `b8b6d5d2…9b41c`: `verified`, typed `https://farbaek.com/proofpack/v1`, and signed with `farbaek-e8ba74d4b1da3559` as it was recorded |
| The download | Carries the DSSE envelope. On the live verify page: "Intact. This ProofPack is exactly what Farbaek recorded." and "Signed by Farbaek with key farbaek-e8ba74d4b1da3559" |
| Email | `email.sent` for "checks_finished", after the first press too |

**The homepage's status list, brought in line:**
- **Moved:**
  - "Signed ProofPacks anyone can check, in the browser or with OpenSSL" moves to Built and working;
  - app previews move to Next, since they're off in production (Vercel Sandbox doesn't serve them, and the preview domain waits for a wildcard certificate).
- **Wording:**
  - the checks line names site checks in a sandbox;
  - the FAQ no longer says app previews run.

Checked on a demo build at 375 and 1280 px: no sideways scroll, no errors.

### Checks

`pnpm typecheck`, `pnpm lint` and the full `pnpm test` (1,366 passed) are clean.

### Not verified

- **That the two emails reached the inbox.** Spacemail accepted them (`email.sent`); the owner's inbox is the check.

### Next

- **The other two waiting tasks:** Volt Ride and the starter check.
- **App previews:** the wildcard certificate for farbaek.si.
