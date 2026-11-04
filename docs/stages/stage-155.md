# Stage 155: The app's script policy, enforced

- **Branch:** `feat/enforce-app-csp`, from `main` after PR #199.
- **Decision:** ADR 0169 (amended), ADR 0107 (status).
- **Skills used** (the owner asked for them on every build): `ecc-security-review` and `security-review` on the frame and this change, and `chrome-browser` for the production walk.

## What changed

- **The app's nonce Content-Security-Policy is enforced by default on `/app` and `/admin`.** `appCspEnforced` in `src/server/http/app-headers.ts` is used by `src/proxy.ts`, and `APP_CSP_ENFORCE=0` sends it report-only again.
- **The preview frame ignores its own message types from the site** (`farbaek-preview-doc`, `-ready`, `-loaded`). The checklist review found that a site sending "ready" over and over would make the app hand it its document again and again.
- **Its tests now run the frame's real script** against stand-in windows:
  - "ready" goes to the app's origin;
  - opened alone, it does nothing;
  - it takes a document only from its parent at the app's origin;
  - each new document replaces the frame;
  - it relays both ways and drops its own types coming from the site.
- **`next.config.ts`:** the deny-framing exception for `/preview-frame` now applies on the app's host only. On published-site hosts and custom domains that path keeps the global headers (the security review's one low note).

## Production walk before enforcing (Chrome, signed in, after PR #199)

- **Sunrise Bakery** renders through `/preview-frame`, with its glass 3D scene running.
- **Studio:**
  - picking the headline shows the inspector and draws the section toolbar in the site;
  - a draft text edit shows at once and **Undo** restores it;
  - the live accent colour preview turned the button blue, and **Reset** cleared it;
  - nothing was saved.
- **Full page loads:** in the HTML of 29 app pages, every script carries the nonce and there are no inline event handlers.
- **Moving between pages:** with a `securitypolicyviolation` listener on 17 client-side page changes, there were no violations. A deliberate probe was caught, so the listener works.
- **The code:**
  - there's no browser database client, no cross-origin fetch, WebSocket or EventSource, and no forms posting to another site;
  - Google Analytics is only on the marketing pages.
- **Chrome's console reader** through the extension doesn't show policy reports, so the walk used the violation event and the page HTML instead.

## Security reviews

- **`ecc-security-review` checklist:** no secrets, input checked at both ends of the bridge, headers set. The one weakness (control messages from the site) was fixed here.
- **`security-review` (sub-agent, with false-positive filtering):** no high or medium findings. One low note (the exception on site hosts), fixed here.

## Verified

- **Checks:** typecheck and lint are clean, and the full suite passes 2,644 tests (four new behaviour tests for the frame, plus the enforcement default).
- **Demo production build with default settings (so enforced):**
  - **Headers:**
    - `/app` sends the enforced `Content-Security-Policy`.
    - `/preview-frame` on the app host has only its own policy.
    - `/preview-frame` on a published-site host gets `X-Frame-Options: DENY`, `frame-ancestors 'none'` and `payment=()`.
  - **In Chrome,** the software template's preview renders fully: the live ledger card and the kit.

## Next

- **After the merge, the same walk on production with the policy enforced:** Studio, previews, billing and Mesh.
