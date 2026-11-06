# ADR 0169: Previews in their own frame document, so the app's policy can be enforced

- Status: accepted (2026-11-04).
- Amends ADR 0107 (the app's nonce Content-Security-Policy) and ADR 0027 (static previews). Builds on ADR 0023 (previews).

## Context

The app sends a nonce Content-Security-Policy on `/app` and `/admin`, report-only (ADR 0107). Enforcing it waited on one thing: previews of people's sites were `srcdoc` iframes, and a `srcdoc` document inherits the embedding page's policy. Enforced, the app's `script-src 'nonce-…' 'strict-dynamic'` would stop every site's own scripts in previews:
- menus;
- the Studio kit and Farbaek Scenes;
- the Studio editor's own script.

Two frames run scripts this way:
- **`StaticPreview`** on the project page, template pages and build runs;
- **the Studio visual editor**, whose document is the browser's unsaved draft and which talks to the app in both directions with `postMessage`.

Thumbnails (`SiteThumb`) run no scripts. The running-app frames already load from `p-<id>.farbaek.si`.

## Decision

**A preview frame document at `/preview-frame`** on Farbaek's own host (`src/core/workspace/preview-frame.ts`, served by `src/app/preview-frame/route.ts`).
- **It's loaded over the network,** so it has its own policy rather than the app's.
- **Its header policy:**
  - the static-preview policy, the same string the preview document's meta tag carries (`STATIC_PREVIEW_CSP`);
  - `sandbox allow-scripts`: the document is an opaque origin even when it's opened directly, so it never has farbaek.com's cookies or storage;
  - `frame-ancestors 'self'`.
- **Other headers:** `nosniff`, `no-referrer` and `noindex`, and it's disallowed in robots.
- **`next.config.ts`** leaves this path out of the global `X-Frame-Options: DENY` and `frame-ancestors 'none'`, and out of the app host's payment permission.
- **It holds no content of its own.** It renders the site in a nested `<iframe sandbox="allow-scripts" srcdoc>`, which inherits the frame's policy, not the app's.
- **It relays messages:**
  - From its parent, it accepts messages only when they come from the parent window at the app's origin. It reads that origin from its own address, since it's served from the app's host.
    - A `farbaek-preview-doc` message replaces the site's frame with a fresh one.
    - Anything else is passed to the site.
  - The site's messages go to the parent at the app's origin, never to `"*"`.
  - It says `farbaek-preview-ready` when it's listening and `farbaek-preview-loaded` after each document loads.

**Why a path, not a new host on farbaek.si.**
- The isolation comes from loading the document separately and from the sandbox in its policy, not from the host name.
- A path needs no DNS, certificate, host routing or proxy matcher.
- It works the same in development, the demo and production.

**`PreviewFrame`** (`src/components/preview/preview-frame.tsx`) is the app's side.
- It frames `/preview-frame`, sends the HTML when the frame is ready, and sends it again whenever it changes, without reloading the frame.
- Every message the site sends arrives from the iframe's own window. So `StaticPreview` and the editor keep their `e.source === frame.contentWindow` checks and their `contentWindow.postMessage` calls unchanged, along with their zod checks.

**Enforced by default (stage 155, 2026-11-04),** after production showed it was safe.
- `appCspEnforced` (`src/server/http/app-headers.ts`) enforces the policy unless `APP_CSP_ENFORCE=0`, which is kept as an escape hatch for an incident.
- **What production showed first**, with the frame live and the policy still report-only, in the owner's signed-in Chrome:
  - **Full page loads:** in the HTML of 29 app pages, every script carries the request's nonce, and there are no inline event handlers.
  - **Moving between pages:** with a `securitypolicyviolation` listener running across 17 client-side page changes (project preview, Studio, template and run previews, thumbnails, billing, Mesh and the rest), there were no violations. A deliberate `img-src` probe was caught, so the listener works.
  - **The code:** the browser makes no cross-origin calls (no browser database client, no cross-origin fetch or WebSocket, no forms posting elsewhere), and Google Analytics loads only on the marketing pages.
- **The frame ignores its own message types when they come from the site,** so a site can't make the app hand it its document again and again.
- **The deny-framing exception for `/preview-frame` is limited to the app's host** (`NEXT_PUBLIC_SITE_URL`). On published sites and custom domains, a person's own page at that path keeps the global headers. That was the one low note from the security review.

## Consequences

- People's sites run in previews exactly as before, under the same static-preview policy, now from a document the app's policy doesn't reach.
- The editor's messages to the app are now addressed to the app's origin, stricter than the `"*"` a `srcdoc` frame had to use.
- Each preview loads one small, cached document from Farbaek before the site appears.
- Relative addresses a site leaves unresolved now point under `/preview-frame` rather than the app page. They're still blocked by the preview policy or fail as before.

## Update (2026-11-06, stage 166): links within the page

A `srcdoc` document has no address of its own, so inside this nested frame `#hours` resolved to `/preview-frame#hours`. The browser tried to load that in the frame, its policy refused a sandboxed parent, and the preview went blank. The preview's script now handles those links by scrolling there. A site's `:target` styles and `hashchange` listeners don't fire in a preview.
