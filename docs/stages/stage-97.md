# Stage 97: The Integrations page

The spec audit found that integrations lived inside project pages and Settings, with no area of their own. This stage adds one page that shows them all.

- **Decision record:** `docs/adr/0120-integrations-page.md`.
- **Branch:** `feat/integrations-page` (from `feat/activity-log`, PR #124).

## 2026-10-30

### Done

- **`/app/integrations`:** Farbaek hosting, Vercel, Netlify, GitHub, Farbaek Agent, Mesh, email and AI models. Each shows its real state, what it does and the next step. Below them, what isn't available yet.
- **`loadIntegrations`:** provider connections and live sites read as the person, plus agents and email. What can't be read comes back as "not read", not "not connected".
- **Integrations** in the sidebar and on the phone's More page.

### Verified

- `src/server/workspace/integrations.test.ts` (2): paired and reachable agent counts; in the demo, connections and sites say "not read"; agents that can't be read count as none without failing the page.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: 2,194 passed.
- **Demo build at 375px:** all eight cards with their state, "Not read" for connections and sites in the demo, the not-yet list, no sideways scroll and no target under 44px.
