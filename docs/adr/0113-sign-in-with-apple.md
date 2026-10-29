# ADR 0113: Sign in with Apple in Farbaek for iPhone

- Status: accepted (2026-10-29).
- Builds on ADR 0110 (Farbaek for iPhone) and ADR 0064 (deleting an account).
- Migration v72 (`supabase/migrations/20261213090000_apple_sign_in.sql`).

## Context

The owner asked for "Apple register and login to Farbaek". Until now the app signed in only through www.farbaek.com in a browser sheet (ADR 0110): type an email, open the link, connect the phone. That's four steps and a trip to the mail app. Sign in with Apple is one tap and Face ID, and it makes the account at the same time.

What Apple asks of an app that offers it:
- **Its own button,** shown at least as prominently as other ways to sign in.
- **Account deletion** in the app or one tap away from it. The app already links to deletion on the web (guideline 5.1.1(v) allows that).
- **Revoking the person's Apple tokens** through Apple's REST API when they delete their account.

## Decision

**Supabase Auth does the checking.** The app asks Apple for the email only (no name), with a fresh 32-byte nonce whose SHA-256 Apple writes into the identity token. It sends the token and the raw nonce to `POST /api/v1/app/apple`. The server passes both to Auth's `id_token` grant. Auth (v2.197.0, `token_oidc.go`) checks:
- Apple's signature, against Apple's published keys;
- that the token's audience is in `GOTRUE_EXTERNAL_APPLE_CLIENT_ID` (`com.farbaek.app`);
- that the nonce hashes to the token's.

Auth makes the account, or finds it: an Apple ID whose verified email matches an existing account joins that account. The phone is then recorded like any other (`phone_devices`), so Settings shows it and disconnecting it works. The id_token grant skips the Turnstile check (Auth's own rule for non-password grants), so the server rate-limits it: 20 a minute per network.

**Apple's refresh token is kept for revocation.** The app also sends Apple's one-time authorization code. The server exchanges it at `appleid.apple.com/auth/token`, using a five-minute client secret signed with the owner's Sign in with Apple key (`src/server/auth/apple.ts`), and keeps the refresh token in `apple_sign_in_tokens`.
- That table can be read only by the server key and changed only through two functions.
- Rows go with the account.
- Deleting the account revokes the token at `appleid.apple.com/auth/revoke` before the sign-in record is removed.
- Neither step ever blocks the person. A failed exchange still signs them in, and a failed revocation still deletes the account. Both are logged without the token.

**Off until it's all in place.** `GET /api/v1/app/sign-in-options` answers `{ apple: true }` only when `APPLE_SIGN_IN=on` and the key is set, so revocation is always possible when the button shows. Auth's provider is switched on separately, with `FARBAEK_APPLE_SIGN_IN=true` in the Supabase `.env`. `scripts/vps/set-apple-sign-in.ps1` does both, Auth first.

**A first workspace from the phone.** Someone who signs up with Apple has no workspace. The phone used to say "Create a workspace on the web first", which was a dead end. Today now offers **Make my workspace**. `POST /api/v1/app/workspaces` calls `create_organization` as the person, the way the web's build box does, so the database applies the same email and one-trial rules. It refuses when the person already has a workspace.

**If Apple says Farbaek was removed** (Settings > Apple Account > Sign in with Apple), the app signs out and disconnects the phone. It checks on each launch and while it runs.

## Consequences

- **Hide My Email** gives Farbaek a relay address that is unique to the person. It isn't on the disposable-address list, so it gets the trial the same way as any other new address. One Apple Account gets one relay address for Farbaek.
- **The website** doesn't offer Sign in with Apple yet. That needs a Services ID, a return address and a client secret Auth keeps, renewed every six months. `GOTRUE_EXTERNAL_APPLE_CLIENT_ID` already takes a list, so the Services ID joins the bundle id there.
- **Apple's server-to-server notifications** for Sign in with Apple (consent revoked, account deleted) aren't handled yet. The app's own check covers the phone, but the web session stays until it expires.
- **Not verified end to end yet.** The app compiles first on 1 November, and the owner makes the Sign in with Apple key. The server side is covered by tests with a throwaway key and a stubbed Apple.
