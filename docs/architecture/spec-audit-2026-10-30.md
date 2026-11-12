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
| 5. Mesh | Built (Capsules, nearby, relay, direct, browser, and natively on Android: stage 183); the iPhone's native transport follows in stage 184 |
| 6. LaunchOS | Built (Vercel, Netlify); not yet run against a real customer account |
| 7. Native mobile and connectivity | Partly built: an iPhone companion and an Android web app, not yet compiled |
| 8. Advanced and enterprise ("only where justified") | Partly built |

## Section by section

### 5. Core

- **Built:**
  - Mission Control, Projects, Create, Build, Tasks, Approvals, Sandbox, Agents, Mesh, Workflows, Policies, Incidents, Billing and usage, Settings, Help;
  - onboarding (first steps) and the labelled sample workspace.
- **Built:** Activity / Audit has its own page (stage 96, ADR 0119), with filters and a CSV download, and so do Integrations (stage 97, ADR 0120).
- **Fixed:** the app's roadmap now lists phone apps in the stores, which is what's still missing; the apps themselves are built (section 13).

### 6. Studio

- **Built:**
  - CodeMirror 6 editor with merge view;
  - files and search;
  - proposals and readable diffs;
  - preview from an isolated origin;
  - sandbox terminal and checks;
  - public GitHub import;
  - GitHub pull requests for applied changes, with a Farbaek ProofPack status (stage 103, ADR 0126);
  - nine static-site templates (three added in stage 101: online store, booking, dashboard).
- **Partly built:**
  - Templates: e-commerce, booking and an admin dashboard (stage 101, ADR 0124); a CRM template and a REST API service starter in plain Node.js (stage 117, ADR 0140). An app with sign-in since stage 180 (ADR 0190): Fieldnote, a starter with accounts, sessions, reset links and private data in plain Node.js, tested; it runs in a test space and on a server host, not as a published static site.
  - Git: a pull request per applied change, on its own branch, through the workspace's fine-grained token (stage 103). What happens after a pull request opens is read back hourly and on request (stage 120, ADR 0143). Private repositories are imported with the workspace's token by owners and admins (stage 121, ADR 0144). A change that builds on an unmerged Farbaek pull request is stacked on its branch (stage 124, ADR 0147).
- **Partly built:** the visual builder (visual edit to diff): static sites in stage 95 (ADR 0118), and apps with a build step by component in stage 106 (ADR 0129: words and Tailwind classes in JSX). Picking an element in the running app: built in stage 127 (ADR 0149), matched to the JSX by its words and classes, not source maps.

### 7. Native agent

- **Built:** the agent loop, typed tool registry, command broker, filesystem guard (realpath), the three permission modes, setup report, `--ignore-scripts` by default, cancellation and recovery states.

### 8. IntentLock, RealityLoop, Context Readiness, outcome contracts

- **Built:** intent contracts, the full task state machine, Future-State Arena, counterfactual replay, outcome watch, incident-to-prevention.
- **Built:** the Context Readiness Engine and Context Passport (stage 93, ADR 0116): per-fact provenance and freshness (verified-current, possibly stale, conflicting, inferred, missing).

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
  - the trust graph: built in stage 109 (ADR 0132), with agent teams in stage 105 (ADR 0128), and agents' pinned tools and the workspace's rules as nodes since stage 123 (ADR 0146);
  - MCP support: built in stage 126 (ADR 0148) for Farbaek Agent: stdio MCP servers the person adds, offered in Controlled Development with every call approved, and reviewed by an owner or admin through tool pinning (ADR 0133) before first use. Not in cloud runs.

### 10. Dev Intelligence

- **Built:** IntentLock for code (scope drift against the contract), the developer ProofPack, and Farbaek's own security scan of a project.
- **Not built:**
  - Semgrep and secret findings: built in stage 114 (ADR 0137) with Farbaek's own Semgrep rules and detect-secrets in a sandbox; gitleaks and TruffleHog need GitHub release hosts the sandbox can't reach (dependency findings from OSV.dev: stage 107, ADR 0130);
  - Failure Futures Lab: built in stage 112 (ADR 0135), from the lines a change adds, and from the project's past incidents on the same files since stage 122 (ADR 0145);
  - mutation testing: built in stage 113 (ADR 0136) as Farbaek's own bounded mutator on a change's added lines, not StrykerJS;
  - Architecture Why-Graph: built per file in stage 100 (ADR 0123);
  - Reversibility Radar: built in stage 99 (ADR 0122);
  - a Cost Brain view: built per task in stage 99 (ADR 0122);
  - the Learn / Pair / Build / Audit operating modes: built in stage 108 (ADR 0131).

