# Farbaek: current state

Assessed 2026-10-13 at the start of Stage 0, then updated at the end of the same session.

## 1. What the repository held at the start

The FarBaek folder was **empty** when this session began. The GitHub remote (`swhettiarachchi/Farbaek`) had no commits; the first commit (README only) was pushed at the start of the session.

Notes from an earlier session (2026-10-11) describe a pnpm/turbo monorepo with `packages/db` and PGlite tests. That code is no longer anywhere on this machine (searched Documents, Downloads, Desktop, OneDrive and `~/.claude`). So "reuse working functionality" did not apply: there was nothing to preserve. If that code exists elsewhere, the owner should say where before Stage 1 so it can be merged rather than rebuilt.

Other inputs found:

| Input | Location | Used |
| --- | --- | --- |
| Master spec v2 (pasted 2026-10-13) | `docs/FARBAEK_MASTER_SPEC.md` (verbatim) | Source of truth |
| Master prompt v1 | `~/Downloads/FARBAEK_MASTER_BUILD_PROMPT.md` | Superseded by v2, not copied |
| Claude kit archive (2026-10-11) | `~/Downloads/farbaek-claude-kit.zip` | Not extracted (untrusted download); lists third-party skills |
| Supplied logo | Chat attachment, now `public/brand/farbaek-logo.webp` | Used unaltered |

## 2. What exists now

A Next.js 16 modular monolith with a framework-free domain core, a public marketing site and a pricing page.

```
src/
  app/                 routes: / (home), /pricing, not-found
  components/          UI, grouped by area (brand, site, marketing, pricing, proof, code, motion, ui)
  core/                framework-free domain logic, shared by server, browser and future native apps
    billing/           plan catalog, trial lifecycle, entitlements, usage metering
    trust/             RFC 8785 canonical JSON, SHA-256, approval binding
    realityloop/       task state machine, intent contract schema and checks
    proof/             ProofPack seal geometry from a digest
  content/samples.ts   labelled sample data for the public site
  styles/tokens.css    Proof Atelier colour tokens (contrast-tested)
tests/design/          token contrast test
docs/                  spec, ADRs, threat model, research, stages
```

ESLint forbids `src/core` from importing React, Next, Motion or UI code, so every surface runs the same rules.

### Capability status

| Capability | Status | Evidence |
| --- | --- | --- |
| Plan catalog, annual pricing math | Implemented, unit-tested | `src/core/billing/catalog.test.ts` |
| 14-day trial: eligibility, window, reminders, expiry to Free | Implemented as pure logic, unit-tested | `trial.test.ts` |
| Entitlement checks (fail closed, typed errors, always-available ops) | Implemented, unit-tested | `entitlements.test.ts` |
| Evaluation metering (idempotent, per org, period boundaries) | In-memory reference only, unit-tested | `usage.test.ts` |
| RealityLoop task state machine (evidence guards, optimistic concurrency, idempotent events) | Implemented, unit-tested | `task-machine.test.ts` |
| Intent contract schema (Zod) and deterministic action checks | Implemented, unit-tested | `contract.test.ts` |
| Approval binding (RFC 8785 + SHA-256) | Implemented, unit-tested, used live in the demo | `canonical-json.test.ts`, `approval.test.ts` |
| ProofPack Seal from digest | Implemented, unit-tested | `seal.test.ts` |
| Marketing site and pricing page | Implemented, built, checked at 375px and 1440px, light and dark | Manual browser check, see `docs/stages/stage-0.md` |
| Accounts, organizations, database | Core schema applied to the hosted project. Migration 2 (projects, server-only writes) tested, not yet applied | `tests/db/`, `docs/stages/stage-1.md` |
| Signed-in app: Mission Control, projects, tasks, approvals, billing, settings | Built; verified in the demo workspace; live writes need migration 2 and the secret key | `src/app/app/`, `src/server/workspace/` |
| Studio, Agent, Mesh, LaunchOS, Mobile | **Not started** | Roadmap |
| Payments | **Not connected.** `BILLING_MODE=not_connected` | Spec section 23 |

### Integrations

None are live. No model provider, sandbox, email, database, auth or payment provider is connected. `.env.example` lists the names that later stages will read; the app reads none of them today.

## 3. Data model and auth boundaries

No persistence yet. The domain types in `src/core` define the shapes Stage 1 will persist: billing snapshot, trial window, usage events keyed by `(org_id, idempotency_key)`, task snapshots with version and history, approval records with `bindingHash`.

## 4. Design system and logo

- White Signal design system (ADR 0008, replaces the gold Proof Atelier accent): one light theme, signal blue accent, Geist type, pill controls.
- Tokens: `src/styles/tokens.css`, mapped into Tailwind v4 in `src/app/globals.css`; 81 contrast checks in `tests/design/contrast.test.ts`.
- Hero: React Three Fiber scene with the knight levitating inside the RealityLoop orbit (static image first, 3D only on capable devices).
- Concept film: real-time motion sequence of the workflow from sample data, with real hashes of that data.
- Logo: `public/brand/farbaek-logo.webp` (1024x1536, transparent), shown directly on the page with no plate. PNG fallback and icons from `scripts/brand-assets.mjs`.

## 5. Security gaps (see `docs/security/threat-model.md`)

- No authentication or tenant isolation yet (nothing to protect yet: no user data is collected).
- CSP covers framing, base URI, forms and objects; a nonce-based `script-src` arrives with the app routes.
- No `security.txt` yet: it needs a real contact address from the owner.

## 6. Cost drivers

Today: zero runtime cost beyond static hosting. Future drivers, in order: model tokens, sandbox minutes (wall-clock vs active-CPU pricing differs by vendor), database, email.

## 7. Highest-value next slice

Stage 1: Supabase auth with email verification, organizations, Drizzle schema for billing/trial/usage/tasks with RLS and cross-tenant tests, persisting the pure logic that already exists, plus the responsive app shell with a real Mission Control. See `docs/stages/stage-0.md` for the acceptance list.
