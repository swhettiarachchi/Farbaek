# Stage 117: A REST API starter and a CRM template

Two new ways to start a project:
- **A REST API service in plain Node.js:** no dependencies, tests that pass, and it previews in a sandbox.
- **A CRM template:** a pipeline board, a flow bar, contacts and follow-ups, with sample data saved in the browser.

- **Decision record:** `docs/adr/0140-rest-api-and-crm-starters.md`.
- **Branch:** `feat/starters` (from `feat/handoff`).
- **Migration:** none.

## 2026-10-30

### Done

- **`src/content/starters/rest-api.ts`:**
  - `package.json` with no dependencies;
  - `src/server.js`, which takes the preview's flags;
  - `src/app.js`: routes, validation, problems, body and rate limits, and the index page;
  - `src/store.js`, an in-memory store with sample contacts;
  - `test/api.test.js`;
  - README and DESIGN.md.
- **Registered as the "REST API service" starter.** `runProfile` recognises `src/server.js` servers. `starterForPrompt` picks it for API-only prompts.
- **`src/content/starters/templates/crm.ts`:** "Fieldnote", with the board, flow bar, tiles, contacts table, new-deal dialog, activity log and reset. It's sample data in the browser, and its static markup is complete without the script.
- **The CRM is added to the gallery**, with an example prompt.

### Verified

- `src/content/starters/starters.test.ts`:
  - the API starter has no dependencies, is recognised as a Node app, and its own `node --test` suite passes on Node (5 of 5), run from a temporary folder;
  - the CRM meets every gallery rule: screening, nothing fetched, labelled as sample, DESIGN.md, a clean site review, reduced motion, no filters, and scripts that parse.
- `src/core/agent/prompt-start.test.ts`: API prompts pick the API starter; an app with an API still picks Next.js.
- **The API server started with the preview's flags** answered `/`, `/api/contacts` and a 422 problem.
- **The CRM in a browser:**
  - at 375px: no sideways scroll, nothing under 12px, every control 44px or more;
  - moving a deal updates the totals, the log and the announcement;
  - a new deal joins New lead, and search finds it;
  - at 1280px, the board and flow bar look as designed.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **The API starter previewed in a production sandbox:** it uses the same run settings as the Next.js starter.