### 11. Mesh

- **Built:**
  - Workspace Capsules (BLAKE3);
  - LAN discovery and pairing (Noise XX);
  - the encrypted relay;
  - WebRTC direct;
  - browser and phone receiving;
  - compare and keep-both on conflicts.
- **Not built:**
  - sending only changed files: built in stage 115 (ADR 0138), against an earlier copy the receiver chooses;
  - an offline receiver's queue: built in stage 115 (ADR 0138), on the sender, for up to a day, across restarts;
  - phone-native transports (Nearby Connections, MultipeerConnectivity, Wi-Fi Aware). The spec defers these until hardware testing.
  - built for Android in stage 183 (ADR 0193): the desktop's own protocol over the local Wi-Fi in a native screen, rather than Nearby Connections, so a phone talks to the desktop app directly.

### 12. LaunchOS

- **Built:** the Launch Planner, Vercel and Netlify adapters, explicit deploy authorization, health checks, and custom domains for published sites.
- **Built:** Render, Railway and Fly.io adapters for apps that run a server (stage 181, ADR 0191), from official API references only; not yet run against a real account.
- **Built:** what will cost money at launch (stage 118, ADR 0141): the drivers in the project's own files, with evidence and each host's pricing page.
- **Partly built:** no dollar estimates. Farbaek can't see a person's plan or traffic at a host, so it says so rather than guessing.

### 13. Native apps

- **Built:** Electron desktop agent (ADR); phone pairing and revocation; the iPhone companion (approvals with diffs and Face ID, builds, runs, tasks, push, Apple and Google sign-in, App Store plans); Android as a Trusted Web Activity.
- **Built (stage 182, ADR 0192):** projects on the phone in the website and the Android app: a copy kept on the device, edited with no connection, saves sent later with a compare when Farbaek changed too, Share a copy and .zip import; the phone API's file routes for the iPhone.
- **Partly built:** the spec asked for Expo apps with local projects, editing and Mesh on the phone; the iPhone app is a companion and Android is the website. The iPhone app compiled and passed its tests on 1 November, and build 17 is in App Store Connect (stage 129); the Android bundle waits for the owner's upload key. The Mac agent is notarized and published, and the Linux AppImage is published, unsigned as AppImages usually are.

### 14. AI provider and privacy

- **Built:** Claude and Gemini behind adapters, the model-change canary, usage metering at real cost, data export and account deletion.
- **Built:** a workspace's own Anthropic key and company gateway (stage 102, ADR 0125), used by contract drafting, change proposals and the agent's model gateway for the desktop app and cloud runs; local models on the desktop agent (stage 111, ADR 0134).
- **Partly built:** the second check and image generation still use Farbaek's providers (security reviews use the workspace's own key since stage 128), and there are no keys for OpenAI or Gemini.

### 15. Subscriptions

- **Built and live:** the catalog, the 14-day trial and its caps, reminders, backend enforcement, usage, top-ups, Dodo billing; App Store plans built and waiting on Apple.

### 25. Innovation backlog

- **Built:** Cost-Before-Compute caps, Intent Diff Lens, Portable Proof (signed ProofPacks, `/verify` and the "Farbaek ProofPack" status on GitHub, stage 103), the Sandbox Egress Ledger (stage 104, recorded by a proxy inside the sandbox), Eject (project export), Approval Wallet, Model Change Canary, Incident Replay Theatre, the publish evidence gate.
- **Built, experimental:** Real-Project Loom: the 2D project graph and an opt-in 3D view of the same real records (stage 119, ADR 0142). It stays off by default until usability testing shows it helps.
- **Built:** Continue-on-Desktop handoff (stage 116, ADR 0139), through Farbaek rather than Mesh until the phone apps are native; reports are labelled as reported by the computer.
- **Not built:** nothing else in this section. (Tool Definition Pinning: built in stage 110, ADR 0133.)

## Claims on the public site that aren't true yet

The three claims this section listed in `src/components/marketing/modules-bento.tsx` are now true:

- the visual builder (stages 95 and 106, ADRs 0118 and 0129);
- permission leases (stage 94, ADR 0117);
- context readiness (ADR 0116).

## Not yet proven live

The first-customer journey end to end (sign up, build, preview, publish), checks in a live sandbox, Arena, undo of an applied change, LaunchOS with a real account, real Google and Apple sign-ins, and the mobile apps on devices.
