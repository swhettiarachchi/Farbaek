# Farbaek

From idea to verified software, with control at every step. The source of truth is `docs/FARBAEK_MASTER_SPEC.md`; current status is in `docs/architecture/current-state.md` and `docs/stages/`.

## Commands

```bash
pnpm dev          # local dev server on :3000
pnpm build        # production build (does not lint)
pnpm start        # serve the production build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm test         # vitest run (unit, domain and design-token tests)
pnpm check        # typecheck, lint, test in sequence
node scripts/brand-assets.mjs   # regenerate icon sizes from the logo
```

The dev PC has 3.8 GB of RAM. Run checks one at a time, and stop any dev or preview server before `pnpm build`.

## Architecture map

- `src/app/`: routes (`/`, `/pricing`). Server Components by default.
- `src/components/<area>/`: UI. Anything using Motion, state or effects is a `"use client"` leaf.
- `src/core/<domain>/`: framework-free domain logic shared by server, browser and the future native apps. ESLint blocks React, Next, Motion and UI imports here.
  - `billing/`: plan catalog (the one pricing source), trial lifecycle, entitlements, usage metering.
  - `trust/`: RFC 8785 canonical JSON, SHA-256, approval binding.
  - `realityloop/`: task state machine, intent contract schema and checks.
  - `proof/`: Seal geometry from a digest.
- `src/content/samples.ts`: sample data for the public site. Always label it "sample" where it's shown.
- `src/styles/tokens.css`: colour tokens. `tests/design/contrast.test.ts` enforces WCAG AA in both themes.
- `docs/adr/`: one ADR per significant decision. Add one when you change a decision.

## Non-negotiables (full list in spec section 0)

- Never fabricate integrations, test results, metrics, prices, payments or testimonials. Demo data is labelled and isolated.
- Security is enforced on the server or runtime. Hidden buttons and prompts are not boundaries. Fail closed.
- No dead ends: every control works or is visibly unavailable with an honest reason.
- Billing stays `not_connected` until `docs/billing/go-live.md` is complete. The trial is internal, never a provider trial.
- Never read or print secret values. `.env*` (except `.env.example`) and key files are off limits.
- Don't claim "first", "guaranteed", "complete protection", certifications or compliance.
- Pin exact dependency versions, avoid releases that are only days old, and keep lifecycle scripts off by default.

## Design rules (Proof Atelier)

- Colours come from tokens only. The accent is gold measured from the logo (ADR 0007). One accent, no gradients.
- Shape lock: buttons and inputs 6px (`rounded-sm`), cards 10px (`rounded-md`), sheets 16px, marketing panels 24px. Pills only for the segmented control.
- Fonts: Instrument Sans (UI), Instrument Serif italic (rare accents only), JetBrains Mono (code, data, `//` labels).
- Logo: `public/brand/farbaek-logo.webp`, used unaltered through `BrandLogo` or `LOGO`. On dark surfaces it sits on the lit plate.
- Motion only for live state, hierarchy or feedback; always honour `prefers-reduced-motion`. The Proof Thread moves only on real events in the product.
- Status never relies on colour alone: icon, label and pattern.
- Copy: plain sentences, no em dashes in UI text, no filler verbs.
- Mobile first: 16px inputs, 44px targets, no horizontal page scroll (check at 375px).

## Workflow

- Start each stage in plan mode. Commit at every green milestone, on a branch.
- Update `docs/stages/stage-N.md` with what was done, what was verified and what's next.
- Ask before: dependency installs, migrations, `git push`, anything touching production or money.
