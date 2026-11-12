# Fieldnote: an app with sign-in

A members app in plain Node.js with no dependencies: people create an account, sign in, keep private notes, change their password, reset it by a one-time link, and delete their account. It's a starting point. Rename it, restyle it, and replace the notes with what your app is for.

Fieldnote, its copy and its sample notes are sample content.

## Run it

- `npm run dev` starts it on port 3000 and restarts on changes.
- `npm test` starts it on a free port with its own data folder and uses it like a browser.
- `npm start` runs it without watching.

Nothing is installed: it uses Node's own `http`, `crypto` and test runner (Node 22 or later).

In Farbaek's test space, open the preview in a **new tab** to sign in. Browsers keep sign-in cookies out of pages shown inside another site's frame.

## How it keeps accounts safe

- **Passwords:** stored as scrypt hashes with a random salt, never as typed. At least 12 characters.
- **Sessions:**
  - a random 32-byte token in an HttpOnly, SameSite=Lax cookie, Secure over https;
  - the server keeps only its SHA-256;
  - sessions last 14 days;
  - changing or resetting a password signs out every other device.
- **Forms:** every form carries a token. Signed-in forms use the session's own token; signed-out forms use a token that must match a cookie set with the page. A form posted from another site is refused.
- **Sign-in:**
  - a wrong email and a wrong password get the same answer, in the same time;
  - tries are limited per network address and per email: 20 and 10 every 15 minutes.
- **Password reset:** a one-time link that works for 30 minutes, kept as a hash. The page never says whether an email has an account.
- **Notes:** belong to the account that wrote them. Nobody else can read or delete them, and everything shown is escaped.
- **Headers:** a strict Content-Security-Policy, no framing, `nosniff` and a same-origin referrer.

## Settings

See `.env.example`. None of them are secrets.

| Setting | What it does |
| --- | --- |
| `PORT` | The port to listen on (3000 by default). |
| `DATA_DIR` | Where the data file lives (`data` by default). |
| `TRUST_PROXY=1` | Set it behind a host's proxy (Render, Railway, Fly.io), so limits count each visitor's own address. |
| `COOKIE_SECURE=1` | Always mark cookies Secure. They already are when a request arrives over https. |

## Keeping the data

Data is one JSON file in `DATA_DIR`, written whole and renamed into place, so a crash never leaves half a file.

**Hosts wipe their disk on every deploy unless you attach one:** a disk on Render, a volume on Railway or on Fly.io. Point `DATA_DIR` at it. For more than a few hundred people, swap `src/store.js` for a database. The routes only call the functions it returns.

## Sending reset links

Without an email service, a reset link is written to the server's log. To send it, replace `logResetLink` in `src/app.js` with a call to your email provider. Build the full link from your site's own address, never from the request's Host header.
