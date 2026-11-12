# Stage 180: An app with sign-in

- **Branch:** `feat/members-starter`, from `main` (e0f64fb). It doesn't depend on stages 178 or 179.
- **ADR:** 0190.
- **Migration:** none.
- **Skills:**
  - **The template's look:** `high-end-visual-design`, `design-taste-frontend`, `farbaek-ui` and `farbaek-human-made`. It's calm, light and one-accent, with a labelled sample and no AI tells.
  - **Its security:** `ecc-security-review`'s checklist (passwords, sessions, CSRF, limits, escaping and headers).
  - **Building:** `tdd-workflow`.
  - **Checks:** `built-in-browser`.

## What the owner asked

"A template for an app with sign-in" was one of the six parts not built, and the owner said "setup all and use skills".

## What changed

**Fieldnote,** the App with sign-in starter (`starters/members`), in plain Node.js with no dependencies:
- **Accounts:**
  - sign up, sign in and out;
  - change password, which signs out every other device;
  - reset by a one-time link, written to the server's log until email is connected;
  - delete the account with everything in it.
- **Private notes:** each person's notes are theirs alone.
- **Security:** scrypt hashes, hashed session and reset tokens, form tokens and a same-origin check on every POST, equal answers for wrong passwords and unknown emails, limits, escaping, and a strict CSP with no framing.
- **Data:** one JSON file written safely. The README covers volumes on each host, `TRUST_PROXY`, and moving to a database.

**In Farbaek:**
- **Generation:** `scripts/starters/members.mjs` makes `src/content/starters/members-app.ts` from the files, with gallery snapshots.
- **Prompts:** ones about accounts or a members area start from it, unless a framework is named.
- **The gallery:** it appears under "Apps with a server", with a picture of its pages, Preview, and Use this template.
- **The plan drafter** is told to keep its security as it is and to test each new route.

## Verified

- **Its own suite: 7 tests** (`node --test`, also run inside Farbaek's tests):
  - health and security headers;
  - sign-up, and no password stored as typed;
  - a missing form token and a cross-site form refused;
  - the same answer for a wrong password and an unknown email, then the limit;
  - notes private, and another person's delete refused;
  - a reset link that works once and signs out old sessions;
  - deleting an account with its notes.
- **Farbaek's tests:**
  - no dependencies;
  - the generated module matches its source;
  - the gallery's pictures are labelled sample and fetch only fonts;
  - prompts map to it, and a named framework still gets Next.js.
- **In the built-in browser:**
  - it ran for real, and the home page looked right;
  - a person signed up and was taken to their notes;
  - a note with HTML in it showed as plain text;
  - at 375 px nothing scrolls sideways.
- **Static checks:** typecheck and lint, including the starter's own JavaScript.
- **Whole suite:** 2,909 passed. One existing test expected a prompt with "a login" to start from Next.js; it now expects the App with sign-in, and checks that naming Next.js still gets Next.js.

## Not done

- **Email, social sign-in and two-step codes:** the README says where they go.
- **Signing in inside the preview frame:** browsers block its cookie there, so the preview needs a new tab.
- **Running on a real host:** that's stage 181.
