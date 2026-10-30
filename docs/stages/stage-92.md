# Stage 92: Signing in with Google

The owner asked for Google login. www.farbaek.com now offers **Continue with Google** above Apple and email, and the iPhone and Android apps get it through the website's sign-in.

- **Decision record:** `docs/adr/0115-sign-in-with-google.md`.
- **Branch:** `feat/google-sign-in`, built on stage 91's notes (PR #118).

## 2026-10-30

### Done

- **One path for Google and Apple** (`src/server/auth/oauth.ts`, `oauth-wiring.ts`):
  - `/auth/google` and `/auth/apple` both call `startOAuth`: Auth's flow with PKCE, one rate limit across providers, plain notices on failure;
  - `providerReady` shows a button only while Auth's authorize address sends people to the provider under Farbaek's own client id, checked at most every five minutes per provider.
- **The sign-in page:**
  - Continue with Google (Google's four-colour mark, an image file) and Continue with Apple, both in the white `outline` style, then "or with email";
  - the intro names what's offered;
  - the Google notices "Google didn't finish signing you in" and "Signing in with Google isn't available right now".
- **The apps:**
  - `GET /api/v1/app/sign-in-options` answers `google`;
  - the iPhone app labels its web button "Sign in with Google or email" when it's offered;
  - Android is the website, so it has the button already.
- **Auth** (`compose.farbaek.yaml`): the Google provider, off until `FARBAEK_GOOGLE_SIGN_IN=true` with the client's id and secret.
- **Setup:** `scripts/vps/set-google-sign-in.ps1` reads the client file Google gives the owner, checks it's Farbaek's web client with the right redirect URI, saves the id and secret without showing them, restarts Auth and checks that Auth reaches Google.
- **Privacy policy:** what Google shares (email, name, profile picture's address).

### Verified

- `src/server/auth/oauth.test.ts` (4):
  - Google is offered only for `accounts.google.com` with a real client id, never a look-alike host;
  - Apple only under `com.farbaek.web`;
  - each provider's answer is remembered apart;
  - only Google and Apple are known.
- `src/server/phone/api.test.ts`: sign-in options include `google`.
- `pnpm typecheck`, `pnpm lint`.

### Not done yet

- **Google's side:** the Cloud project, the consent screen and the OAuth client. The owner first accepts Google Cloud's Terms of Service, which Claude can't do for them. The owner then creates the client and downloads its file, because Google shows the secret only then.
- **Turning it on:** `set-google-sign-in.ps1`, after the merge.
