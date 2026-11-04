# Stage 154: Previews in their own frame document

- **Branch:** `feat/preview-frame`, from `main` after PR #198.
- **Decision:** ADR 0169. It amends ADR 0107 and ADR 0027.

## Why

- The app's nonce Content-Security-Policy is still report-only (ADR 0107).
- Enforcing it waited on previews: they were `srcdoc` frames, which inherit the app's policy, so every site's own scripts would have stopped.
- That covered the project, template and run previews, and the Studio editor.
- This stage moves previews out of the app's policy, so it can be enforced next.

## What changed

- **`/preview-frame`** (`src/core/workspace/preview-frame.ts`, `src/app/preview-frame/route.ts`): a fixed, static document on Farbaek's own host.
  - **Its policy** is the static-preview policy, plus `sandbox allow-scripts` (an opaque origin even if opened directly) and `frame-ancestors 'self'`.
  - **Other headers:** `nosniff`, `no-referrer`, `noindex`, and 10 minutes of caching.
  - **Rendering:** the site goes in a nested sandboxed `srcdoc` frame, which inherits this policy and not the app's.
  - **Messages from the app** are accepted only from the parent window at the app's origin, which it reads from its own address.
  - **Messages to the app** go to the app's origin only.
- **`PreviewFrame`** (`src/components/preview/preview-frame.tsx`): sends the HTML when the frame is ready and again on every change, and reports each load.
  - `StaticPreview` and the Studio `VisualEditor` use it instead of `srcDoc`.
  - Their `e.source` checks, `contentWindow.postMessage` calls and zod checks are unchanged.
- **`next.config.ts`:** the global `X-Frame-Options: DENY` / `frame-ancestors 'none'` rule and the app host's payment permission skip `/preview-frame`.
- **Robots:** `/preview-frame` is disallowed.
- **Dev config:** `.claude/launch.json` gains `farbaek-demo-enforce`, the demo with `APP_CSP_ENFORCE=1`.

## Verified

- **Tests:**
  - New tests cover the frame's policy and headers, that it accepts documents only from its parent at the app's origin, that its messages go to that origin only, and robots.
  - Typecheck and lint are clean; the full suite passes 2,640 tests.
- **Demo production build with the app policy enforced, served on `localhost:3000`:**
  - **Headers:**
    - `/preview-frame` has only its own policy.
    - `/` and `/pricing` still send `X-Frame-Options: DENY`.
    - `/app` sends the enforced `Content-Security-Policy`.
  - **In real Chrome:**
    - The bakery template preview renders fully: photos, the kit's styles and motion, and the live "Closed now, opens tomorrow at 6.30 am" status from the site's own script.
    - The relay works both ways: a site message reaches the app from the frame's window, the load signal arrives, and an app message reaches the site and is echoed back.
    - A page on another origin can't use the frame. The framing rule blocks it, so it never says ready or builds its inner frame.
    - Walking `/app`, projects, templates, build, tasks, approvals, billing, settings, Mesh, agents and security showed **no** policy violations, thumbnails included.
- **A lab page** served the frame with five header variants. All worked in Chrome, including the shipped one. The frame's own `frame-src 'none'` doesn't block its `srcdoc` child.

## Not checked yet

- **Studio editing on a real static project.** The demo workspace has no static project. It's the first thing to check on production after the merge (Sunrise Bakery): pick, edit text, live theme, section move, undo.
- **Phone width.** The previews' layout is unchanged; only the frame element changed.
- **The built-in browser pane** never runs scripts in a sandboxed frame loaded by address. Real Chrome does, so Chrome is the check (memory note added).

## Next

1. **After the merge, on production in Chrome:**
   - Sunrise Bakery's preview and Studio.
   - Walk the signed-in app reading the console for report-only violations.
2. **If it's clean,** enforce the app policy by default (`APP_CSP_ENFORCE=0` as the escape hatch), then the same walk.
