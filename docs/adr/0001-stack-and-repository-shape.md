# 0001. Stack and repository shape

- Status: accepted
- Date: 2026-10-13

## Context

The repository was empty. The spec recommends Next.js 16, React 19, TypeScript strict, Tailwind v4 and a modular monolith. The dev PC has 3.8 GB of RAM; parallel type-aware lint, tsc and database tests have exhausted memory before.

## Decision

- **Next.js 16.4.0** (App Router, Turbopack), **React 19.3.0**, **Tailwind CSS 4.3.3**, **pnpm 12**.
- **TypeScript 6.0.3, not 7.0.2.** The `typescript@7.0.2` package has no `main` entry (verified with `npm view typescript@7.0.2 main`), so tools that load the compiler API, including Next.js's build-time type check, cannot use it. Revisit when Next.js documents TS 7 support.
- **ESLint 9.39.5, not 10.** `eslint-config-next@16.4.0` pulls in `eslint-plugin-react`, `-jsx-a11y` and `-import`, whose peer ranges stop at ESLint 9.
- **Single Next.js app, not a monorepo yet.** Domain logic lives in `src/core/<domain>` and must stay framework-free (enforced by ESLint `no-restricted-imports`). When the Expo app arrives (Stage 7), `src/core` moves to a workspace package unchanged.
- **Dependency hygiene:** exact versions, and nothing published in the last few days. zod 4.6.7 and vitest 5.0.4 (published 2026-10-12) were replaced with 4.6.5 and 5.0.3. pnpm lifecycle scripts stay off; `unrs-resolver`'s build is explicitly declined in `pnpm-workspace.yaml`.

## Consequences

- Checks run sequentially (`pnpm check`) to fit in memory.
- Next.js 16.4.0 has a security release announced for 2026-10-14. Upgrade as soon as it ships.
