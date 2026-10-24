# Stage 33: Email when work finishes

In production, finished builds sat unreviewed and applied changes sat unchecked, because nothing told people when their work was ready.

- **Decision record:** `docs/adr/0060-email-notifications.md`.
- **Branch:** `feat/email-notifications`, from `main` after #40.

## 2026-10-24

### Done

**`src/server/email/`:**
- an SMTP client: TLS on port 465, AUTH PLAIN or LOGIN, timeouts, no password in errors;
- a message builder that's header-safe, MIME and UTF-8;
- settings: on only with `SMTP_PASSWORD`, defaulting to Spacemail;
- the notifier, and its server wiring.

**Notifications:**
- **cloud runs:** email when they end (ready to review, or stopped);
- **verification attempts:** email how they ended (passed, failed, partly verified, or couldn't run);
- **the admin connection list** shows Email.

**Setup for the owner:** `scripts/vps/set-email-password.ps1` asks for the hello@farbaek.com password, stores it on the VPS and restarts the app. `.env.example` and the server template name the settings.

### Verified

- **The email tests (11):**
  - the message's headers, encoding and line endings;
  - header injection is refused;
  - dot-stuffing;
  - the SMTP dialogue against a fake server, for AUTH PLAIN and AUTH LOGIN;
  - a refused sign-in names the code without the password;
  - a silent server times out;
  - no plain connection to a remote host;
  - the settings and their defaults;
  - the words of each email;
  - only the person's own address, with a link to the task;
  - nothing sent without settings;
  - a send failure never reaches the work.
- **The runner** emails how the checks ended, passed or not.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean.

### Brought up to date (2026-10-24, later)

- **Merged with main** after #42, #43 and #44. The two conflicts were lines both sides added (the settings template and current-state rows), kept in ADR order. `pnpm typecheck`, `pnpm lint` and the full `pnpm test` (1,360 passed) are clean on the merge.
- **The password script now stops on a failure.** It reports when the server didn't save the password, or the restart didn't finish, instead of always saying Done. It parses in Windows PowerShell 5.1, and its comment gives a command that runs from any folder.
- **Comments** now name `set-email-password.ps1`, not `set-secrets.ps1`.
- **The server can reach Spacemail.** From the VPS, `mail.spacemail.com:465` answers "220 SpaceMail.com Mail Node", and the app container completes a TLS handshake (certificate `*.spacemail.com`). Only the password is missing.

### Not verified

- **A real email through Spacemail.** It needs the owner to run the password script.

### Next

- A setting to turn these emails off; trial reminders and invitations through the same sender.
