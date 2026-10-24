# Stage 45: Sign-in emails on our own Supabase

Office Space sign-in had been broken since the move to self-hosted Supabase. This stage fixes it.

- **Branch:** `fix/auth-email-templates`, from `main` at `a8540b3`.

## 2026-10-24

### Found

**The symptom:** the owner's Office Space sign-in sent an email with a "Sign in" link but no 6-digit code, and the office asks for the code. Following the link opened the office sign-in page with a session token in the address.

**The cause:**
- Stage 7 put the code into Supabase Cloud's "Magic link" and "Confirm sign up" templates.
- The move to self-hosted Supabase (ADR 0036, 2026-10-22) didn't carry templates over, so Auth has used its built-in link-only emails since then.
- The token in the address came from stage 43. Office codes are now sent with the server key, whose client uses the implicit flow, so the unused link signs in with tokens in the URL.

**Not the cause:** Turnstile. The public sign-in sent its confirmation email with the check on.

### Done

- **`public/auth-email/magic-link.html` and `confirmation.html`**, in the same style as Farbaek's own emails:
  - when the email's redirect is Office Space's sign-in page, it carries only the code, with no link;
  - otherwise it carries the sign-in or confirm link.
- **`compose.farbaek.yaml`** points Auth at them (`GOTRUE_MAILER_TEMPLATES_*`) and sets plain subjects ("Sign in to Farbaek", "Confirm your email for Farbaek"). If Auth can't fetch them, it falls back to its built-in emails.
- **`tests/design/auth-emails.test.ts`** checks:
  - each template branches once, on `https://` + `OFFICE_HOST` + `/sign-in`;
  - the office branch has the code and no link, and the customer branch the link and no code;
  - the settings point at files that exist.

### To apply

1. Merge, so the site serves the templates.
2. Recreate Auth on the server: `cd /opt/farbaek/supabase/docker && docker compose up -d auth`.
3. Request an office code: the email shows the 6 digits and no link.
