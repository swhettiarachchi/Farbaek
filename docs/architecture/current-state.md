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
| Plan catalog: Free, Starter, Plus, Pro, Studio, Max, Max 2x, Max 3x, Enterprise, every allowance from one cost formula at a 40% margin (ADR 0020) | Implemented, unit-tested, on the pricing page and Billing | `src/core/billing/catalog.test.ts`, `allowance.ts` |
| 14-day trial: eligibility, window, reminders, expiry to Free | Implemented as pure logic, unit-tested | `trial.test.ts` |
| Entitlement checks (fail closed, typed errors, always-available ops) | Implemented, unit-tested | `entitlements.test.ts` |
| Evaluation metering (idempotent, per org, period boundaries) | Live for change proposals (one evaluation per policy decision, allowance enforced in the database) | `usage.test.ts`, `tests/db/change-proposals.test.ts` |
| Usage wallet: AI metered at real token cost from a rate card, grants with a month of rollover, soonest expiry spent first, reserve then settle, failed calls refunded, a capped free-retry reserve (ADR 0020) | Implemented, tested, migration 15 applied; a live contract draft reserved 1,623 units and settled to its real 163 | `tests/db/ai-credits.test.ts`, `src/core/billing/wallet.test.ts`, `ai-usage.test.ts` |
| Project files: import with secret screening, versioned storage, tree, search, CodeMirror editor with diff review | Implemented, tested, applied to the hosted project (migration 5, ADR 0010) | `tests/db/project-files.test.ts`, `src/core/workspace/` |
| Change proposals: agent-proposed targeted edits, contract checks, per-chunk diff review, hash-bound approval, apply as revisions (Review Only, not verified) | Implemented, tested, applied to the hosted project (migration 6, ADR 0011). Needs `ANTHROPIC_API_KEY` to run live. | `tests/db/change-proposals.test.ts`, `src/server/workspace/proposals.ts` |
| Policy engine v1 and governed-evaluation metering (escalation to owners or admins, evaluation allowance enforced) | Implemented, tested, applied to the hosted project (migration 7, ADR 0004) | `src/core/trust/policy.ts`, `tests/db/change-proposals.test.ts` |
| Draft an intent contract with AI (structured output, refusal fallbacks where the model has them), routed per plan and effort (ADR 0021) | Implemented, tested, used live (Haiku on Balanced) | `src/server/ai/`, `src/core/agent/routing.ts` |
| RealityLoop task state machine (evidence guards, optimistic concurrency, idempotent events) | Implemented, unit-tested | `task-machine.test.ts` |
| Intent contract schema (Zod) and deterministic action checks | Implemented, unit-tested | `contract.test.ts` |
| Approval binding (RFC 8785 + SHA-256) | Implemented, unit-tested, used live in the demo | `canonical-json.test.ts`, `approval.test.ts` |
| ProofPack Seal from digest | Implemented, unit-tested | `seal.test.ts` |
| ProofPacks: in-toto statements per applied change, append-only, hash-chained, integrity re-checked on view | Implemented, tested, applied to the hosted project (migration 8, ADR 0012). Unverified until a sandbox runs checks. | `proofpack.test.ts`, `tests/db/change-proposals.test.ts` |
| Recovery: undo an applied change file by file, never over newer changes, verified byte for byte, recorded as an in-toto receipt | Implemented, tested, applied to the hosted project (migration 11, ADR 0015). Not yet run on a live applied change. | `src/core/realityloop/recovery.test.ts`, `tests/db/recovery.test.ts` |
| Verified ProofPacks: a check run in a sandbox against exactly the applied content appends a ProofPack with the real results; edits in the sandbox never verify a change | Implemented, tested, applied (migration 12), used live on Vercel Sandbox | `tests/db/verification-proofpacks.test.ts`, `service.test.ts` |
| Team invitations by one-time link: owners and admins invite by email and role, seats counted with open invitations | Implemented, tested, applied (migration 13, ADR 0017); creating, the link page and revoking checked live | `tests/db/invitations.test.ts`, `invitations.test.ts` |
| Marketing site and pricing page | Implemented, built, checked at 375px and 1440px, light and dark | Manual browser check, see `docs/stages/stage-0.md` |
| Accounts, organizations, database | All nineteen migrations applied to the hosted project (core schema, projects and server-only writes, intent contracts, AI credit ledger, project files, change proposals, policy and metering, ProofPacks, archiving, sandboxes, recovery, verification ProofPacks, invitations, agents, plans and the usage wallet, cloud agent runs, project previews, security reports, published sites) | `tests/db/`, `docs/stages/` |
| Signed-in app: Mission Control, projects, tasks, intent contracts, approvals, billing, settings | Built; verified in the demo workspace; live use needs `.env.local` (run `pnpm setup:env`) | `src/app/app/`, `src/server/workspace/` |
| FARBAEK Sandbox: isolated sessions (E2B microVMs behind a Farbaek runtime interface), Guard rules, receipts, previews, v1 API and SDK, Studio UI (ADR 0013) | Built and tested; migration 10 applied to the hosted project. **Execution is off** until a runtime is connected and pnpm sandbox:smoke passes | docs/sandbox/, docs/stages/stage-4.md |
| Farbaek Agent: desktop app (Electron) with Review Only and Controlled Development, folder guard, command broker, pairing by one-time code, agent API; model steps through Farbaek's model gateway, no keys (ADR 0018, ADR 0021); its work lands as a normal proposal | Implemented, tested, migration 14 applied; pairing, a real gateway step, proposal submission and revoke checked live. Unsigned installer built (before the gateway; rebuild needed) | `docs/agent/`, `tests/db/agents.test.ts`, `src/agent-runtime/*.test.ts` |
| Cloud agent runs and the Build workspace: the agent on Farbaek's servers with model steps through the gateway and commands in a sandbox, live steps, approvals, proposals tagged with the run (ADR 0022) | Implemented, tested, migration 16 applied; a live run edited the test project and its change was applied | `src/server/cloud-agent/`, `tests/db/agent-runs.test.ts` |
| Previews: a project's files on a private preview host with no sandbox, and apps in Vercel sandboxes through the signed relay, with Start and Stop app (ADR 0023) | Implemented, tested, migration 17 applied; both checked live on a local test server. **On in production** on farbaek.si since 21 Oct: the gateway refuses preview hosts without access | `src/core/sandbox/relay.ts`, `src/server/sandbox/gateway.ts` |
| Security checks: Farbaek's rules over every file, `npm audit` on the lockfile in a registry-only sandbox, an AI review of the riskiest files, a scored in-toto report, and Fix with the agent (ADR 0024) | Implemented, tested, migration 18 applied; a live check scored 97 (grade A) and its finding became a task | `src/core/security/`, `src/server/security/`, `tests/db/security-reports.test.ts` |
| Live workspace: the 3D Agent Core on Build and run pages with a static fallback, Steps, Files and Run panes with swipe and an approval sheet on phones, page transitions, run and usage cards on Mission Control (ADR 0025) | Implemented and tested; checked on a sample page at 375px and 1280px, and on the owner's workspace | `src/components/build/agent-core.tsx`, `src/core/agent/run-phase.ts` |
| Prompt-first builds: one sentence to a project, task and AI-drafted plan card, then Approve and build; follow-ups into the same project with its real paths in the plan (ADR 0027) | Implemented and tested; a live prompt became a plan, a run and an applied change | `src/server/workspace/start-from-prompt.ts`, `src/app/app/new/` |
| Run page as a workspace: messages to a running agent, live usage share and refunds, instant sandboxed `srcdoc` previews of static sites with Before and "With this change", Keep going (ADR 0027) | Implemented and tested; a mid-run message changed the agent's live output | `src/server/cloud-agent/executor.ts`, `src/core/workspace/static-preview.ts`, `src/components/build/run-live.tsx` |
| Agents present everywhere: the agent inbox on Mission Control, the presence orb on every page, the Ctrl/Cmd+K command palette, and the verified Seal forming once (ADR 0028) | Implemented and tested; checked on a local production build with real runs | `src/core/agent/inbox.ts`, `src/components/app/command-palette.tsx` |
| Templates: six sites built to the Studio standard, each with a `DESIGN.md`, its own look and a working feature; a gallery and a new-build strip of lazy, script-free pictures; "Use this template" into the prompt flow (ADR 0028, ADR 0030) | Implemented and tested; a live build from the Landing page template (Ledgerline) wrote its own DESIGN.md, adapted the signature and ran review_site | `src/content/starters/templates/`, `src/app/app/templates/` |
| Publish static sites: `<name>.<site domain>` after a clean security check of exactly those files, every version kept, make live and take offline (ADR 0029) | Implemented, tested, migration 19 applied; published, served by Host header and taken offline on a local build. **On in production** at `<name>.farbaek.si`; an unknown name answers "There's no site here" | `src/core/publish/`, `src/server/publish/`, `tests/db/sites.test.ts` |
| The Farbaek Studio standard and skills: every build designs first (`DESIGN.md`), eight built-in skills chosen on the plan card, a project's own SKILL.md skills added from the project page, and `review_site` before finishing (ADR 0030) | Implemented and tested; live builds wrote DESIGN.md first and ran review_site | `src/core/agent/studio-standard.ts`, `src/content/skills/`, `src/core/agent/site-review.ts` |
| Your work, visible: live pictures of each project's site on project cards and in Mission Control's Recent work | Implemented and tested; checked with real projects | `src/server/workspace/project-thumbnail.ts`, `src/components/app/site-thumb.tsx` |
| Homepage showroom: eight concept mockups with design reads and a hand-off to the build box, and an honest capability list (ADR 0031) | Implemented and tested; live on www.farbaek.com | `src/components/showcase/`, `src/content/showcase.ts` |
| Rescue import: a `.zip` unpacked and screened in the browser, imported as a project, and checked for security straight away (ADR 0028) | Implemented and tested; a flawed sample app scored 53 (D) with both planted flaws found | `src/core/workspace/unzip.ts`, `src/server/workspace/rescue.ts` |
| Admin console at `/admin` for listed admins (FARBAEK_ADMIN_EMAILS): overview with AI list cost, workspaces, people, activity and connections, read-only (ADR 0026) | Implemented and tested; checked locally with real data. hello@farbaek.com is the production admin once its sign-in email can arrive | `src/server/admin/`, `src/app/admin/` |
| Office Space at `officespace.farbaek.com` (ADR 0032): staff sign in with an email code and an authenticator code, five roles, 30-minute idle and 12-hour sessions, a hash-chained audit log; workspace pages, suspend and restore, take sites offline, add AI usage, extend trials (capped by role, 44 days at most), five platform pause switches and announcements, all enforced in the database; an overview of sign-ups, activation, live sites, AI cost (an estimate) and trials, and Ctrl+K search; a support inbox (people write from Help in the app, staff reply or add internal notes) and a Health page | Implemented and tested; migrations 20 to 23 applied to the hosted database. Live on the VPS at officespace.farbaek.com | `src/app/office/`, `src/server/office/`, `tests/db/office-*.test.ts` |
| Hosting on the owner's Hostinger VPS (ADR 0035, ADR 0036): Docker, Caddy with automatic HTTPS (on-demand certificates for published sites, ADR 0045), pull deploys from `main` with health-checked rollback, self-hosted Supabase | Live since 22 Oct 2026 at www.farbaek.com, officespace.farbaek.com and api.farbaek.com; Railway is retired and its docs and code paths removed | `docs/deploy/vps.md`, `deploy/vps/`, `scripts/vps/` |
| LaunchOS A (ADR 0033): the Launch Planner reads a project (kind, commands, setting names only, services, destinations), the evidence chain (security check, ProofPack, live version, live check), and live checks that confirm the live address serves exactly the published version | Implemented and tested; migration 24 applied to the hosted database (2026-10-21). Provider connections wait for the owner's choice | `src/core/launch/`, `src/server/launch/`, `tests/db/site-health.test.ts` |
| Product films (ADR 0034): real recordings of Farbaek's interface with a sample project, shot frame by frame on a dev-only film stage and encoded to H.264. On the homepage: the build film below the hero, four feature clips, and the proof film. Captions, chapters, transcript; no autoplay under reduced motion or Save-Data | Implemented and tested; not yet deployed | `src/components/films/`, `src/content/films.ts`, `scripts/films/record.mjs`, `public/films/` |
| Mesh phase A, Workspace Capsules (ADR 0037): download a project as a Capsule with a BLAKE3 hash for every file and chunk and secrets left out; open one with every byte checked again in the browser and on the server, into a new project or an existing one, deciding each differing file (keep mine, use the Capsule's, keep both); a recorded history | Implemented and tested; migration 25 | `src/core/mesh/`, `src/server/mesh/`, `src/app/app/mesh/`, `tests/db/capsules.test.ts` |
| Mesh nearby transfer (ADR 0038): the Farbaek Agent finds others on the local network while visible, pairs with a six-digit code from a Noise XX handshake, and sends folders encrypted, checked by BLAKE3 per 4 MiB chunk, resumable, accepted by the person into a new folder | Implemented and tested (the published Noise vector, 14 transfer tests, also under Electron); checked live between two agents on one computer. Between two physical computers: still to check | `src/agent-runtime/mesh/`, `desktop/src/main/mesh.ts`, `desktop/src/renderer/nearby.tsx` |
| Portable Proof and Eject Anytime (ADR 0039): a public `/verify` page that checks ProofPacks, receipts, security reports and Capsules in the browser, and matches a file to what was approved; Export everything with tasks, contracts, evidence and history | Implemented and tested | `src/core/proof/inspect.ts`, `src/core/workspace/export.ts`, `src/app/(site)/verify/` |
| A run's own usage cap (ADR 0040): Stop the run at the estimate, twice that, or no run cap; the gateway refuses a step whose worst case doesn't fit before charging anything; any limit stop keeps its work as a partial proposal | Implemented and tested; migration 26 | `src/core/agent/run-cap.ts`, `src/server/agent/gateway.ts`, `src/server/cloud-agent/executor.ts` |
| Intent Diff Lens (ADR 0041): each hunk of a proposal in review shows exact contract flags (paths, operations, protected fields), a pointer to the criterion it shares words with, or "unexplained" | Implemented and tested | `src/core/realityloop/intent-lens.ts`, `src/components/proposals/intent-lens.tsx` |
| Approval Wallet (ADR 0042): proposals can be approved for 72 hours, a window set and enforced by the database that nobody can move; the approvals inbox as cards with the hash, a live countdown, what the checks found, the undo path and the checks that will verify it; the desktop agent sees approval, verification or expiry and checks Farbaek holds exactly the hash it sent | Implemented and tested; migration v27 | `supabase/migrations/20261029090000_approval_window.sql`, `src/core/trust/approval-wallet.ts`, `src/components/approvals/wallet-card.tsx` |
| Skill pinning (ADR 0043, the spec's Tool Definition Pinning): a project's own skills reach the agent only in the version a person approved, by revision and SHA-256; new or changed skills are held back from runs, named in the run's steps and on the plan card, and reviewed as a diff on the project page | Implemented and tested; migration v28 | `supabase/migrations/20261030090000_skill_pins.sql`, `src/core/agent/skill-pins.ts`, `src/components/skills/skill-review.tsx` |
| AI suggestions in the Intent Diff Lens (ADR 0044): on request, Claude names the contract clause each change serves, or none, with a reason; metered as `lens_mapping` and refunded on failure; only hunks sent and clauses that exist are kept; shown as AI beside the exact flags, which it never changes | Implemented and tested; migration v29; no live model call made yet | `src/core/realityloop/lens-suggestion.ts`, `src/server/workspace/lens-suggestions.ts`, `src/server/ai/lens-mapper.ts` |
| Site certificates on demand and custom domains (ADR 0045): Caddy makes a certificate on first visit only for a live `<name>.farbaek.si` or a verified custom domain; people connect up to two of their own domains to a published site, verified by a TXT record and a CNAME (or an A record for root domains), checked on the server | Implemented and tested; migration v30; Caddyfile validated on the server. Live once the owner adds the farbaek.si DNS records and settings, and deploys | `supabase/migrations/20261101090000_site_domains.sql`, `src/server/publish/domains.ts`, `deploy/vps/caddy/Caddyfile` |
| Autonomy level 2, bounded execution (ADR 0046): owners and admins let small, checked changes (inside the contract, no sensitive files, within a file limit, checks a verified sandbox can run) apply on their own, recorded as approved by policy; the database refuses it while off and pauses it after a failed check | Implemented and tested; migration v31. Off by default; desktop-agent proposals always wait | `src/core/trust/policy.ts`, `supabase/migrations/20261102090000_autonomy.sql`, `src/components/app/autonomy-settings.tsx` |
| Mesh on phones (mDNS, mobile apps), remote transfer and relay; LaunchOS providers; Mobile | **Not started** | Roadmap |
| Payments | **Not connected.** `BILLING_MODE=not_connected` | Spec section 23 |

### Integrations

- **Supabase** (auth and database): connected to the hosted project. The app reads it once `.env.local` exists (`pnpm setup:env`).
- **AI providers** (contract drafting and change proposals): Claude (`ANTHROPIC_API_KEY`) and Gemini (`GEMINI_API_KEY`, ADR 0014). Code is in place for both; each runs only when its key is set on the server, and usage is billed to that key. Claude is used when both are set unless `AI_PROVIDER` says otherwise.
- **Sandbox runtime**: Vercel Sandbox (Hobby, free and hard-capped), verified with pnpm sandbox:smoke on 2026-10-17 (ADR 0016). E2B stays available.
- Not connected: hosting and a domain, email (invitations use a one-time link meanwhile), payments. `.env.example` lists every variable name and what reads it.

## 3. Data model and auth boundaries

Postgres on Supabase with Row Level Security on every table. The browser can only read. Every write goes through a server action, then the TypeScript rules in `src/server/workspace/`, then a service-role-only `app_*` function that re-checks membership, limits and versions. Tables: organizations, members, trials, billing accounts, evaluation events, projects, project files and file revisions, change proposals, ProofPacks, recovery operations, tasks, task transitions, intent contracts, AI credit ledger, sandbox sessions and their records, invitations, agents and pairing codes, audit events. Desktop agents authenticate with their own token on `/api/v1/agent` only; those requests read with the server key, scoped to the agent's workspace in every query, and write through the same `app_*` functions.

## 4. Design system and logo

- White Signal design system (ADR 0008, replaces the gold Proof Atelier accent): one light theme, signal blue accent, Geist type, pill controls.
- Tokens: `src/styles/tokens.css`, mapped into Tailwind v4 in `src/app/globals.css`; 81 contrast checks in `tests/design/contrast.test.ts`.
- Hero: React Three Fiber scene with the knight levitating inside the RealityLoop orbit (static image first, 3D only on capable devices).
- Product films (ADR 0034): recordings of the real interface with a sample project, made on the film stage by `pnpm films:record`. They replaced the in-browser concept film.
- Logo: `public/brand/farbaek-logo.webp` (1024x1536, transparent), shown directly on the page with no plate. PNG fallback and icons from `scripts/brand-assets.mjs`.

## 5. Security gaps (see `docs/security/threat-model.md`)

- Next.js is pinned to 16.4.2, which fixes the three advisories published 2026-10-22, two of them critical remote code execution (`docs/security/advisory-2026-10-22-nextjs.md`). Production is safe once that's deployed.
- Auth and tenant isolation are in place (Supabase email sign-in, RLS, cross-tenant database tests). The live write path hasn't been exercised end to end against the hosted project yet.
- AI drafting sends task titles, project details and the person's notes to Anthropic. They are sent as data with a system prompt that says so; the output only prefills the editor.
- CSP covers framing, base URI, forms and objects; a nonce-based `script-src` arrives with the app routes.
- No `security.txt` yet: it needs a real contact address from the owner.

## 6. Cost drivers

Today: Supabase, plus model tokens for each AI contract draft and change proposal (Claude Opus 5.5 for now, billed to the server's Anthropic key; the usage wallet meters each call at its real cost against the plan's allowance, `docs/billing/usage.md`). Plans are costed in `reports/AI coding platform costs and pricing.md`. Once a runtime is connected: sandbox running time (metered per session; plan limits in src/config/sandbox.ts; on a self-hosted runtime, the host instead). Future: email.

## 7. Highest-value next slice

1. **Prove the production loop end to end:** a real sign-in email through Spacemail, a published site on farbaek.si, and an app preview in a sandbox, all from a signed-in workspace on www.farbaek.com.
2. **Image generation:** it needs the owner's choice of provider and pricing.
3. **Then the spec's next stages:** custom domains for published sites, Mesh, and LaunchOS with a real provider. See `docs/stages/stage-6.md`.
