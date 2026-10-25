# Stage 51: First steps on Mission Control

The spec's Stage 1 asks for "the onboarding checklist from real events". Mission Control had an early version, out of date since prompt-first builds and publishing.

- **Decision record:** `docs/adr/0073-first-steps.md`.
- **Branch:** `feat/first-steps`, from `main` at `ffea58d`.

## 2026-10-25

### Done

- **`src/core/workspace/first-steps.ts`:** five steps from records only: describe, approve the plan, review and apply, get it verified, publish. In order, so a later step marks the earlier ones. Exactly one is next, with an action that goes to the right place.
- **Reader:** `getFirstStepRecords` reads the newest ProofPack, the newest verified one and a live site, under RLS. The demo reader returns none.
- **`FirstStepsPanel`:**
  - a double-bezel panel at the top of Mission Control, with a five-station track;
  - the proven part of the line is filled, and the next station breathes (motion-safe);
  - the next step opens below the track with one action;
  - while nothing has been described, the build box itself sits in step 1.
- **Unavailable steps** (no verified sandbox, no site domain) show a lock and the reason, and don't keep the panel open.
- **Hide:** the `fb_steps` cookie (workspace ids only), with "Show them" at the bottom of Mission Control. Listed in the Privacy Policy.
- **Removed:** the old "Your first verified change" card.

### Verified

- `src/core/workspace/first-steps.test.ts` (9): every step's evidence, cumulative order, rejected and cancelled tasks proving nothing, links, unavailable steps, partly verified never counted as verified.
- `src/components/app/first-steps.test.ts` (4): the build box inside step 1, state words for every station, one current step, reasons, the way back after hiding.
- `src/server/workspace/first-steps.test.ts` (3): the cookie keeps only workspace ids, at most 20.
- **Demo build at 1280 and 375 px:** no sideways scroll, no console errors. "Publish" is next, with `SITES_DOMAIN` set (new `farbaek-demo-si` launch config).
- **Headless Chrome:** Hide, then reload, then Show them.
- `pnpm typecheck`, lint and the design tests are clean.

### Next

GitHub import for public repositories (the Stage 2 gap).
