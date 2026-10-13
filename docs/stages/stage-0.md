# Stage 0: audit, safety baseline and foundation

Session: 2026-10-13.

## Done

- Repository assessment (`docs/architecture/current-state.md`). The folder was empty, so this is a fresh build, not a rewrite.
- Master spec v2 stored verbatim (`docs/FARBAEK_MASTER_SPEC.md`).
- Next.js 16.4 / React 19.3 / TypeScript 6.0 / Tailwind 4.3 foundation with exact, vetted dependency versions (ADR 0001).
- ADRs 0001 to 0007, threat model outline, research notes, billing go-live checklist.
- Proof Atelier design tokens with a CI contrast test; accent derived from the logo (ADR 0007).
- Logo found (chat attachment) and stored unaltered at `public/brand/farbaek-logo.webp`, with generated PNG fallback and icons.
- Framework-free domain core in `src/core`: plan catalog, trial lifecycle, entitlements, usage metering, RealityLoop state machine, intent contracts, RFC 8785 canonical JSON, approval binding, Seal geometry.
- Public site: home (hero, Proof Thread, live approval-binding demo, modules bento, evidence with a hash-derived Seal, honest status, pricing teaser, FAQ) and pricing (monthly/annual toggle, comparison table, billing FAQ).
- `CLAUDE.md`, `.claude/settings.json` (permissions plus guard hook) and `.claude/launch.json`.

## Verified

| Check | Command | Result |
| --- | --- | --- |
| Unit and design tests | `pnpm test` | 164 passed in 10 files |
| Types | `pnpm typecheck` | Clean |
| Lint | `pnpm lint` | Clean |
| Production build | `pnpm build` | `/` and `/pricing` prerendered as static pages |
| Guard hook logic | `node .claude/hooks/guard.mjs` fed sample payloads | Blocks `.env` writes, lockfile edits, `rm -rf` and force pushes |
| Browser, 375px light and dark, and 1440px light | Built-in browser against `pnpm start` | Demo approve, edit, run and block flows work; annual toggle shows catalog values; no horizontal page scroll |

Bugs found and fixed during verification: fractional prices printed as "$15.5"; input border contrast below 3:1 on sunken surfaces; the pricing comparison table widened the page to 658px on phones; a seal caption that said "on the left" on mobile; orphaned words in two headings.

## Not verified

- Whether Claude Code loads the hook from `.claude/settings.json` in a fresh session. The script was tested directly; integration needs a new session.
- Lighthouse, axe-core and Playwright are not installed yet (planned for Stage 1 with the app shell). Accessibility was checked by hand only: landmarks, labels, focus ring, tab pattern, live regions, reduced motion.
- Real devices.

## Stage 0 acceptance criteria (spec 27.4)

- [x] Docs exist (current state, ADRs, threat model, CLAUDE.md)
- [x] Baseline commands run, with results recorded
- [x] Guard blocks a test `.env` write (script level; harness integration unverified)
- [x] Logo found and used unaltered
- [x] Design tokens as Tailwind v4 theme variables

## Next: Stage 1

Needs from the owner: Supabase CLI link and local keys (ADR 0005), a hosting choice, and confirmation of the Team and Business workspace caps (the spec says "per config"; 5 and 20 are placeholders that are enforced but not published).

Then: auth with email verification, organizations, a Drizzle schema for billing, trial, usage and tasks with RLS and cross-tenant tests, persisted trial lifecycle with reminder jobs, the app shell (desktop sidebar, mobile bottom tabs) with Mission Control, Billing in not-connected mode, plus Playwright and axe.
