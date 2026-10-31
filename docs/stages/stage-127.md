# Stage 127: Picking an element in the running app

In the component editor, people can open the project's running app from one of its sandbox sessions, turn on picking, and click an element. Farbaek selects the JSX it matches, by the element's words and classes, with the reason shown.

- **Decision record:** `docs/adr/0149-pick-in-the-running-app.md`.
- **Branch:** `feat/pick-running-app` (from `feat/agent-mcp`).
- **Migration:** none.

## 2026-10-31

### Done

- **Core:**
  - `src/core/studio/pick-match.ts`: `readPicked` and `matchPicked`;
  - `src/core/studio/picker-script.ts`: the script;
  - `src/core/sandbox/preview.ts`: the `pick` claim, `PICKER_PATH` and `injectPicker`.
- **`src/server/sandbox/gateway.ts`:**
  - the access cookie keeps the `pick` claim from launch;
  - it serves `/__farbaek/pick.js`;
  - in pick mode, it adds the script to small UTF-8 HTML pages and passes everything else through, larger pages included.
- **`openPreview(…, { pick })`** and **`openPickPreviewAction`**: the session must be this project's and running.
- **The component editor:**
  - **Pick in the running app**, with session, port and the framed app;
  - the candidates list;
  - the design page passes the project's running sessions, or why picking isn't offered.

### Verified

- `src/core/studio/pick-match.test.ts` (8): matching by words and classes, the ordering and reasons, components and built text never matching, the message shape, where the script goes, the claim surviving signing, and the script answering only Farbaek's origin.
- `src/server/sandbox/gateway.test.ts` (4 new):
  - the script is added in pick mode, with identity encoding requested;
  - it's served without asking the app, and needs access;
  - ordinary previews and non-HTML, compressed, non-UTF-8, oversized or non-200 pages are left alone;
  - a page larger than the limit passes through whole.
- **The picker script in a real browser**, on a local parent page framing a child page that loads it:
  - it says it's ready, and clicks act normally until picking is on;
  - then it outlines on hover and reports the h1 and a button with their words and classes, without running the button's own handler;
  - turning it off stops it and clears the outline and cursor;
  - a message from the page itself is ignored.
- `pnpm typecheck`, lint and full `pnpm test`.

### Not verified

- **Against a running app in a production sandbox:** it needs a signed-in workspace with a running session.

### Next

- iOS and Android builds once GitHub Actions minutes reset (1 November).
