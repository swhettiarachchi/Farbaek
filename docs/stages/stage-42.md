# Stage 42: Terms, Privacy Policy and Acceptable Use Policy

The third launch stage: the agreement people accept at sign-in, what Farbaek does with their data, and the rules for what they build and publish.

- **Decision record:** `docs/adr/0066-legal-documents.md`.
- **Research:** `reports/Farbaek public launch readiness.md`.
- **Branch:** `feat/legal-pages`, from `main` after #49.

## 2026-10-24

### Done

**Pages:**
- `/terms`, `/privacy` and `/acceptable-use`, each with a short version first and numbered sections;
- one layout, `LegalDocument`, whose contents list sits beside the text on wide screens and folds under the short version on phones, so the title comes first;
- below 640px, the processors table becomes stacked entries, so nothing scrolls sideways.

**Facts:** `src/config/legal.ts` holds what the documents state (operator, hosting, contacts, backups, logs, age, processors). `src/config/legal.test.ts` checks three of them against the scripts:
- 14 nightly backups (`scripts/vps/db-backup.sh`);
- 30 MB of logs per service (`scripts/vps/bootstrap.sh`);
- no Caddy access log.

**Wording checked against the system:**
- what Office Space can do (take a site offline; suspension stops new work and takes sites offline);
- the cookie and local storage names;
- the Settings card names and the project's "Export everything";
- the Help topic "Report a site or abuse".

Two of my own claims were wrong and are corrected:
- that project code runs only in sandboxes: the desktop app runs it on people's own computers, so the page says Farbaek never runs it on its own servers;
- that logs rotate within weeks: they're capped by size, which at today's traffic can mean months.

**Sign-in:** a line under the button: "By continuing, you accept the Terms of Service and Acceptable Use Policy. The Privacy Policy explains how we use your data."

**Footer:** a Legal row with the three documents.

**QA lists:** `/terms`, `/privacy`, `/acceptable-use`, `/proofpack/v1` and `/account-deleted` are now in both audits' route lists.

**Log rotation:** already on. The server's `/etc/docker/daemon.json` (from `bootstrap.sh`) caps every container at three 10 MB files; read back on all eight containers.

### Verified

- **Tests:** `src/config/legal.test.ts` (3), and the design tests (128) cover type tells, contrast and no filters.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean; the full `pnpm test` passed 1,405 tests.
- **Demo build:**
  - `qa:responsive`: 77 page views at 320 to 1440px across the three documents, `/sign-in`, `/`, `/proofpack/v1` and `/account-deleted`, plus `/privacy` again at 320 to 768px after the table change. None scroll sideways, cut content off, have small targets or log errors.
  - `qa:a11y`: 14 page views, 0 findings.
- **Dev server:** the consent line under the sign-in button at 375px. The demo build has no sign-in service, so the form doesn't render there.

### Next

**For the owner:**
- legal review;
- a DMCA designated agent;
- quotes for an EU and UK representative;
- confirming Hostinger's DPA, and Spacemail's DPA and server location.

**Code:**
- Turnstile at sign-in;
- heartbeat pings for the timers;
- encrypted off-site backups;
- an export of everything a person has.
