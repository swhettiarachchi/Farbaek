# ADR 0060: Farbaek emails people when their work finishes

- Status: accepted (2026-10-24).
- Uses the Spacemail account from ADR 0036. Builds on ADR 0047 and ADR 0059 (checks).

## Context

**A build takes a minute or more, and its checks take longer.** People leave the page, and nothing told them when a build was ready to review or how its checks went. In production, finished builds sat unreviewed and applied changes sat unchecked for days.

**Farbaek had no email of its own.** Sign-in emails go through Supabase Auth's SMTP settings (Spacemail, hello@farbaek.com). `EMAIL_PROVIDER_API_KEY` named a provider that was never chosen.

## Decision

**A small SMTP client in the app** (`src/server/email/smtp.ts`). It sends to Spacemail, the same account sign-in emails use, with no new dependency:
- one message to one recipient;
- implicit TLS on port 465, with the certificate checked (TLS 1.2 or later);
- AUTH PLAIN, or LOGIN when that's all the server offers;
- a timeout on every step;
- errors that carry the server's reply, never the password.

A plain connection is refused for any host but localhost, which is how the tests run against a fake server.

**Messages** (`message.ts`):
- plain text and HTML, each base64 in UTF-8, with CRLF line endings;
- encoded-word subjects;
- dot-stuffed for `DATA`;
- nothing typed can add a header: plain addresses only, and no line breaks in the subject or the sender's name.

**What's sent** (`notify.ts`):
- **A cloud build:** "Ready to review: …" when it finishes, or "Build stopped: …" when it fails. Nothing when the person cancelled it.
- **Checks:** "Checks passed: …", "Checks failed: …", "Partly verified: …", or "Checks didn't run: …" with the reason.
- **Every email:** has a link to the task and says why the person is getting it.
- **Who gets it:** only the person who started the build or the checks, at their own confirmed address (looked up with the server key). A cloud run that applied and checked a change on its own sends one email, with the result in it.

**It never gets in the way.** Sending happens after the run or the check attempt has ended. A failure is logged with the kind and the task, not the address, and dropped.

**Off until the owner turns it on.** Email is on only when `SMTP_PASSWORD` is set. `scripts/vps/set-email-password.ps1` asks for that one password, sends it straight to the server and restarts the app. The host, port, user and sender default to Spacemail and hello@farbaek.com. The admin console's connection list shows Email on or off, never a value.

## Consequences

- **People hear when their work is ready,** without keeping the page open.
- **There's no setting to turn these emails off yet.** They're only for what the person started themselves. Preferences, trial reminders and invitations can use the same sender next.
- **Not seen live here.** The SMTP client is tested against a fake server, and the password is the owner's to type.
