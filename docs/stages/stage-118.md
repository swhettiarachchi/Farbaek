# Stage 118: What will cost money at launch

The Launch Planner now lists what will cost money when a project launches, read from its own files: code that runs per visit or static bandwidth, functions, optimised images, scheduled jobs, the build, and each outside service. It gives the evidence for each, links each host's pricing page, and says why there are no prices.

- **Decision record:** `docs/adr/0141-launch-cost-drivers.md`.
- **Branch:** `feat/launch-costs` (from `feat/starters`).
- **Migration:** none.

## 2026-10-30

### Done

- **`src/core/launch/costs.ts`:** `costDrivers(plan, input)` and the pricing pages.
- **The planner reads `vercel.json` and `netlify.toml`.**
- **The launch page loads the drivers** and shows "What will cost money" beside "How it runs" and "Settings it needs".

### Verified

- `src/core/launch/costs.test.ts` (3):
  - a static site lists only bandwidth, with no `$` figure anywhere;
  - a Next.js app lists server, functions (counted and named), optimised images, scheduled jobs, build, database, payments and AI, in that order;
  - Netlify's scheduled functions are found.
- **A demo production build:** the demo storefront's launch page at 375px shows its drivers (server and build) with their evidence and the pricing links, with no sideways scroll.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **Nothing outstanding:** the planner reads files only.
