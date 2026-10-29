# Stage 90: Sign in with Apple on iPhone

The owner asked for "Apple register and login to Farbaek". Farbaek for iPhone now offers **Continue with Apple**: one tap and Face ID, which signs in or makes the account. Signing in with email through www.farbaek.com stays as the second way.

- **Decision record:** `docs/adr/0113-sign-in-with-apple.md`.
- **The owner's steps:** `docs/mobile/ios.md`, step 9.
- **Branch:** `feat/sign-in-with-apple`.
- **Migration:** v72 (`20261213090000_apple_sign_in.sql`).

## 2026-10-29

### Done

- **The server** (`src/server/phone/`):
  - `POST /api/v1/app/apple` takes Apple's identity token and the raw nonce. Supabase Auth's `id_token` grant checks Apple's signature, the audience `com.farbaek.app` and the nonce's SHA-256, then the phone is recorded like any other;
  - it's rate-limited to 20 a minute per network, since Auth's Turnstile check doesn't apply to this grant;
  - `GET /api/v1/app/sign-in-options` says whether to show the button.
- **Revoking on deletion** (`src/server/auth/apple.ts`, `apple-wiring.ts`):
  - the sign-in's authorization code is exchanged for Apple's refresh token, using a five-minute ES256 client secret, and kept in `apple_sign_in_tokens` (server key only);
  - deleting the account revokes it at Apple before the sign-in record goes;
  - neither step blocks the person.
- **Auth** (`deploy/vps/supabase/compose.farbaek.yaml`): the Apple provider, off until `FARBAEK_APPLE_SIGN_IN=true`. Auth's code was read to confirm three things: it needs no secret for app tokens, it doesn't check providers at startup, and the id_token grant skips the captcha.
- **The app** (`ios/`):
  - Apple's own button, first on the welcome screen, asking for the email only;
  - "Sign in with email" for the web flow;
  - "By continuing, you accept the Terms and the Privacy Policy";
  - signs out if Farbaek is removed from the Apple Account's Sign in with Apple list;
  - the `com.apple.developer.applesignin` entitlement.
- **No dead end for new accounts:** Today offers **Make my workspace** (`POST /api/v1/app/workspaces`, through `create_organization` as the person). Before, the phone said "Create a workspace on the web first".
- **Privacy policy:** what Apple shares (an ID and the email or a relay address, never the name), and that the token is kept for revocation.
- **Setup:** `scripts/vps/set-apple-sign-in.ps1` switches on Auth's provider, saves the key and restarts the app, without showing the key.

### Verified

- `src/server/auth/apple.test.ts` (4), with a throwaway P-256 key and a stubbed Apple:
  - the key is read in three formats;
  - the client secret's claims check out, and its signature verifies with the public key;
  - the code exchange and the revocation post the right form to Apple's host only.
- `src/server/phone/api.test.ts`: 2 new tests.
  - Apple sign-in is refused while it's off; it works and keeps the code; a wrong nonce or token is refused.
  - A first workspace is made once, never a second, never in the sample.
- `tests/db/apple-sign-in.test.ts` (3, PGlite): the latest token per person, removed with the account, no access for anon or authenticated.
- `pnpm typecheck`.

### Not verified yet

- The Swift hasn't been compiled. That waits for GitHub's Mac minutes on 1 November. `FarbaekTests` has a new nonce test.
- No real Apple sign-in has been tried. It waits for the owner's key and capability (step 9) and the first build.

### Next

- The owner: step 9 (the capability, the key, then the script).
- After the first build: try Continue with Apple on a phone, then delete the test account and check that the token was revoked.
- Later: Sign in with Apple on the website (Services ID, return address, a client secret renewed every six months), and Apple's server-to-server notifications.
