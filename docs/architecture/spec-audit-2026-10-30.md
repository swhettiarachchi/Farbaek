# Master spec audit, 2026-10-30

Every part named in `docs/FARBAEK_MASTER_SPEC.md` (sections 5 to 15, 25 and the traceability matrix in section 29), checked against the code, routes, migrations and decision records on `main` at `975b038`.

- **Built:** the code exists and is tested.
- **Partly built:** some of what the section names exists.
- **Not built:** nothing in the code does it.
- **Live?:** whether it has been used for real in production; see `current-state.md`.

## Stages (section 3)

| Stage | State |
| --- | --- |
| 0. Audit and safety baseline | Built |
| 1. Core application (projects, tasks, auth, pricing, trial) | Built and live |
| 2. Dev Studio vertical slice | Built and live, except visual editing |
| 3. Trust and RealityLoop | Built; several parts not yet run against a live sandbox |
| 4. Farbaek Agent (desktop) | Built (Electron, ADR); Windows Store and Linux builds wait on the owner and 1 November |
| 5. Mesh | Built (Capsules, nearby, relay, direct, browser); phone-native transports not built |
| 6. LaunchOS | Built (Vercel, Netlify); not yet run against a real customer account |
| 7. Native mobile and connectivity | Partly built: an iPhone companion and an Android web app, not yet compiled |
| 8. Advanced and enterprise ("only where justified") | Partly built |

## Section by section

### 5. Core

- **Built:**
  - Mission Control, Projects, Create, Build, Tasks, Approvals, Sandbox, Agents, Mesh, Workflows, Policies, Incidents, Billing and usage, Settings, Help;
  - onboarding (first steps) and the labelled sample workspace.
- **Partly built:** Activity / Audit now has its own page (stage 96, ADR 0119), with filters and a CSV download. Integrations now have their own page too (stage 97, ADR 0120).
- **Stale:** `src/components/app/roadmap.ts` still lists "Mobile apps" as missing.

### 6. Studio

- **Built:**
  - CodeMirror 6 editor with merge view;
  - files and search;
  - proposals and readable diffs;
  - preview from an isolated origin;
  - sandbox terminal and checks;
  - public GitHub import;
  - six static-site templates.
- **Partly built:**
  - Templates: there's nothing yet for e-commerce, SaaS app, CRM, booking, REST API or Next.js. The spec says to match the stack actually implemented, and published sites are static.
  - Git: GitHub import only; no branch or pull-request workflow.
- **Partly built:** the visual builder (visual edit to diff): built for static sites in stage 95 (ADR 0118); apps with a build step aren't covered yet.

### 7. Native agent

- **Built:** the agent loop, typed tool registry, command broker, filesystem guard (realpath), the three permission modes, setup report, `--ignore-scripts` by default, cancellation and recovery states.

### 8. IntentLock, RealityLoop, Context Readiness, outcome contracts

- **Built:** intent contracts, the full task state machine, Future-State Arena, counterfactual replay, outcome watch, incident-to-prevention.
- **Not built:** the Context Readiness Engine and Context Passport (per-fact provenance and freshness: verified-current, possibly stale, conflicting, inferred, missing).

### 9. Trust

- **Built:**
  - the six policy outcomes;
  - approvals bound by SHA-256 over RFC 8785 JSON, with all five states;
  - ProofPacks as signed in-toto (DSSE) statements;
  - undo and recovery;
  - risk explanations;
  - autonomy levels 0 to 4;
  - Policy Builder;
  - shadow mode and scope drift;
  - incidents;
  - the security evaluation suite.
- **Not built:**
  - permission leases (scoped, expiring, revocable grants): built in stage 94 (ADR 0117);
  - the second-checker model: built in stage 98 (ADR 0121);
  - multi-agent coordination and the trust graph;
  - MCP support (tool-definition pinning, a third-party tool registry).

### 10. Dev Intelligence

- **Built:** IntentLock for code (scope drift against the contract), the developer ProofPack, and Farbaek's own security scan of a project.
- **Not built:**
  - Semgrep, OSV-Scanner and gitleaks findings;
  - Failure Futures Lab;
  - mutation testing;
  - Architecture Why-Graph: built per file in stage 100 (ADR 0123);
  - Reversibility Radar: built in stage 99 (ADR 0122);
  - a Cost Brain view: built per task in stage 99 (ADR 0122);
  - the Learn / Pair / Build / Audit operating modes.

### 11. Mesh

- **Built:**
  - Workspace Capsules (BLAKE3);
  - LAN discovery and pairing (Noise XX);
  - the encrypted relay;
  - WebRTC direct;
  - browser and phone receiving;
  - compare and keep-both on conflicts.
- **Not built:**
  - sending only changed files against a shared baseline;
  - an offline receiver's queue;
  - phone-native transports (Nearby Connections, MultipeerConnectivity, Wi-Fi Aware). The spec defers these until hardware testing.

### 12. LaunchOS

- **Built:** the Launch Planner, Vercel and Netlify adapters, explicit deploy authorization, health checks, and custom domains for published sites.
- **Partly built:** the planner shows no cost estimates. It says so honestly rather than guessing.

### 13. Native apps

- **Built:** Electron desktop agent (ADR); phone pairing and revocation; the iPhone companion (approvals with diffs and Face ID, builds, runs, tasks, push, Apple and Google sign-in, App Store plans); Android as a Trusted Web Activity.
- **Partly built:** the spec asked for Expo apps with local projects, editing and Mesh on the phone; the iPhone app is a companion and Android is the website. Neither has been compiled yet (from 1 November). Linux builds aren't signed.

### 14. AI provider and privacy

- **Built:** Claude and Gemini behind adapters, the model-change canary, usage metering at real cost, data export and account deletion.
- **Not built:** organization gateways and local models.

### 15. Subscriptions

- **Built and live:** the catalog, the 14-day trial and its caps, reminders, backend enforcement, usage, top-ups, Dodo billing; App Store plans built and waiting on Apple.

### 25. Innovation backlog

- **Built:** Cost-Before-Compute caps, Intent Diff Lens, Portable Proof (signed ProofPacks and `/verify`), Eject (project export), Approval Wallet, Model Change Canary, Incident Replay Theatre, the publish evidence gate.
- **Partly built:** Real-Project Loom (the 2D project graph; no 3D view).
- **Not built:** the GitHub status check, Continue-on-Desktop handoff, Tool Definition Pinning, Sandbox Egress Ledger.

## Claims on the public site that aren't true yet

`src/components/marketing/modules-bento.tsx` says:

- "A visual builder and a real code workspace on one source of truth. Every visual edit is a reviewable diff." There is no visual builder.
- "Policy, approvals, permission leases and audit, enforced on the server." There are no permission leases.
- "Intent contracts, context readiness and outcome tracking for every task." There is no context readiness.

These break non-negotiable rule 1 (never fabricate) and should be corrected first.

## Not yet proven live

The first-customer journey end to end (sign up, build, preview, publish), checks in a live sandbox, Arena, undo of an applied change, LaunchOS with a real account, real Google and Apple sign-ins, and the mobile apps on devices.
