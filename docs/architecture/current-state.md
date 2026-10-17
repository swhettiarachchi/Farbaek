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
| Evaluation metering (idempotent, per org, period boundaries) | Live for change proposals (one evaluation per policy decision, allowance enforced in the database) | `usage.test.ts`, `tests/db/change-proposals.test.ts` |
| AI credit ledger (reserve, settle, refund; trial or monthly period) | Implemented, tested, applied to the hosted project (migration 4) | `tests/db/ai-credits.test.ts`, `ai-drafting.test.ts` |
| Project files: import with secret screening, versioned storage, tree, search, CodeMirror editor with diff review | Implemented, tested, applied to the hosted project (migration 5, ADR 0010) | `tests/db/project-files.test.ts`, `src/core/workspace/` |
| Change proposals: agent-proposed targeted edits, contract checks, per-chunk diff review, hash-bound approval, apply as revisions (Review Only, not verified) | Implemented, tested, applied to the hosted project (migration 6, ADR 0011). Needs `ANTHROPIC_API_KEY` to run live. | `tests/db/change-proposals.test.ts`, `src/server/workspace/proposals.ts` |
| Policy engine v1 and governed-evaluation metering (escalation to owners or admins, evaluation allowance enforced) | Implemented, tested, applied to the hosted project (migration 7, ADR 0004) | `src/core/trust/policy.ts`, `tests/db/change-proposals.test.ts` |
| Draft an intent contract with AI (Claude, structured output, refusal fallbacks) | Implemented and unit-tested with a fake drafter. Needs `ANTHROPIC_API_KEY` to run live. | `src/server/ai/`, ADR 0009 |
| RealityLoop task state machine (evidence guards, optimistic concurrency, idempotent events) | Implemented, unit-tested | `task-machine.test.ts` |
| Intent contract schema (Zod) and deterministic action checks | Implemented, unit-tested | `contract.test.ts` |
| Approval binding (RFC 8785 + SHA-256) | Implemented, unit-tested, used live in the demo | `canonical-json.test.ts`, `approval.test.ts` |
| ProofPack Seal from digest | Implemented, unit-tested | `seal.test.ts` |
| ProofPacks: in-toto statements per applied change, append-only, hash-chained, integrity re-checked on view | Implemented, tested, applied to the hosted project (migration 8, ADR 0012). Unverified until a sandbox runs checks. | `proofpack.test.ts`, `tests/db/change-proposals.test.ts` |
| Marketing site and pricing page | Implemented, built, checked at 375px and 1440px, light and dark | Manual browser check, see `docs/stages/stage-0.md` |
| Accounts, organizations, database | All eight migrations applied to the hosted project (core schema, projects and server-only writes, intent contracts, AI credit ledger, project files, change proposals, policy and metering, ProofPacks) | `tests/db/`, `docs/stages/` |
| Signed-in app: Mission Control, projects, tasks, intent contracts, approvals, billing, settings | Built; verified in the demo workspace; live use needs `.env.local` (run `pnpm setup:env`) | `src/app/app/`, `src/server/workspace/` |
| FARBAEK Sandbox: isolated sessions (E2B microVMs behind a Farbaek runtime interface), Guard rules, receipts, previews, v1 API and SDK, Studio UI (ADR 0013) | Built and tested; migration 10 applied to the hosted project. **Execution is off** until a runtime is connected and pnpm sandbox:smoke passes | docs/sandbox/, docs/stages/stage-4.md |
| Agent, Mesh, LaunchOS, Mobile | **Not started** | Roadmap |
| Payments | **Not connected.** `BILLING_MODE=not_connected` | Spec section 23 |

### Integrations

- **Supabase** (auth and database): connected to the hosted project. The app reads it once `.env.local` exists (`pnpm setup:env`).
- **Anthropic** (contract drafting): code is in place; it runs only when the server has `ANTHROPIC_API_KEY`. Usage is billed to that key.
- Not connected: sandbox runtime (code and setup are in place; see docs/sandbox/README.md), email, payments. `.env.example` lists every variable name and what reads it.

## 3. Data model and auth boundaries

Postgres on Supabase with Row Level Security on every table. The browser can only read. Every write goes through a server action, then the TypeScript rules in `src/server/workspace/`, then a service-role-only `app_*` function that re-checks membership, limits and versions. Tables: organizations, members, trials, billing accounts, evaluation events, projects, project files and file revisions, change proposals, tasks, task transitions, intent contracts, AI credit ledger, audit events.

## 4. Design system and logo

- White Signal design system (ADR 0008, replaces the gold Proof Atelier accent): one light theme, signal blue accent, Geist type, pill controls.
- Tokens: `src/styles/tokens.css`, mapped into Tailwind v4 in `src/app/globals.css`; 81 contrast checks in `tests/design/contrast.test.ts`.
- Hero: React Three Fiber scene with the knight levitating inside the RealityLoop orbit (static image first, 3D only on capable devices).
- Concept film: real-time motion sequence of the workflow from sample data, with real hashes of that data.
- Logo: `public/brand/farbaek-logo.webp` (1024x1536, transparent), shown directly on the page with no plate. PNG fallback and icons from `scripts/brand-assets.mjs`.

## 5. Security gaps (see `docs/security/threat-model.md`)

- Auth and tenant isolation are in place (Supabase email sign-in, RLS, cross-tenant database tests). The live write path hasn't been exercised end to end against the hosted project yet.
- AI drafting sends task titles, project details and the person's notes to Anthropic. They are sent as data with a system prompt that says so; the output only prefills the editor.
- CSP covers framing, base URI, forms and objects; a nonce-based `script-src` arrives with the app routes.
- No `security.txt` yet: it needs a real contact address from the owner.

## 6. Cost drivers

Today: Supabase, plus model tokens for each AI contract draft (Claude Opus 5.5, up to 8,000 output tokens per draft, billed to the server's Anthropic key; credits cap how many drafts a workspace can make). Once a runtime is connected: sandbox running time (metered per session; plan limits in src/config/sandbox.ts; on a self-hosted runtime, the host instead). Future: email.

## 7. Highest-value next slice

Stage 2 continues: verify AI drafting live, then GitHub import and the file workspace, then patch generation and diff review. See `docs/stages/stage-2.md`.
