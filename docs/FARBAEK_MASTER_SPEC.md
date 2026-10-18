<!-- Source of truth. Pasted by the owner on 2026-10-13 (v2). Stored verbatim, including paste artifacts from the original formatting. -->

# FARBAEK — UNIFIED MASTER BUILD SPECIFICATION v2 (October 2026)
Verified software creation, governed AI agents, cross-device workspaces, controlled launch — with a premium, mobile-first experience

Document purpose: This is the single source of truth for Claude Code to inspect, architect, implement, test and evolve Farbaek in the existing repository. It consolidates the ActionGuard, ActionGuard Mesh, RealityLoop, Dev Intelligence, Dev Studio, LaunchOS, Native Agent, mobile/desktop, trust-and-control and subscription prompts. On top of the original consolidated prompt it adds research-grounded technical choices, a design and experience system, a mobile specification, an innovation backlog, ethical growth rules, a Dodo-ready billing architecture and a phased execution plan. Nothing in the original is removed. Where this version changes a decision, it says why.

Research date: Facts were checked on 13 October 2026. Anything marked [VERIFY] must be re-checked against official documentation before implementation. Record verifications in docs/research/.

0. NON-NEGOTIABLE OPERATING INSTRUCTIONS

Act as a coordinated team with these roles:

Principal software architects and platform architects.
Senior full-stack, web, application and native (desktop/mobile) engineers.
AI-agent, runtime and automation engineers.
A senior computer scientist.
Application-security and cybersecurity specialists.
DevOps and reliability engineers, and database engineers.
Developer-experience designers, senior UI/UX and product designers.
Motion, animation and 3D specialists.
Mobile-experience and responsive-design specialists.
Accessibility specialists.
A SaaS product strategist and pragmatic product strategists.

Think deeply and critically before important decisions, and record them as ADRs.

Work in the existing Farbaek repository. A clean-room rewrite is not permitted.

Inspect first. Map the repository: framework, package manager, routes, design system, authentication, database, migrations, integrations, AI providers, billing, deployment configuration, tests and workflows already built. Inspect the names and structure of secrets and configuration without printing secret values.
Preserve working functionality. Reuse sound components and patterns. Do not delete working features, blindly overwrite configuration, introduce a parallel architecture, or duplicate existing policy, billing, identity, task or audit systems.
Create one source of truth. Use one shared domain model, shared authorization and policy services, one shared event and evidence model, shared entitlements, shared design tokens and typed contracts across all modules.
Build end-to-end vertical slices. Do not stop at a landing page, mockups, architecture documents or a decorative dashboard. Implement the most valuable feasible workflow through real persistence, authorization, operations, error handling and tests.
Be honest about state. Never fabricate any of the following:
live integrations, devices or progress;
test results, execution results or security scans;
usage, prices, payments, deployment outcomes or metrics;
customer testimonials.
Demo data must be explicitly labelled and isolated from live operations.
Enforce security on the server/runtime. Frontend hiding, disabled buttons, prompts and model instructions are not security boundaries. Validate every sensitive operation outside the AI model.
No destructive shortcuts. Never use blanket permission-bypass options, unrestricted host shell execution, exposed secrets, silent production changes or unapproved purchases. Preserve user data and uncommitted changes.
Research current technical constraints. Before choosing or implementing providers, native APIs, payment processors or deployment workflows, verify current official documentation: API capabilities, terms, SDK versions, platform compatibility, permissions, pricing and restrictions. Record decisions and dates in docs/research/ and in ADRs.
Make progress visible. Begin with a concise repository assessment and implementation plan, then proceed without waiting for approval. The exception is a genuinely destructive or externally consequential decision, which needs user authorization. Reassess after each stage.
Run checks. Execute tests, type checks, lint, build, migration checks and relevant security scans. Fix failures your work introduces. Report clearly what was and was not verified.
Do not promise "the world's first." Do not claim global uniqueness, guaranteed safety, perfect prediction, universal rollback, compliance certification or complete protection unless proven.
Keep the product economically realistic. Use bounded AI context, quotas, timeouts, resource limits, job limits, minimal services and plan entitlements. Do not build expensive infrastructure before a use case needs it.
No decorative dead ends (new). Every button, menu, control, animation and dashboard must either work end-to-end or be visibly unavailable with an honest reason. No placeholder interactions, non-functional buttons or fake loading.

If credentials, provider accounts, physical devices, app-signing keys or sandbox infrastructure are unavailable, do the following:

Build the safe adapter and configuration path, plus every test that is possible.
Describe the blocker accurately.
A mock adapter is acceptable for tests and labelled demos. It is never acceptable as a false claim that a live provider works.
1. PRODUCT IDENTITY AND BRAND RULES
Product name

The product is Farbaek. It replaces ActionGuard as the customer-facing name everywhere.

Migrate or integrate existing ActionGuard concepts and modules without needlessly breaking internal identifiers, APIs or user data.
Use compatibility migrations or aliases only where necessary.
Do not show ActionGuard branding in the UI, except in historical records where preserving the record matters.
Product line (labels inside one product, not separate apps, services, databases or codebases)
Farbaek Core — identity, organizations, projects, tasks, entitlements, policy, events and shared platform services.
Farbaek Studio — AI-assisted website and application creation, plus a professional development workspace.
Farbaek Agent — Farbaek's own coding-agent runtime and desktop companion.
Farbaek Mobile — native iOS and Android companion and on-device workspace.
Farbaek Mesh — secure, local-first device communication, project transfer and Workspace Capsules.
Farbaek RealityLoop — intent, context readiness, contracts, simulation, execution evidence, verification and outcome tracking.
Farbaek Trust — action policy enforcement, approvals, audit and evidence, permissions, incident response and governed agent execution.
Farbaek LaunchOS — approved infrastructure planning, domain workflows, deployment, verification and launch operations.

Integrate all of these into one product experience that reuses shared services.

Supplied logo asset (exact rule)

The owner has supplied the Farbaek logo as an image.

Find and use the actual supplied logo asset if it exists in the repository, uploaded assets or project assets.
Preserve its exact design, proportions, shape and brand colours.
Do not generate a replacement, recolour it, distort it or create a text approximation.
Give it appropriate sizing, clear space, light and dark surface treatment, and accessible alt text ("Farbaek").
If the image can't be found, do not pretend it was. Record the exact asset path needed (for example public/brand/farbaek-logo.svg plus a PNG fallback) and keep the <BrandLogo> component ready for it.
The design system's accent palette must complement the logo. If the logo's colours conflict with the tokens in Section 16, the logo wins and the accent tokens are adjusted. Record this in an ADR.

Do not assume the Farbaek domain, trademark, company registration or social handles are available.

Product promise

From idea to verified software — with control at every step. Supporting principle: Understand before acting. Simulate before changing. Verify after execution. Learn before repeating.

2. VISION, CUSTOMERS AND STRATEGY

Build a premium, globally usable, AI-powered platform for creating and operating software. It unifies the following:

Natural-language project planning and software creation.
A visual builder and a real professional code workspace, sharing one source of truth.
Farbaek's own provider-independent AI agent runtime.
Controlled code execution in secure environments.
Intent contracts, context readiness, scope control and evidence-backed verification.
Agent action permissions, human approvals, policy enforcement and audit history.
Secure continuity of files and projects across devices.
Optional hosting, domain, infrastructure and deployment workflows.
Clear usage limits, free access, a mandatory 14-day trial for eligible new organizations, and billing ready for subscriptions.
A distinctive premium experience that is especially strong on phones, while keeping professional desktop workflows.

Farbaek is not a chatbot, a static site generator, a file-sharing utility, an AI monitoring dashboard or a mockup builder. It connects the full lifecycle:

Idea → Context → Plan → Intent Contract → Code → Preview → Test → Security Review → Approval → Build → Verified Evidence → Controlled Deployment → Outcome Monitoring → Recovery/Learning.

Customer groups
Beginners and solo builders who need guided workflows and plain-language explanations.
Freelancers and independent developers.
AI-assisted developers who already use their preferred IDEs.
Startups and software companies.
Agencies and e-commerce businesses.
Technical teams that need repository, testing, deployment and review workflows.
Enterprise organizations that need granular permissions, governance, auditability and integration controls.

Don't make every advanced capability mandatory. Availability, onboarding, navigation, quotas and explanations should adapt to role, entitlement, enabled integrations and what is actually implemented.

Competitive landscape (researched October 2026 — keep updated in docs/research/competitors.md)
Category	Products	Verified positioning (Oct 2026)	Publicly reported pain points Farbaek can address
AI app/site builders	Lovable, Bolt.new, v0, Replit Agent, Base44	Entry paid tiers cluster around $20–$30/month. Lovable uses task-weighted credits (free tier 5 credits/day); Bolt uses tokens (1M/month free, 300K/day cap); v0 uses model-priced credits; Replit uses effort-based checkpoints 
tech-insider
superapp
	Unpredictable credit/token burn on iteration. Lovable had a BOLA flaw, reported on HackerOne on March 3, 2026, that left projects created before November 2025 exposed (source code, database credentials, AI chat histories) for about 48 days until public disclosure on April 20 (The Next Web, April 21, 2026). Bolt users report lock-in risk. Little or no built-in security verification or test evidence
AI IDEs / coding agents	Cursor, Devin Desktop (Windsurf rebranded June 2026), GitHub Copilot coding agent, Claude Code, OpenAI Codex, Devin, Google Jules, Amazon Kiro, Zed	Most individual tiers are $20/month. Kiro is spec-driven; Jules runs async PR automation with a free tier (15 tasks/day); Codex is bundled into ChatGPT plans 
davidveksler
levelop
	Strong at generating code, weak at portable proof of what changed and why; model churn (models retired from products on short notice) changes behaviour; approval and governance mostly tied to one vendor's surface
Agent governance/observability	LangSmith, Langfuse, agent runtime-policy and security vendors	Tracing, evals, guardrails	Observe more than they enforce; rarely tied to code-change contracts, test evidence and deployment
Deploy platforms	Vercel, Netlify, Render, Railway, Fly.io, DigitalOcean App Platform	Git-based deploys, previews	Deployment is separate from intent, verification evidence and spend authorization
Device transfer	LocalSend, AirDrop, Quick Share (AirDrop interoperability on Pixel 10 since Nov 2025 and on Samsung since 2026) 
Wikipedia
	Fast file transfer	They move files, not project state (tests, contracts, next steps, verification); no conflict-aware sync

Farbaek's defensible gap is the combination: intent contracts, governed execution, real tests, ProofPack evidence, recovery, cross-device workspace handoff and controlled launch, in one honest, cost-predictable product. Do not claim nobody else does any one of these.

3. EXECUTION STRATEGY — A COHERENT PLATFORM, NOT EVERYTHING AT ONCE

Do not try to launch every transport, provider, model, enterprise standard or testing technique at once. Do not reply with an architecture essay and stop.

First action: repository assessment

Write docs/architecture/current-state.md covering:

Architecture and entry points.
What works and can be reused.
Data model and authentication boundaries.
Design system and logo location.
Integrations, each marked live, mocked or incomplete.
Tests and build status.
Security gaps and blockers.
The highest-value MVP slice.
Cost drivers.
A staged sequence with acceptance criteria.

Then start implementing in the same session.

Recommended first vertical slice (default)
Sign-in and an organization-isolated workspace.
Create or import a project and inspect real files.
Describe a task and get an editable, structured Intent/Outcome Contract.
Generate a reviewable patch in an authorized workspace.
Show a real diff and keep a checkpoint.
Run the supported build and test commands inside an enforceable execution boundary, or state explicitly where isolation is not yet enforceable.
Record actual test output and generate a ProofPack.
Show verified results, unverified assumptions and next steps.
Enforce plan entitlements and the 14-day no-card trial on the server.
Show the same task status in a polished, responsive interface on both phone and desktop.

If this already exists, deepen its weakest critical parts instead of rebuilding.

Staged roadmap (details and prompts in Section 27)
Stage 0 — Audit and safety baseline: Assessment, ADRs, threat model, design tokens, test baseline, migration plan, CLAUDE.md, Claude Code hooks and permissions.
Stage 1 — Core application: Unified project/task model, authentication and organization authorization, responsive shell, onboarding, pricing catalog and entitlements, 14-day trial lifecycle, design-system foundation.
Stage 2 — Dev Studio vertical slice: Project create/import, file browser and editor, AI provider abstraction, structured plan and contract, reviewable edits, preview/build/test execution, task history.
Stage 3 — Trust and RealityLoop: Policy checks, approvals, scope drift, evidence receipts and ProofPack, deterministic verification, checkpoints and recovery, simulations in synthetic environments.
Stage 4 — Farbaek Agent desktop runtime: Independent tool loop, controlled filesystem, command broker, sandbox strategy, provider configuration, cancel/resume, desktop packaging where the environment supports it.
Stage 5 — Farbaek Mesh: Local-first workspace model, validated Capsule format, one real transfer path, integrity checking, resume and conflicts, then native transports.
Stage 6 — LaunchOS: Plan and cost preview, one real provider adapter, explicit purchase and deploy confirmation, verified deployment status, health checks.
Stage 7 — Native mobile, remote connectivity, broader integrations: iOS and Android apps, pairing, desktop handoff, more transports and providers after hardware testing.
Stage 8 — Advanced and enterprise: Expanded replay, autonomy maturity, graph analytics, SSO/SCIM, complex governance, multi-agent coordination, outcome monitoring, advanced security evaluation and enterprise deployment, only where justified.

These are priorities, not claims that features exist. Adjust the order to fit the repository, but keep the end-to-end, security-first strategy.

4. PRODUCT ARCHITECTURE — ONE SHARED CORE (MODULAR MONOLITH)

Start with a modular monolith. Don't introduce microservices unless the measured workload justifies them. Each domain gets an explicit interface (for example packages/core/<domain> or src/server/<domain>), and all domains share one authenticated organization/project/task model.

Identity and organization access — users, organizations, seats, roles, teams, sessions, devices, invitations, access reviews.
Projects and workspaces — metadata, repositories, authorized workspace roots, versions, branches, environments, files and references, settings.
AI provider gateway — server-side provider configuration, models, streaming, tool-call normalization, budgets, timeouts, errors, usage accounting, routing policy.
Agent orchestrator — task loop, tool registry, structured tool schemas, task states, checkpoints, cancellation, retry and recovery.
Policy and authorization service — deterministic decisions, scopes, action categories, permissions, entitlements, approval requirements, execution constraints.
Intent and outcome contracts — versioned goal, assumptions, acceptance criteria, allowed and forbidden changes, protected state, verification and recovery requirements.
Execution broker — sandbox and worker adapters, allowlisted operations, process management, resource limits, timeouts, network rules, logs, cleanup.
Evidence/event service — action lifecycle, task timeline, provenance, receipts, ProofPacks, audit events, redaction, retention.
Verification service — actual test and build results, postconditions, status taxonomy, integration read-back where supported, uncertainty.
Integration adapters — GitHub first; then models, repositories, deploy providers, business tools, native transport.
Mesh transfer service/library — manifests, chunks, hashes, checkpoints, Capsule validation, transfer states, conflict detection. Any cloud relay is optional and explicit.
Launch orchestrator — launch plan, estimate, customer approval, provider order and deployment lifecycle, DNS/domain, health checks, billing separation.
Entitlements and usage metering — plan catalog, subscriptions, trials, quotas, credits, usage transactions, billing provider abstraction.
Notifications — in-app first; email and webhooks only when configured and their delivery status is known.
Observability and reliability — request IDs, sanitized diagnostics, background jobs, metrics, rate limits, dead-letter and retry patterns.

Never implement the same feature separately in Studio, Agent, Mesh and LaunchOS. The shared services are the authority, and every surface calls them through typed APIs. Enforce module boundaries with lint rules (for example eslint-plugin-boundaries or dependency-cruiser [VERIFY current tools]).

5. FARBAEK CORE — PROJECTS, TASKS AND MISSION CONTROL

A clean, role-aware, responsive application shell with these top-level areas:

Home / Mission Control
Projects
Create Project
Studio
Agent Tasks
RealityLoop / Contracts
Verification / ProofPacks
Mesh / Devices
Deployments / LaunchOS
Integrations
Security / Policies
Activity / Audit
Billing / Usage
Team and Settings
Documentation / Help

Show only capabilities the user is entitled to and that are actually available. Anything unavailable gets an honest disabled state with a reason or a roadmap label, never a broken link or an empty dashboard.

Mission Control

Show actual data for:

Active project and task, current task state, and tasks awaiting approval.
Recent projects and recent ProofPacks.
Build and test status, failed verifications and unresolved risks.
Active or pending transfers.
Deployments and their health.
Usage against the plan, and the trial countdown where it applies.

Every metric has a defined source, time range and meaning, shown in a tooltip or info sheet. Sample data appears only in the labelled demo environment, which cannot reach real tools or credentials.

Onboarding and retention (expanded in Section 22)
Explain Farbaek in one sentence.
Let the user choose a goal: build a site, inspect a repository, continue a project, test changes, transfer a project or prepare a deployment.
Create, import or open a project, or start the labelled sample demo.
Explain model-provider configuration and likely usage costs before any paid model call.
Run one guided, low-risk workflow to a real, observable result.
Show what changed, what was tested and what remains unverified.
Suggest a next step based on the user's actual progress.

Retention comes from real continuing value:

resumable tasks and project memory with provenance;
recurring verification and clear history;
portable workspaces;
useful alerts and transparent usage;
fast performance.

Never use fake scarcity, manipulative countdowns, hidden fees, obstructive cancellation or misleading "unlock" messages.

6. FARBAEK STUDIO — VISUAL BUILDER AND PROFESSIONAL WORKSPACE

The visual builder and the code workspace operate on the same project and source of truth. A visual edit becomes a maintainable code change. A successful code edit refreshes the preview when the project can rebuild.

Project creation

Offer templates that match the stack actually implemented:

Business website, landing page, portfolio/blog.
E-commerce storefront prototype.
SaaS app, admin dashboard, CRM/internal tool, booking app.
REST API service.
React/Next.js project.

Templates are starting points. Before implementing, prepare an editable project proposal with:

overview, pages and components, and stack;
data model, APIs and authentication;
environment requirements and security implications;
build and test plan, and deployment target;
estimated infrastructure and model cost where available.

Ask targeted questions only when an unknown materially changes safety, architecture, budget or behaviour.

Professional workspace (use maintained components, not reinvented ones)
Files and search: file tree and project-wide search.
Code editor — decision (research-based):
Use CodeMirror 6 as the primary shared editor on web, tablet and mobile web. It supports native mobile selection and editing.
Monaco's official FAQ says it is not supported in mobile browsers. Monaco may be added as an optional desktop-only editor after an ADR, if its features (for example IntelliSense parity) justify the extra weight. Never ship Monaco to phones.
Editor features: syntax highlighting (Lezer grammars), tabs, diagnostics (lint/LSP bridge where implemented), formatting, search and replace, keyboard shortcuts, unsaved-state tracking.
Review: diff review with patch accept/reject per hunk (@codemirror/merge [VERIFY]).
History: checkpoints, version history and supported undo.
Preview: responsive live preview (desktop, tablet and mobile frames), reload, and accessible error display.
Output: console and build output, plus relevant request failures where safely observable.
Git: status and diffs; GitHub repository, branch and PR workflow once implemented.
Terminal/command console: only when backed by the controlled execution broker. Never a browser process or an unrestricted server shell.
Testing: unit, integration and E2E test runs suited to the stack.
APIs and data: API testing and documentation where implemented; a guided database and migration workspace for supported backends.
Configuration: project configuration and environment-variable names, never values.

Mobile is optimized for review, light editing, approvals, logs, task control, project selection and preview (see Section 17). Desktop exposes the full editing and terminal workflow. Never cram a desktop IDE into a phone.

AI-assisted change pipeline (every meaningful request)
Resolve the user's authorized project and current code state.
Retrieve only relevant context.
Create or update an intent contract when scope or risk merits it.
Propose a plan, listing the files likely to change.
Generate targeted edits, never a whole-project replacement.
Validate the patch and protected invariants.
Show changed files and a readable diff.
Ask for any required approvals.
Run checks through the authorized execution path.
Record actual outputs and create a ProofPack.
Summarize verified results, failures, assumptions and next steps.

Task status is decided by source state, tests and runtime evidence, never by "code was generated".

Preview and visual-editing security
Serve previews from an isolated origin (a separate registrable domain) with restrictive CSP, X-Frame-Options/frame-ancestors, and no cookies shared with the app origin.
Never expose provider secrets, privileged keys, production credentials, host files or unrestricted network access through previews.
Every visual edit maps to a reviewable diff.
If the latest source can't build, show the error. Never present a stale preview as current: label it "Last successful build at …".
Animation tooling licence note: Do not use GSAP inside Studio's visual animation-building features. GSAP's standard licence prohibits use in no-code visual animation tools that compete with Webflow. Use Motion or CSS for generated projects. [VERIFY with counsel; see Section 16.]
7. FARBAEK NATIVE AGENT — INDEPENDENT AI DEVELOPMENT RUNTIME

Farbaek owns its core agent runtime. The product must not depend on the Claude Code extension or CLI, any third-party coding extension, or a permanently open IDE. Using Claude Code to build Farbaek is a separate matter.

Farbaek may call officially supported model APIs through official SDKs (Anthropic, OpenAI, Google and others) or a provider-agnostic SDK such as the Vercel AI SDK (v6 added stable agents, tool-execution approval and MCP support; a newer major may exist [VERIFY]). 
vercel
refontelearning
 Farbaek must still implement its own orchestration, tool registry, permission engine, workspace manager, task lifecycle and evidence collection. Do not copy proprietary internals or reuse undocumented authentication or sessions. Model access needs a supported credential, gateway or local model, and its cost must be disclosed.

Runtime components
Provider adapters.
Bounded structured agent loop.
Typed tool registry with schema validation (Zod / JSON Schema).
Context manager.
Workspace filesystem adapter.
Command broker.
Sandbox adapter and capability detection.
Policy and permission enforcement.
Background task management.
Checkpoints, cancellation and recovery.
Streaming updates.
Token and cost accounting.
Event and evidence recording with secret redaction.

The model proposes; Farbaek validates and authorizes.

Built-in tools
List, search and read authorized files.
Create, edit, rename, move and delete files inside approved roots.
Diff versions and create checkpoints.
Inspect configuration and manifests.
Run approved tests, type checks, linters, formatters, builds and dev servers.
Inspect results and managed process state.
Generate and update project documentation.
Prepare Git diffs, commits and PRs, only where the repository integration exists.
Prepare deployment plans, but never purchase or deploy without separate authorization.

Canonicalize paths (realpath) and enforce real filesystem boundaries, including protection against symlink escapes and TOCTOU races. Never expose the whole host filesystem.

Permission modes
Review Only — inspect authorized files, prepare plans and patches, explain suggested commands. No file changes or project-code execution without separate authorization.
Controlled Development — automatic permitted read-only operations. File changes only inside the approved workspace and policy, with checkpoints and diffs. Approval is required for risky commands, sensitive data, network expansion, package installation, destructive changes and production operations.
Sandboxed Autopilot — iterative work, builds and tests inside an enforceable, verified isolated workspace with deterministic limits. Request authorization before crossing any boundary. If the sandbox is unavailable or can't be verified, do not claim this mode is active; reduce capability or stop.

Never use a blanket bypass flag. The following are all untrusted input and cannot override system policy:

repository instructions, READMEs, AGENTS.md/CLAUDE.md inside user projects, code comments and issue descriptions;
web pages and package scripts;
model outputs, tool outputs and MCP tool descriptions.
Execution isolation — researched sandbox options (record choice in an ADR)
Option	Isolation model (vendor-stated, Oct 2026)	Notes
E2B	Firecracker microVM, own kernel per sandbox 
developersdigest
	Pause/resume and fork; open-source SDK and self-hostable infrastructure. Per E2B's pricing docs: billed per second only while running, at $0.0504 per vCPU-hour plus $0.0162 per GiB-hour of RAM; paused and killed sandboxes are not billed
Vercel Sandbox	Firecracker microVM, dedicated kernel	Host-level egress policies (SNI domain rules, deny-all default). Per Vercel's knowledge base: Active CPU is $0.128 per vCPU-hour on Pro, plus memory at $0.0212 per GB-hour billed on wall-clock time. Good fit if hosting on Vercel
Cloudflare Sandbox/Containers	Container instance inside a microVM, own kernel	Cold starts can be 1–3 s; bills active CPU 
cadenya
beri

Modal Sandboxes	gVisor by default; VM runtime available	GPUs available
Daytona	Containers by default; VM classes available	Fastest stated cold start; core went closed-source in June 2026 — check licence 
bex
cadenya

Self-hosted	Firecracker / gVisor / rootless Docker plus seccomp	Highest ops burden; only when data residency needs it

Default recommendation: a provider-agnostic SandboxProvider interface with a microVM-class first adapter (E2B or Vercel Sandbox), a LocalDesktopRunner for the desktop companion that is labelled as not a security sandbox unless OS isolation is verified, and a MockSandbox for tests only.

Enforce these limits where technically available:

timeouts, CPU, memory, disk, process count and concurrency;
network egress, deny-by-default with allowlisted registries;
credentials: none by default, with short-lived injection when approved.

Builds must never reach production secrets or other tenants. Document exact limitations. A normal child process is not a sandbox.

Dependency setup
Detect manifests and lockfiles: Node (package.json, pnpm/npm/yarn/bun locks), Python (pyproject, requirements, uv.lock), Rust, Go, PHP, Ruby, Docker/Compose.
Produce a Setup Report listing runtimes and versions, package manager, build and test commands, env-var names, risk flags and missing configuration.
Use pinned versions and lockfiles.
Review lifecycle scripts (postinstall and similar). Run them only under authorization and isolation; default to --ignore-scripts with an explicit opt-in.
Ask before system-wide installs, privileged operations, editing shell startup files, enabling virtualization or changing system settings.
Never fabricate missing credentials.
Cancellation and recovery
Track operation states: planned, approved, queued, running, completed, failed, cancelled and interrupted.
Cancellation stops future operations and terminates managed process trees.
Never silently resume non-idempotent operations.
On restart: detect the last confirmed state, preserve source changes, restore safe checkpoints, and ask before re-running anything expensive or destructive.
8. INTENTLOCK, REALITYLOOP, CONTEXT READINESS AND OUTCOME CONTRACTS

These are shared services used by Studio, Agent, integrations, Mesh imports and LaunchOS. There is one task model, never duplicates.

Mission/Intent Compiler

Turns natural language into a structured, versioned, reviewable contract containing:

desired outcome;
authorized organization, project and resources;
allowed operations and files/modules;
forbidden operations and protected state;
preconditions and confirmed requirements;
assumptions and open questions;
acceptance criteria;
required permissions and approvals;
data-sensitivity constraints;
cost, quantity, time and retry limits;
required tests and postconditions;
recovery expectations;
human-review gates.

Example: "Update the descriptions of these 100 products, but don't change prices, stock, orders or publication state. Verify descriptions after saving."

Contracts are editable and approvable before high-impact execution. Ask for clarification only when uncertainty materially changes the result or the risk. Natural language proposes structured rules; deterministic server-side policy enforces them. Store contracts as JSON with a JSON Schema and a hash.

Context Readiness Engine and Context Passport
Collect only relevant, authorized context: repository files, docs, issues and tasks, PRs, commits, ADRs, API contracts, migrations and test results.
Record provenance for each fact: source, version or timestamp, authority, freshness, access policy and conflicts.
Classify each fact as verified-current, possibly stale, conflicting, inferred, missing or unavailable. Never silently resolve contradictions by inventing a fact.
The portable Context Passport carries: goal, source references, versions, confirmed facts, constraints, open questions, conflicts, assumptions, approvals, freshness requirements and next steps. It never carries secrets or unnecessary source text.
RealityLoop task lifecycle (typed, validated transitions, idempotent)

RECEIVED → CONTEXT_ASSEMBLED → CONTRACT_DRAFTED → CONTRACT_APPROVED → PLAN_PROPOSED → POLICY_EVALUATED → APPROVAL_PENDING (if required) → EXECUTION_AUTHORIZED → EXECUTING → VERIFYING → VERIFIED / PARTIALLY_VERIFIED / FAILED / REVIEW_REQUIRED

Alternative states: BLOCKED, REJECTED, EXPIRED, CANCELLED, INTERRUPTED, RECOVERY_PENDING, RECOVERED, REQUIRES_HUMAN_INTERVENTION.

Implement this as an explicit state machine (for example XState or a hand-written transition table) with a single transition(taskId, event, expectedVersion) function that uses optimistic concurrency.

Future-State Arena (simulation)
Compare candidate plans or policies in isolated environments.
For software: disposable worktrees or branches, deterministic fixtures, mocks, test suites, API contracts, migration checks and resource limits.
For business workflows: synthetic or sanitized data and supported dry-run APIs.
Show proposed changes, known side effects, test outcomes, cost estimates, policy violations and uncertainty.
Never replay against production.
Visually distinguish observed (actual test results), predicted (heuristic) and AI-approximated results.
Counterfactual replay

Replay sanitized historical traces against a proposed policy, contract, integration version, model version or threshold. Compare decisions, scope, failures, latency, cost and verification. Never repeat real side effects. Explain where an external system can't be reproduced faithfully.

Real-world outcome watch
Users define conditions that should stay true after a change: tests pass, APIs stay compatible, prices are unchanged, error rates stay below a threshold, a record reaches its intended state.
Record baselines, evaluation windows, threshold breaches, alerts, related changes and investigation results.
Distinguish correlation from causation. Never automatically blame the latest change or run risky remediation without approval.
Incident-to-prevention memory
After a reviewed incident, propose one or more of: a test, an acceptance criterion, a policy, a monitor, a documentation fix or a recovery procedure.
Keep the evidence link to the incident.
Require authorized human review before an enforced production rule activates.
Track whether later tests detect the failure. Never claim one test prevents a whole failure class.
9. FARBAEK TRUST — GOVERNED ACTION EXECUTION AND AGENT CONTROL

Implement Trust once, as shared backend and runtime functionality. Farbaek governs only operations that pass through its APIs, adapters, SDKs, command broker or explicitly integrated enforcement points. Never claim universal interception.

Action policy enforcement

Before any supported side-effecting operation, validate:

authenticated user or service, and organization;
agent/tool identity and delegation scope;
resource ownership and version;
the operation and its required scope;
the current permission lease and its expiry;
entitlements and quota;
the applicable policy version;
the action contract and protected invariants;
approval requirements;
risk factors and uncertainty;
idempotency and replay protection;
execution capability and the verification plan.

Outcomes: ALLOW, BLOCK, REQUIRE_APPROVAL, SIMULATE_FIRST, ALLOW_WITHIN_LIMITS, ESCALATE. Each comes with an understandable explanation backed by the actual rules that matched.

Policy engine — research-based choice (ADR required):

Embed Cedar (analysable, deterministic, has a Wasm/JS binding [VERIFY current package]) or OPA/Rego for action policies.
Use relationship-based authorization (OpenFGA or SpiceDB) only once org/team/project/resource sharing outgrows simple RBAC plus scopes.
Start with a typed TypeScript policy layer behind a PolicyEngine interface, so the engine can be swapped without touching callers.
Policy versions are immutable and hashed.
Human approvals
Approval states: pending, approved, rejected, changes-requested, expired.
Show the requested operation, affected resources, readable diff or preview, requester or agent, policy, risks, permissions, deadline and recovery options.
Bind each approval to a SHA-256 hash of the canonicalized action payload (RFC 8785 JSON canonicalization [VERIFY]) together with the contract version, policy version and resource version.
Any change to the payload, resource version, scope or material preconditions invalidates the approval.
Enforce reviewer authorization on the server.
Notification links are deep links that require an authenticated session. They are never bearer approvals.
Evidence receipts and ProofPack

Record:

action/task ID, request ID, organization and actor/agent;
approved contract, policy version, permission decision and approval evidence;
preconditions, intended change and actual result;
test and build commands with exit codes, and postcondition verification;
integration versions, failure data and recovery eligibility;
timestamp and source/commit identifiers.

Redact secrets and minimize personal data. Provide a readable receipt plus a structured JSON export and API.

Integrity format (research-based): Emit ProofPacks as in-toto attestation statements (subject = commit or artifact digests; a custom predicate type https://farbaek.dev/proofpack/v1 [placeholder URI — replace with an owned domain]). Optionally sign with Sigstore/cosign or an organization key, and hash-link successive receipts.

Explain exactly what this proves: integrity and origin under stated assumptions. It does not prove that every recorded external claim is true. Align the "build" portion with SLSA provenance concepts, but do not claim a SLSA level without an assessment.

Statuses are kept separate: attempted, executed, verified, partially_verified, unverified, failed, human_review_required. An HTTP 200 is never outcome verification.

Safe undo and compensating recovery

For supported reversible changes, capture originals, snapshots or version records beforehand. Before recovery:

Re-check the current version and state.
Detect intervening changes.
Preview the recovery and its side effects.
Re-check authorization and entitlement.
Obtain the required approval.
Execute idempotently.
Verify the final state and record evidence.

Support partial recovery and compensating actions. Sent emails, completed payments, irreversible external actions and permanently removed data may not be fully reversible. Never overwrite newer legitimate changes without resolving the conflict, and never report success before the backend confirms it.

Risk explanations and independent verification
Assess observable factors: sensitivity, scope or record count, permissions, external visibility, reversibility, financial impact, policy violations, unusual retries and dependencies.
Explain the contributing factors and the uncertainty.
Heuristic scores are not validated probabilities. They supplement deterministic controls and never replace them.
For selected high-impact tasks, a second-checker model may review intent alignment, constraints, tools, evidence and uncertainty. Agreement between models is not proof. Deterministic assertions and real tests take precedence, and mandatory gates can never be bypassed by model confidence.
Permission leases and autonomy limits
Leases are least-privilege, scoped, expiring and revocable, with history and periodic access review.
Revocation stops subsequent actions as fast as the architecture allows. It cannot undo already-committed external operations.
Budgets cover: evaluations, actions per hour, affected-record count, measurable API and model spend, retries, duration, concurrency, and network and tool scopes.
Accounting is done on the backend with deterministic reset boundaries. Estimates are labelled.
Autonomy maturity (never grants sensitive permissions by itself)
Level 0 — Observe: inspect and report.
Level 1 — Propose: prepare plans and patches for approval.
Level 2 — Bounded execution: execute preapproved low-risk operations within strict limits.
Level 3 — Verified workflow: execute a wider but explicit set of operations under continuous checks and limits.
Level 4 — Governed orchestration: complex approved workflows with intervention requirements and enterprise governance.

Organizations configure, for each level, the eligible action categories, scopes, spend ceilings and required approvals. Autonomy is automatically reduced, or affected categories suspended, after serious failures or credential concerns, with an explanation and a change-log entry.

Policy Builder, Shadow Mode and goal drift
Policy Builder: natural language → structured draft → explained interpretation → ambiguities and conflicts flagged → examples → tests against sample events → confirmation → versioned activation. Natural language never becomes authoritative enforcement directly.
Shadow mode: record what the agent proposes and what policy would decide, with no supported side effects. Observed, proposed and simulated events are clearly distinguished from real executions.
Goal drift: compare actual and proposed operations against the approved goal, protected state, scope, expected action patterns and retry limits. Use deterministic checks first and AI classification only as an extra signal. Always explain why something was flagged.
Prompt-injection and untrusted-content defence

Treat all of these as untrusted data: web pages, emails, repository files, tool output, API responses, imported code, and third-party and MCP tool descriptions. Defences:

Separate instructions from content.
Restrict the tools available per task.
Validate operations against explicit policies.
Protect secrets and limit egress.
Enforce tenant isolation.
Require approval for sensitive actions.
Record policy events and fail safely.

Never rely on a model to detect injection, and never claim perfect detection.

MCP specifics: The Model Context Protocol finalized a stateless 2026-07-28 revision; the previous 2025-11-25 revision added Client ID Metadata Documents, incremental scope consent and enterprise-managed authorization. If Farbaek consumes or exposes MCP servers:

Implement the current authorization spec [VERIFY revision].
Pin tool definitions by hash, alert when a description changes (tool-poisoning defence), and require re-approval.
Never pass user tokens through to downstream servers.
Multi-agent coordination and trust graph
Register agents, tools, providers, capability manifests, versions, issuers, scopes, credential expiry, provenance, delegation relationships and revocation status.
A delegated agent can never exceed its delegator's authority. All inherited scopes are enforced on the server.
Build a searchable, permission-filtered 2D graph linking people, organizations, agents, tools, integrations, capabilities, policies, resources, tasks, actions, approvals, incidents, deployments and evidence.
Support authorized queries such as "Which agents can change prices?" and "What depends on this integration?"
Label inferred or unknown edges. Never expose another tenant's nodes or edges.
Add 3D exploration only if it materially improves a real workflow. The default is a 2D view (for example React Flow or Cytoscape.js [VERIFY]).
Incident response and cascade containment
Centralize incidents: timeline, affected agents, resources and integrations, related evidence, notes, severity, remediation and outcome.
Containment tools: an emergency pause for eligible future actions, scoped revocation, retry suppression, escalation and safe recovery planning.
Map downstream dependencies and label any estimated or unknown blast radius. Avoid disabling unrelated customers or workflows.
State clearly that a pause can't undo actions already committed elsewhere.
Data egress policies and trusted tool registry
Egress: for supported egress points, inspect destinations and data classifications, minimize or redact, require approval for restricted transfers, block prohibited destinations and record sanitized evidence. Never claim control over integrations that bypass Farbaek.
Registry entries: maintainer, version, capability manifest, permissions, dependencies and verified advisories, latest evaluation, enforcement compatibility, data handling, and permitted and restricted uses.
Never invent certifications or reputation. External descriptions are untrusted.
Security evaluation suite (mapped to current OWASP lists)

Build authorized, isolated, versioned adversarial and regression scenarios mapped to:

OWASP Top 10 for LLM Applications 2025 (LLM01 Prompt Injection through LLM10 Unbounded Consumption [VERIFY exact titles]).
OWASP Top 10 for Agentic Applications 2026:
ASI01 Agent Goal Hijack
ASI02 Tool Misuse & Exploitation
ASI03 Identity & Privilege Abuse
ASI04 Agentic Supply Chain Vulnerabilities
ASI05 Unexpected Code Execution
ASI06 Memory & Context Poisoning
ASI07 Insecure Inter-Agent Communication
ASI08 Cascading Failures
ASI09 Human-Agent Trust Exploitation
ASI10 Rogue Agents

The scenarios must cover prompt injection, untrusted tool output, privilege escalation, exfiltration, compromised integrations, poisoned context, unauthorized delegation, replayed or duplicated side effects, cross-tenant access, excessive usage, agent conflicts and false success claims.

Use deterministic assertions for permission and data boundaries. AI may categorize findings but never replaces tests. Report coverage per ASI/LLM ID and its limitations. Never imply complete coverage or certification.

10. FARBAEK DEV INTELLIGENCE — INTENT-TO-PROOF DEVELOPMENT
IntentLock for code

For meaningful tasks, record:

expected outcome and acceptance criteria;
allowed files and modules, and protected files and behaviours;
API and database compatibility requirements;
security invariants;
required tests, approval conditions and excluded changes.

Compare the real diff with the contract and flag unexplained scope expansion. Enforce inside the execution environment, in Git/CI gates (a GitHub status check), and in server policies. Never suggest that browser-only inspection prevents every unauthorized edit.

ProofPack (developer view)

Include:

repository, commit and working-tree hash;
task and contract IDs, and changed files;
tests actually run, with commands and exit codes;
type-check, lint and build results;
static, dependency and secret findings: Semgrep (SAST), OSV-Scanner (dependencies), gitleaks and/or TruffleHog (secrets) [VERIFY current CLIs];
compatibility checks, unresolved failures, verification limits and recovery recommendations.

Distinguish the states: generated, reviewed, built, tested, verified, deployed and production-observed.

Failure Futures Lab

Suggest and run controlled failure scenarios derived from the actual diff, architecture, contracts, tests and sanitized incidents. Priorities:

duplicate or out-of-order webhooks (Dodo explicitly documents both);
timeouts, rate limits and concurrency;
partial DB failure, expired credentials and permission denial;
malformed or empty input and timezone boundaries;
retry loops and incompatible APIs;
missing configuration, and deploy or rollback failure.

Run only in isolated environments with time and resource limits. Label hypothetical concerns separately from reproduced failures.

Test integrity

Where justified, run mutation testing (StrykerJS for TS/JS, mutmut or cosmic-ray for Python [VERIFY]) or constrained fault injection in disposable environments. Record detected and undetected mutants, the associated tests, compute time and limitations. Mutation score is not overall quality.

Architecture Why-Graph

Connect confirmed facts from ADRs, docs, commits, issues, PRs, API contracts, migrations, tests and incidents. Cite sources, mark inferences as inferred, and let users correct stale knowledge. Never invent historical reasoning.

Reversibility Radar

Classify schema and data changes, public APIs, destructive operations, dependency swaps, configuration and integrations as:

rollback-supported
requires backup
forward-fix required
compensating action available
reversibility unknown

Always state the basis and the limits. Never run destructive recovery without authorization.

Developer Cost Brain
Track actual AI tokens and cost where providers report them, retry and repair cycles, CI and test time, and sandbox cost (note that pricing models differ: wall-clock vs active-CPU).
Label estimates.
Route among configured providers only within explicit privacy, capability, budget and security rules.
Never silently switch providers if that would move source code to a new service.
Operating modes
Learn: explain concepts, decisions and trade-offs.
Pair: collaborate through incremental, reviewable changes.
Build: implement approved contracts within their constraints.
Audit: inspect and report with no project modifications.

Store preferences as explicit, reviewable settings. Never infer sensitive traits or invent prior decisions.

11. FARBAEK MESH — LOCAL-FIRST CROSS-DEVICE WORKSPACE

Mesh is local-first: no default cloud file storage.

Workspace Capsules

A Capsule may contain:

selected files and folders, with their structure;
a manifest with BLAKE3 hashes per file and chunk, and version identifiers;
allowed configuration and a source-control change summary;
approved editor and task state;
a task summary and next steps;
selected verification results (ProofPack references).

Every component is optional and inspectable before sending or importing.

Excluded by default:

.env* files, keys, tokens and passwords;
private certificates and credentials;
caches, build artifacts and dependencies such as node_modules.

Exclusion uses deterministic patterns plus a secret scanner (gitleaks rules). Users can override with warnings. Detection is not guaranteed, and the UI says so.

The receiver:

inspects the contents and chooses a destination;
validates paths and content;
never auto-executes scripts, installs dependencies or starts builds.

Validation rejects:

path traversal and symlink escape;
archive bombs (ratio and size caps);
duplicate or case-colliding paths (Unicode NFC normalization);
malformed manifests;
oversized files and unexpected file types.
Transfer protocol

Typed objects:

DeviceIdentity, DeviceCapabilities, TrustedDevice, TransportCapability;
TransferSession, Manifest, FileEntry, Chunk, Checkpoint;
Capsule, WorkspaceVersion, Conflict, SecurityFinding, TransferEvent.

Mechanics:

Unique session IDs, explicit states and manifest validation.
Chunked large-file streaming (for example 4 MiB chunks), with per-chunk BLAKE3 and a whole-file hash.
Actual byte progress, resume checkpoints, retry and cancellation.
Storage-quota checks and backpressure.
Conflict detection and post-transfer verification.
Never buffer whole large files.
Preserve originals unless the user explicitly asks for a safe move.

Success is reported only after the receiver verifies the content.

Connectivity modes
Nearby Direct: discovery starts only when the user initiates it and grants permissions. Both devices pair, then use a supported high-throughput transport. BLE may assist discovery but is not assumed to be the bulk channel.
Direct Remote: P2P (WebRTC data channels or QUIC-based options such as iroh [VERIFY maturity]), with signaling separated from data. Explain how NAT, firewalls and platform limits can block it.
Optional Secure Relay: only with explicit consent. Content is end-to-end encrypted so the relay can't read it, metadata is minimized, and there are expiry and resource limits. Never upload silently when a direct transfer fails.
Offline receiver: explain that immediate delivery is impossible and offer a local queue.
Transport reality matrix (research-based; hardware-test before claiming support)
Path	Android↔Android	iOS↔iOS	iOS↔Android	Desktop↔Phone	Notes
Same-LAN TCP/QUIC with mDNS/Bonjour (LocalSend-style)	Yes	Yes	Yes	Yes	Recommended first path. iOS 14+ needs NSLocalNetworkUsageDescription and an NSBonjourServices entry (_farbaek._tcp); local network is blocked until the user grants permission. Fails on client-isolated Wi-Fi
Google Nearby Connections	Yes	Yes (Swift library)	Not documented — test	Limited	Google says it is available on Android and iOS, but its guides don't state which channels the two platforms share
Apple MultipeerConnectivity	—	Yes	No	Mac only	Apple-only
Wi-Fi Aware	Yes (Android 8.0+, hardware-dependent)	iOS 26 framework	Possible in principle; developers report pairing issues [VERIFY with devices] 
apple
Wikipedia
	Varies	Stage 7 research spike
WebRTC data channel	Yes	Yes	Yes	Yes	Needs signaling and a TURN fallback (which is a relay → requires consent)
Optional E2EE relay	Yes	Yes	Yes	Yes	Consent required, encrypted content, expiry

Implement one proven end-to-end path first: LAN transfer between the desktop companion and the mobile app or another desktop. Never mark a native adapter complete when only its interface exists, and always show real capabilities.

Mobile background constraints:

iOS: transfers continue only within the system's background limits. Show "keep Farbaek open" guidance.
Android 14+ (API 34+): a foreground service must declare a foregroundServiceType (for example dataSync) and the matching FOREGROUND_SERVICE_* permission, otherwise startForeground() throws. Play Console requires the declaration too.
Device identity and trust
Pairing: user-approved pairing sessions that expire after 2–5 minutes.
Key exchange: a PAKE such as SPAKE2 or CPace derives the key from a short code or QR secret, or a Noise handshake (XX/IK pattern) with out-of-band key confirmation [VERIFY library maturity].
Primitives: use established libraries only (libsodium / Noise implementations). Never invent cryptography.
Tokens and replay: short-lived scoped tokens, mutual authentication, encrypted transport and replay protection (nonces and counters).
User control: explicit acceptance of each incoming transfer, plus revocation.
Key storage: OS-backed secure storage (Keychain/Secure Enclave, Android Keystore, OS credential vaults on desktop).
QR rule: QR codes never contain private keys or durable unrestricted tokens.
Sync and conflict resolution
Use verified common baselines (manifest hashes), then send only changed files.
Detect concurrent changes and offer compare / keep both / reviewed merge. Never overwrite silently.
Resume only where versions and hashes make it safe.
AI task handoff restores explicit files, supported editor state, a context summary, tests and next steps, never a model's hidden internal state.
12. FARBAEK LAUNCHOS — CONTROLLED DEPLOYMENT AND INFRASTRUCTURE

Launch is a separately authorized workflow, never a side effect of code generation.

Launch Planner

Identify:

framework and runtime, and build and start commands;
dependencies and env-var names;
static vs server hosting, and database and storage needs;
workload assumptions and domain/DNS requirements;
security issues and provider compatibility;
likely charges, and the deploy and verify plan.

Recommend the simplest compatible service; not every project needs a VPS. Compare providers only from current, verifiable source data, keeping listed, introductory and renewal prices, taxes and variable estimates separate.

Provider adapters

Use provider-independent interfaces for:

domain availability, registration and renewal;
DNS and hosting discovery;
VPS or app provisioning and deployment;
SSL readiness, logs, health checks and backups;
billing information, resource usage and cleanup.

Candidates include Vercel, Netlify, Render, Railway, Fly.io, DigitalOcean App Platform, Hostinger and domain resellers. They are candidates only, never assumed to be connected. Verify the official APIs, eligibility, terms, scopes, order lifecycle, regions and pricing first. Never invent an endpoint.

Support customer-owned accounts first, with credentials in a secrets system.
Never ask for a provider's main account password.
Use least privilege and document revocation steps.
Use a reseller model only with explicit contractual permission; an affiliate link is not reseller permission.
Explicit purchase/deploy authorization

Before any paid purchase, registration, upgrade or billable provisioning, show:

provider and product, and the exact amount due now;
the billing interval, renewal terms and cost;
variable charges, and taxes and fees when known;
alternatives and cancellation details;
the selected project and domain.

Then require explicit confirmation. "Launch this" is not unlimited spending authority. Use idempotency keys and durable order states, and never repeat non-idempotent purchases after a timeout. A redirect is not proof of success; verify through the provider's API or webhook.

Deployment lifecycle

Validate configuration → run authorized tests, build and security checks → validate env-var presence (never values) → verify approval and spend budget → create or identify resources → deploy the approved artifact or revision → configure authorized DNS and SSL → wait for real certificate status → run HTTP, health and smoke checks → record provider-confirmed status → show the actual URL, logs and rollback options.

Support async transitions, timeouts, scoped retries, idempotency, rollback where supported, and partial-failure recovery. Never delete existing production resources because a deploy failed. Never claim zero downtime, backups, SSL readiness or rollback unless they are actually supported.

Domain ownership
Preserve the customer's registrant information.
Explain ownership, DNS access, renewal, transfer, recovery and cancellation.
Never silently register a domain or change production DNS.
Require fresh approval for: domain transfer, destructive DNS changes, resource deletion, billing-changing upgrades and production cutovers.
13. NATIVE DESKTOP AND MOBILE APPLICATIONS

These need platform-specific engineering and real-device validation. A responsive web app is not a native app.

Desktop (ADR required: Tauri 2 vs Electron)
Default recommendation: Tauri 2. It has a smaller footprint, a Rust core suited to the command broker, filesystem boundary and Mesh transport, a capability-based permission model, and an updater plugin with signature verification [VERIFY current docs].
Fallback: Choose Electron if the repository or team needs Node-native modules or full Chromium parity.
Capabilities:
local project access under explicit permissions, Agent task execution, the integrated editor, a managed terminal and Git diffs;
builds and tests, approvals, task progress, checkpoints and recovery;
model settings, diagnostics and secure pairing.
Signing: macOS Developer ID signing plus notarization, Windows Authenticode, and signed Linux artifacts (AppImage/deb/rpm) with a signed update feed.
Installs: no curl | bash or irm | iex defaults, and no silent elevation.
If installers can't be built in this environment, document the exact remaining steps and never claim the artifacts exist.
Mobile iOS and Android
Recommended: Expo (React Native) on the New Architecture. Expo SDK 55 dropped the Legacy Architecture; use the current SDK [VERIFY latest — docs reference SDK 56/57].
Native modules: use Expo Modules for the file system, Keychain/Keystore, local networking (Bonjour/NSD) and future Wi-Fi Aware or Nearby work.
Shared code: share TypeScript domain types and the API client with the web app through a workspace package.
Required capabilities:
local workspace management and native file pick/export;
source editing with syntax highlighting and diffs (CodeMirror 6 in a WebView or a native viewer, decided by ADR);
project and task views, AI-assisted patch creation, and checkpoints and recovery;
Mesh and trusted devices;
approval review and authorized push notifications (APNs/FCM via Expo Notifications [VERIFY]);
a clear indicator of where work runs: on device / paired desktop / remote sandbox.
Respect iOS background limits and Android foreground-service type rules.
Never claim a phone runs a full desktop build. Route heavy work to the paired desktop or an authorized remote sandbox, and show which device will run it before approval.
Mobile-to-desktop workflow (priority)

Create or import a project on the phone → edit with Farbaek Agent → inspect and approve the patch → create a Workspace Capsule → pair with the desktop (expiring, authenticated) → transfer and verify → run the desktop build and tests on the actual paired machine → return the verified changes and ProofPack → continue on the phone.

Prefer outbound desktop connections or authenticated LAN sessions. Never require arbitrary inbound firewall openings.
Never expose unauthenticated localhost HTTP commands to websites. Use origin checks plus per-session tokens, or avoid localhost HTTP entirely.
Validate device identity, user session, project access, operation scope, expiry and revocation.
Require fresh approval for sensitive or destructive operations and for deployment.
Pairing and revocation
QR or short code with mutual authentication.
Least-privilege scopes, replay protection and encrypted channels.
Approval on both ends, and immediate revocation from either device or the web.
A biometric check (Face ID / fingerprint) may supplement server authorization but never replaces it.
14. AI PROVIDER, CONTEXT AND DATA PRIVACY
Provider independence
Build a ModelProvider adapter that covers hosted APIs, organization gateways and local models.
Normalize streaming, tool calls, structured outputs and schema constraints, errors, rate limits, timeouts, context windows, cost and usage, and model metadata.
Use provider features through adapters when available: tool use, structured outputs, prompt caching, streaming [VERIFY per provider].
Choose providers by explicit policy, capability, context size, latency, customer preference and budget.
Model churn: record the model ID and version on every task, and alert when a provider deprecates a model in use (see the innovation "Model Change Canary").
Never silently switch providers if that sends code to a new third party.
Keep credentials server-side or in OS credential storage. Never put them in the browser, previews, logs, generated code or prompts.
Context management
Retrieve relevant files and sections, never the whole repository by default.
Apply token budgets, source references, freshness indicators, redaction, project boundaries and ACL filters.
Show which sources informed an answer.
Separate sourced facts from inference.
Never invent repository state, tests or history.
AI credits and costs
Track provider-reported usage and label estimates.
Bound input and output tokens, tool loops, retries, concurrency and time.
Define each credit-consuming operation in config/credits.ts and in the docs.
Balances never go negative unless an explicitly authorized billing mode allows it.
Explain that bring-your-own-key usage incurs direct provider charges.
Privacy defaults
Never collect hidden chain-of-thought.
Record only operationally necessary inputs, references, tool calls, decisions, outputs and evidence, redacted and authorized.
Product telemetry excludes source code, filenames, task context and transfer contents by default.
Provide retention, deletion and export controls, and disclose provider data processing.
15. SUBSCRIPTIONS, PRICING, 14-DAY TRIAL — PRODUCT RULES

Build a real, server-enforced subscription and entitlement system. Do not create a second billing system if one exists. A centralized, versioned plan catalog (database plus a typed config seed) drives the marketing site, checkout, dashboard, backend authorization, quotas and upgrade UI.

Dodo Payments will be connected later. Build the provider abstraction and the Dodo adapter boundary now (Section 23), but:

don't hardcode live checkout or claim Dodo is connected;
don't invent provider events or fake payment success;
verify current documentation and the business's eligibility before activating.

Until then, run in a clearly labelled billing_mode = "not_connected" (or "test"). Paid entitlements activate only after a trusted, verified provider state, or through an audited admin process meant for development, never after a frontend redirect.

Plan catalog (owner defaults — editable configuration, versioned)
	Free	Developer	Team	Business	Enterprise
Monthly price	$0	$19/mo	$79/mo	$249/mo	Custom
Annual price (charged upfront)	—	$180/yr (= $15/mo equiv.; saves $48 vs monthly)	$756/yr (= $63/mo equiv.; saves $192)	$2,388/yr (= $199/mo equiv.; saves $600)	Contract
Workspaces	1	1	per config	per config	Contract
Seats	1	1	up to 5	up to 20	Contract
Registered agents	up to 2	up to 5	up to 20	up to 100	Contract
Governed action evaluations / month	2,000	25,000	100,000	500,000	Contract
Activity history	7 days	30 days	90 days	365 days	Custom retention (only if implemented)
Integrations	1	3	5	10	Contract
AI assistance credits / month	20	100	500	2,500	Contract
Features	Basic policies, action receipts, community support	+ Developer API/SDK access, usage alerts, basic simulations	+ Advanced approval workflows, policy builder, shadow mode, basic replay and supported recovery, team collaboration	+ Advanced RBAC, incident response tools, advanced autonomy policies, impact analysis, evidence exports, priority support only per a real published support policy	SSO/SAML, SCIM, custom retention, SLA, dedicated support, private deployment, data residency, custom integrations — advertise only if implemented and operationally supported

Annual pricing rules:

Totals and discounts must be mathematically consistent: $19×12 = $228, $79×12 = $948, $249×12 = $2,988. A unit test enforces this.
"Monthly equivalent" must never hide that the annual amount is charged in advance.
Show the currency, and taxes and fees when known. Dodo acts as Merchant of Record and calculates tax at checkout, so show "plus applicable tax, calculated at checkout" [VERIFY].
Never imply unlimited usage.
Mandatory 14-day no-card trial

Every eligible new organization gets one 14-calendar-day Team-level trial after email verification and organization creation. No card is required. Use server timestamps (UTC) with a documented boundary policy: the trial ends at trial_started_at + 14 days, and the expiry is shown in the user's local time.

Trial entitlements:

Team features, with these caps:
max 5 agents, 3 seats, 3 integrations;
10,000 governed action evaluations for the trial;
30-day activity history;
100 AI credits total.
A visible start date, expiry date and countdown.

Lifecycle:

Verification plus organization creation starts exactly one eligible trial, enforced by a unique constraint.
The trial is persisted and auditable.
The user may upgrade to a paid plan with explicit informed consent, or switch to Free early.
An unconverted trial automatically becomes Free at expiry. There is no automatic charge.
Paid service begins only after explicit confirmation and a trusted billing status.
Repeat trials are blocked with proportionate checks: verified email domain plus account history, rate limits and abuse heuristics. No invasive device fingerprinting.
On downgrade, preserve data and offer a resolution flow for over-quota resources. Never silently terminate agents or integrations, or delete data.
Implementation rule (research-based): The Farbaek trial is internal and must not be implemented with Dodo trial_period_days. Dodo's trial products take a $0 mandate payment, which conflicts with "no card".

Reminders: day 7, day 12, day 13 and at expiry.

Send them via scheduled jobs (Section 24), in-app always and by email only when the mail provider is configured.
Record delivery status from the provider. Never claim an email was delivered without confirmation.
The trial clock never runs in the client.
Entitlement enforcement

Every decision is authoritative on the server, for:

API routes, project and agent creation, integrations and evaluation requests;
AI credits, simulation and replay, recovery and exports;
retention, collaboration and execution minutes;
deployments and administration.

Return typed errors (QUOTA_EXCEEDED, FEATURE_NOT_IN_PLAN, TRIAL_CAP_REACHED, BILLING_SUSPENDED) with upgrade guidance, and define the behaviour at every limit.

At 100% of quota, new governed execution is blocked, but these stay available:

audit history and project exports;
billing;
emergency pause and permission revocation.

The entitlement service fails closed for protected actions. There are no undisclosed overages; paid overages stay disabled until they are explicitly priced, configured and consented to.

Usage definitions
One governed action evaluation = one unique authenticated action request entering policy evaluation.
A BLOCK outcome counts.
A failed authentication doesn't count.
Idempotent replays and retries count once, enforced by a unique key (org_id, idempotency_key).
Meter per organization, period, agent, integration, feature and outcome, inside transactions.
Show quota, usage, remaining allowance, percentage, reset date, history and AI credits, with alerts at 80% and 100%.
Monthly periods are anchored to the subscription start (or the calendar month on Free), with consistent UTC rules.
Billing dashboard, states and lifecycle

The dashboard shows:

plan, trial state and countdown, and billing interval;
current and next amount (when known), usage and AI credits;
provider-backed invoices and receipts, and payment state;
tax and amount details when known;
cancellation status and date, and billing contact;
over-quota resources and upgrade/downgrade choices.

Internal states: free, trialing, checkout_pending, active, past_due, cancellation_scheduled, suspended, expired. The mapping to Dodo is in Section 23.

Rules:

Process only verified, idempotent webhooks (signatures, replay protection, event IDs).
Never trust redirects.
Cancellation must not be made difficult (Section 22).
Preserve access through the paid-through period.
Payment failure never disables emergency pause or essential security controls.
On downgrade:
enforce the new quotas for new actions and resources only;
identify over-limit resources and offer select, export or resolve flows;
keep old records under the disclosed retention rules;
never delete data immediately on expiry.
Billing data model

Inspect the schema first, then reuse or add:

plans, plan_versions, entitlements;
subscription_accounts, trials, billing_customers (provider customer IDs);
usage_counters and usage_transactions, ai_credit_ledger;
invoices (references only), provider_webhook_events, subscription_changes, cancellations, notifications.

Use foreign keys, unique constraints, indexes, transactions and tenant scoping. Store the currency, interval, plan version, effective dates and provider IDs explicitly. Never store card data.

16. DESIGN SYSTEM & EXPERIENCE SPECIFICATION — "PROOF ATELIER"

Farbaek must look exceptional because it is useful. Use Shopify's commercial polish (Polaris principles: clear hierarchy, merchant-first copy, consistent tokens, generous whitespace, predictable patterns) and mature developer tools as the quality bar. Never copy anyone's assets, branding or distinctive layouts.

16.1 Signature aesthetic concept: Proof Atelier

A luxury atelier where software is tailored, measured and certified. The interface feels like the white-gloved workroom of a precision maker: porcelain surfaces, hairline rules, engraved typography, and a single luminous Proof Thread that stitches each stage of the work together.

Signature element — the Proof Thread:
A 1.5px line runs vertically on mobile and horizontally on desktop through the task timeline: Intent → Code → Test → Approval → Proof → Launch.
Segments are solid when verified, dashed when unverified, amber when awaiting approval and red-notched when failed.
It advances only in response to real lifecycle events from the server. It is the single place where Farbaek allows a "luminous" accent.
The Seal: Verified ProofPacks get an engraved, guilloche-patterned seal: an SVG rosette generated from the ProofPack hash, so every seal is unique and genuinely derived from the evidence. It is decorative but meaningful (it includes the short hash), never awarded to unverified work.
Ledger lines: Evidence and diff views use faint ruled lines and tabular numerals, like a fine accounting ledger.
Coding motifs (used sparingly):
monospace eyebrow labels (// contract v3);
caret-blink focus only on the prompt field;
real hash fragments as texture in empty states;
syntax-coloured diff gutters.
Never: matrix rain, fake terminal typing, generic purple gradients, neon glows on everything, random glass cards, or over-rounded "AI dashboard" defaults.
16.2 Colour tokens (CSS variables in Tailwind v4 @theme; values are starting points — compute contrast in CI with an automated checker and adjust; adapt accents to the real logo)

Light — "Porcelain"

Token	Hex	Use
--bg	
#FAFAF7	App background (warm porcelain)
--surface	
#FFFFFF	Cards, sheets
--surface-sunken	
#F3F2EE	Wells, code background
--border-hairline	
#E6E4DE	1px rules
--border-strong	
#CFCCC4	Inputs, focus-adjacent
--text	
#17181B	Primary text (target ≥ 15:1 on bg)
--text-secondary	
#55585F	Secondary text (target ≥ 7:1)
--text-tertiary	
#7A7D84	Meta only, at sizes of 14px or more (target ≥ 4.5:1)
--accent	
#3F3BD1	"Ink indigo" — primary actions, links
--accent-2	
#0B7285	"Signal cyan" — Mesh and live activity
--thread	#3F3BD1 → #0B7285	Proof Thread gradient (the only gradient)
--seal	
#A5844E	Champagne — Seal artwork only, never text

Dark — "Obsidian"

Token	Hex
--bg	
#0A0B0D
--surface	
#121317
--surface-raised	
#1A1C21
--surface-sunken	
#07080A
--border-hairline	
#25272E
--border-strong	
#3A3D46
--text	
#EDEDEA
--text-secondary	
#A3A5AD
--accent	
#8E8BFF
--accent-2	
#4CC9DC
--seal	
#C9A86A

Semantic status (light / dark) — all text-on-surface pairs ≥ 4.5:1 and UI glyphs ≥ 3:1:

verified 
#18794E / 
#4ADE80
approval 
#A35200 / 
#FBBF24
failed 
#B42318 / 
#F97066
info 
#1F4FD6 / 
#93B4FF
unverified 
#6B6E76 / 
#8B8E96 (always paired with a dashed pattern)
simulated 
#6941C6 / 
#B692F6 (always paired with a "SIM" badge)

Colour is never the only signal. Every status also has an icon, a label and a pattern.

Glass rule: use backdrop blur only on floating layers above busy content (the command palette, mobile bottom sheet header, toasts), at 12–20px blur with ≥ 88% surface opacity so text contrast holds. Never use glass on cards in lists.

16.3 Typography (open licences — verify each font's licence file before shipping)
Display and UI: Instrument Sans (variable, SIL OFL), with tight tracking on display sizes (−0.02em).
Editorial accent: Instrument Serif (SIL OFL), italic only, for rare luxury moments: hero emphasis words and Seal captions. Never in the app chrome.
Code and data: JetBrains Mono (SIL OFL) with ligatures off by default (a user setting), and tabular numerals for metrics.
Alternates if the design review rejects these: Hanken Grotesk + Fraunces + Commit Mono (all OFL [VERIFY]). Avoid defaulting to Inter/Roboto/system-only stacks for brand surfaces.
Self-host with next/font/local, subset the files, use font-display: swap, and preload only the display weight.
Type scale (rem; fluid with clamp() on marketing):
Display 2: 4.5 / 4.0 / 3.0 (desktop/tablet/mobile)
Display 1: 3.25 / 2.75 / 2.25
H1 2.25, H2 1.75, H3 1.375, H4 1.125
Body-L 1.125, Body 1.0 (16px minimum on mobile inputs to avoid iOS zoom)
Small 0.875, Micro 0.75 (labels only)
Mono 0.875
Line-height: 1.1 for display, 1.5 for body, 1.6 for code.
Measure: 60–72 characters for prose.
16.4 Spacing, radii, elevation, borders
Spacing: a 4px base. Scale: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128.
Radii:
xs 4 (chips), sm 6 (inputs), md 10 (cards), lg 16 (sheets and modals), xl 24 (marketing panels only);
avatars use full;
no pill buttons except the segmented control.
Elevation: prefer borders over shadows.
e1: hairline plus 0 1px 2px rgb(0 0 0 / .04).
e2: 0 8px 24px -12px rgb(16 17 20 / .18).
e3 (overlays): 0 24px 64px -24px rgb(16 17 20 / .28).
In dark mode, elevation uses lighter surfaces, not shadows.
Borders: 1px hairline by default; 1.5px focus ring offset by 2px in --accent (contrast ≥ 3:1 against adjacent colours, per WCAG 2.2 focus appearance guidance).
16.5 Motion system (Motion for React as the app library; CSS View Transitions and scroll-driven animations as progressive enhancement; GSAP only on marketing pages — see the licence note)
Durations:
instant 80ms (press feedback)
quick 140ms (hover, toggles)
base 220ms (popovers, tabs)
considered 360ms (sheets, page transitions)
cinematic 600–900ms (marketing hero only)
Easings:
standard cubic-bezier(.2,0,0,1)
enter cubic-bezier(0,0,0,1)
exit cubic-bezier(.4,0,1,1)
spring for sheets (stiffness 420, damping 40 [tune])
Choreography:
One primary motion per interaction.
Stagger lists by 24ms (max 8 items).
Exits run 30% faster than entries.
Nothing animates on its own unless it represents live state.
State-driven motion (honest motion):
The Proof Thread advances on server events.
The transfer ring reflects actual bytes.
Build logs stream in real time.
Approval cards "settle" only after the server acknowledges.
Never animate fake scanning, fake progress or indeterminate shimmer for more than 10s without a status message.
Reduced motion (prefers-reduced-motion):
replace movement with opacity and colour changes;
turn off parallax, 3D camera motion and autoplay video (show posters);
the Proof Thread updates without movement.
A user setting overrides the OS preference in both directions.
View Transitions: use the View Transitions API for route and shared-element transitions where supported, with an instant fallback [VERIFY current cross-browser support]. CSS scroll-driven animations are marketing-only progressive enhancement.
16.6 3D system
Brand scene, "The Loom": an interactive network in which nodes are Intent, Files, Tests, Approvals, Proof, Deploy, connected by threads that tighten as evidence accumulates.
On the marketing home it is a looped concept animation, labelled "Illustrative".
In-app (optional, Stage 8), the same visual language can render a real project's intent-to-proof graph, built from actual task data, but only after the 2D view exists and only if usability testing shows value.
Implementation:
React Three Fiber v9 with WebGLRenderer by default. WebGPURenderer is opt-in behind a flag, since Drei Text and @react-three/postprocessing don't work with it [VERIFY].
Use instanced meshes and baked lighting, keep draw calls under 60, and keep the scene under 400 KB gzipped.
Lazy-load via dynamic import after LCP and user idle.
Pause when off-screen (IntersectionObserver) and when the tab is hidden.
Budgets: in the mobile tier, DPR is capped at 1.5, the scene runs at 30fps, there is no post-processing and particle count is reduced. Detect low power through device memory and hardware concurrency, measured frame time and Save-Data.
Fallbacks: a static AVIF/WebP poster of the same composition renders first, and stays if WebGL fails, reduced motion is on, Save-Data is set or the device is in the low tier. Interactive nodes have keyboard-focusable 2D equivalents.
16.7 Cinematic video
Storyboard (original motion graphics, 30–45s, labelled "Concept workflow"):
A sentence typed in Instrument Sans becomes a contract card.
Contract clauses fold into a file tree.
A diff writes itself with ledger lines.
Tests tick green in mono.
An approval card is signed (hash shown).
The Seal engraves.
A deploy URL resolves with a health check.
The Proof Thread pulls through every scene.
Encoding:
AV1 (.mp4/.webm) first, then HEVC for Safari, then H.264 baseline fallback, each in a <source> with type and codecs.
1080p desktop at 2.5–4 Mbps, 720p mobile under 1.5 Mbps.
Muted with playsinline, no autoplay sound, and captions (WebVTT) plus a transcript.
Loading: a poster image, preload="none" or metadata, lazy loading via IntersectionObserver, and never blocking the hero LCP.
16.8 Page-by-page specs (marketing)
Home:
Hero: promise headline (Instrument Sans with one Instrument Serif italic word), sub-line, primary CTA "Start free — 14-day Team trial, no card", secondary "Explore the demo", and the Loom poster then scene.
"How it works": the Proof Thread scroll story.
A live interactive demo (sandboxed demo data).
Module overview (Core/Studio/Agent/Mobile/Mesh/RealityLoop/Trust/LaunchOS).
Developer preview (a real contract JSON and a real ProofPack sample, labelled sample).
Trust and security story with honest limits.
A supported-capabilities matrix (implemented / beta / roadmap).
Pricing teaser, FAQ, docs links and footer.
Product/Capabilities — one section per module with real screenshots.
Solutions — developers, AI startups, e-commerce, SaaS and enterprise, each with a real workflow.
Docs and API reference — generated from the real OpenAPI.
Pricing — see Section 22.
Security & Privacy — the actual controls and limitations.
About and contact.
Changelog.
Status — only with real status data.
Help center.
Legal — privacy, terms, cookie preferences where applicable, and a responsible-disclosure page (/.well-known/security.txt). Legal documents need professional review before launch.

Never fabricate customers, logos, testimonials, user counts, savings, certifications, uptime or performance.

16.9 Page-by-page specs (app)
Mission Control: Proof Thread summary of active tasks, an approvals inbox, risks and failures, recent ProofPacks (with Seals), transfers, deployments, a usage meter and the trial banner.
Projects: grid on desktop, list on mobile; import from GitHub or upload.
Studio: a three-pane desktop layout (tree | editor/visual | preview/inspector), resizable and collapsible, with a command palette (⌘K).
Agent Tasks: the timeline, live log, tool calls (redacted) and controls (pause/cancel/resume).
Contracts: a contract editor with clause cards, version diff and an approval bar.
ProofPacks: a ledger view, Seal, attestation JSON, verify-signature action and export.
Mesh/Devices: device cards, pairing, transfer queue and conflicts.
LaunchOS: a plan comparison table, cost breakdown, an authorization step and deploy timeline.
Security/Policies: policy builder, shadow-mode results, leases, autonomy levels, incidents and the trust graph.
Activity/Audit: a filterable, paginated, exportable log.
Billing/Usage, Team/Settings, Help.
16.10 Component inventory (every component ships all states: default, hover, focus-visible, active/pressed, loading, empty, error, success, disabled-with-reason, read-only, and skeleton where async)
Foundation: shadcn/ui primitives on Radix (or Base UI where the repository already uses it [VERIFY]), restyled to the tokens above.
Inputs and actions: Button (primary/secondary/ghost/destructive), IconButton, Input, Textarea (prompt composer), Select, Combobox, Checkbox, Switch, Radio, SegmentedControl.
Overlays and navigation: Tabs, Tooltip, Popover, Dialog, AlertDialog (destructive confirmations), Sheet/BottomSheet (with snap points), Toast, Command palette, Breadcrumbs, SidebarNav, BottomTabBar.
Data display: DataTable (sortable, virtualized), EmptyState, Skeleton, ProgressRing (real bytes), Stepper/ProofThread, StatusBadge (with pattern), RiskExplanation, UsageMeter, TrialBanner.
Farbaek-specific: ContractClauseCard, DiffViewer (split/unified/inline-mobile), LogStream, FileTree, CodeEditor (CodeMirror 6), ApprovalCard (with payload hash), ProofPackSeal, DeviceCard, PairingQR, TransferItem, PlanCard, PlanComparisonTable, CostBreakdown, GraphView (2D).
17. MOBILE EXPERIENCE SPECIFICATION

Mobile is a designed experience, not a shrunken desktop. Breakpoints:

sm < 640 (phone)
md 640–1023 (large phone / small tablet)
lg 1024–1439 (tablet landscape / laptop)
xl ≥ 1440 (desktop)

Use container queries inside panes.

17.1 Where centred compositions ARE used (phone)
Onboarding steps: a centred stack with the logo, a one-sentence promise and one primary action.
Prompt entry ("What should we build?"): a centred composer with suggestion chips below. The keyboard-aware composer docks to the bottom once typing starts.
Pairing: a centred QR or short code, the device name and a confirmation code on both screens.
Approval summary: a centred headline ("Approve 3 file changes to checkout/?"), risk badge and payload short-hash, followed by left-aligned detail.
Success states: a centred Seal, a verified summary and the next step.
Pricing hero: a centred headline and billing toggle; plan cards are a horizontal snap carousel plus a full-width "Compare all features" list.
Empty states and the trial-expired summary.
17.2 Where centred compositions are NOT used

Code, diffs, logs, file trees, tables, graphs, settings, audit lists, contract clause lists, usage breakdowns and forms are all left-aligned, dense and scannable. Numbers are right-aligned in tables.

17.3 Navigation and layout
Bottom tab bar (max 5): Home · Projects · Tasks · Approvals (badge) · More. Studio, Mesh, Launch, Security, Billing and Settings live under More or come contextually.
Primary actions sit in the bottom thumb zone. Destructive actions are never in the easy-thumb corner and always need a confirmation sheet.
Bottom sheets for filters, actions and details: snap points at 40% and 90%, a drag handle plus a visible close button (accessible alternative), and focus trapping.
Safe areas: env(safe-area-inset-*) and viewport-fit=cover; nothing interactive under the home indicator.
Dynamic type: support 200% text zoom without loss of content (WCAG 1.4.4) and rem-based layout. Native apps respect iOS Dynamic Type and Android font scale.
Touch targets: at least 44×44pt (iOS) / 48×48dp (Android) in native apps, and at least 24×24 CSS px (WCAG 2.2 SC 2.5.8 AA minimum) on the web, with a 44px target as the Farbaek web standard.
Gestures (each with a visible button alternative): swipe an approval card to reveal approve/reject as a shortcut only, because approval still opens a confirm sheet showing the payload hash; pull to refresh; long-press for context menus.
Haptics (native): light impact on selection, success notification on verified, warning on blocked. Never on every tap. Respect system settings.
17.4 Key mobile flows
Code review and diff:
an inline unified diff with word-level highlights and collapsible hunks;
"next change" floating buttons;
per-hunk accept/reject;
long lines wrap, with an optional horizontal-scroll mode;
a file switcher in a bottom sheet;
comments inline.
Light editing: CodeMirror 6 with a custom accessory bar above the keyboard (Tab, brackets, undo/redo, search) and no autocomplete flood.
Approval flow:
A push or in-app notification opens an authenticated deep link to the summary.
Detail (diff, risk, policy, recovery).
Approve, which triggers biometric re-auth if the organization requires it (a supplement only).
Server confirmation, then success.
Expired approvals show "Expired — request a fresh approval".
Pairing and transfer:
Choose a device.
Show the QR or code.
Confirm matching codes on both devices.
Capsule preview (contents, excluded secrets list).
Send, with a real-bytes ring.
The receiver verifies.
"Verified on MacBook — run tests there?"
Offline states:
an "Offline" banner;
cached project and task views marked "as of <time>";
queued actions listed as queued, not executed;
approvals cannot be granted offline, because they need server authorization.
17.5 PWA vs native responsibilities
PWA (web): review, approvals, task control, logs, preview, billing and settings. It is installable with a manifest; offline means a read-only cache only. It has no local network transfer or background transfers, and no file-system access beyond the File System Access API where supported.
Native (Expo): local workspaces, file pick/export, Mesh transports, secure key storage, background-aware transfers (within OS limits), push notifications, biometrics and haptics.
17.6 Tablet and desktop
Tablet landscape: two panes (list | detail). Studio uses editor plus a preview toggle.
Desktop: three resizable panes, a persistent sidebar, ⌘K, full keyboard shortcuts (documented in ? help) and a split diff.
18. TECHNICAL FOUNDATION (RESEARCHED — USE ONLY IF COMPATIBLE WITH THE EXISTING REPO)

Inspect first; never replace a working, compatible stack. If you are continuing or starting a web stack, the October 2026 recommendations are:

Concern	Recommendation	Alternatives / notes
Web framework	Next.js 16.x App Router, pinned to the latest patched release (16.4 shipped Oct 6, 2026; a security release is announced for Oct 14, 2026; Next 15 security support ends Oct 21, 2026) 
nextjs +2
	Keep the existing framework if the repository uses another
UI runtime	React 19.x (React 19.3 supported by Next 16.4 [VERIFY]) 
releasebot
	—
Language	TypeScript strict mode	Check the TS 7 tooling status before adopting [VERIFY]
Styling	Tailwind CSS v4 (CSS-first @theme tokens)	—
Components	shadcn/ui + Radix (or Base UI)	—
Motion	Motion for React (app) + CSS View Transitions; GSAP (now free including former paid plugins) for marketing only, subject to its licence's "no competing no-code visual animation builder" restriction	Lenis smooth scroll on marketing only, disabled under reduced motion
3D	three.js + React Three Fiber v9 + Drei, WebGL renderer by default	WebGPURenderer opt-in
Editor	CodeMirror 6	Monaco desktop-only (ADR)
Database	PostgreSQL (Supabase or Neon or self-managed) with Row Level Security as defence-in-depth, plus server-side authorization	—
ORM	Drizzle (SQL-first, RLS-friendly, light)	Prisma if already in the repository
Auth	Better Auth (MIT; organizations and plugins; acquired by Vercel July 2026) or Supabase Auth if on Supabase; Clerk for a managed option	Auth.js is now maintained by the Better Auth team and next-auth v5 has never reached stable — avoid for new builds
Jobs/scheduling	Inngest or Trigger.dev (durable steps, crons for trial reminders); or pg-boss/graphile-worker for Postgres-only	Choose by hosting; must support idempotency and dead-letter handling
AI SDK	Official provider SDKs behind Farbaek's ModelProvider; the Vercel AI SDK may be used as an implementation detail	—
Policy	Typed TypeScript policy layer → Cedar or OPA; OpenFGA/SpiceDB later	—
Evidence	in-toto attestation JSON, optional Sigstore/cosign signing	—
Scanning	Semgrep, OSV-Scanner, gitleaks/TruffleHog, StrykerJS	Run in CI and inside the sandbox for ProofPacks
Observability	OpenTelemetry traces with the GenAI semantic conventions (gen_ai.* attributes [VERIFY current stability]) to any OTLP backend; Langfuse (self-hostable) optional	Strip prompts and code from telemetry by default
Validation	Zod (or Valibot) schemas shared by client and server	—
Testing	Vitest, Playwright (including mobile viewports and WebKit), axe-core, Lighthouse CI	—
Desktop	Tauri 2 (default) / Electron	—
Mobile	Expo (current SDK, New Architecture)	—
Shared entities (adapt; don't duplicate)
Identity: users, organizations, organization_members, teams, invitations, sessions.
Projects: projects, workspaces, repository_connections, branches/versions, environments.
Agents: agents, agent_credentials (references only), agent_capabilities, delegations.
Models: model_providers, provider_models, provider_usage (no plaintext keys).
Integrations: integrations, integration_scopes, registered_tools (plus tool_definition_hash).
Tasks and contracts: tasks, context_references, context_passports, intent_contracts, contract_versions, outcome_criteria, protected_invariants.
Policy: policies, policy_versions, permission_leases, policy_decisions.
Actions and evidence: action_requests, action_executions, approvals (with payload_hash), action_events, evidence_receipts, proofpacks.
Execution: execution_jobs, command_records, checkpoints, snapshots, recovery_operations.
Verification: simulations, replay_runs, test_scenarios, test_results, verification_results.
Incidents: incidents, incident_events, dependency_edges, mitigation_actions.
Devices: devices, pairing_sessions, trusted_devices.
Mesh: transfers, manifests, transfer_files, transfer_chunks, transfer_checkpoints, workspace_capsules, workspace_versions, conflicts.
Launch: deployments, launch_plans, provider_resources, domains, dns_records, health_checks, deployment_logs.
Billing: plans, plan_versions, entitlements, subscription_accounts, trials, billing_customers, usage_transactions, ai_credit_ledger, provider_webhook_events, invoices, cancellations.
Platform: notifications, audit_events, outbound_webhooks, api_keys (hashed), feature_entitlements.

Use foreign keys, tenant-scoped indexes (org_id first), unique constraints, timestamps, retention markers and transactional updates. Never put plaintext tokens, private keys, provider credentials or unnecessary payloads in ordinary rows or logs. Use a managed secrets store or OS credential storage, with envelope encryption where appropriate.

Action lifecycle

REQUEST_RECEIVED → AUTHENTICATION_VALIDATED → AUTHORIZATION_CHECKED → ENTITLEMENT_CHECKED → POLICY_EVALUATED → RISK_ASSESSED → APPROVAL_PENDING (if needed) → EXECUTION_AUTHORIZED → EXECUTING → RESULT_VERIFYING → COMPLETED_VERIFIED

Alternative states: BLOCKED, REJECTED, EXPIRED, FAILED, PARTIALLY_COMPLETED, UNVERIFIED, INTERRUPTED, RECOVERY_PENDING, RECOVERED, REQUIRES_HUMAN_INTERVENTION.

Store the contract, policy and integration versions, the resource state reference, the idempotency key and the verification method. Never mark something complete just because a request was sent.

APIs and SDKs
Typed, versioned APIs (/api/v1) that match the implementation: projects and agents, tasks and contracts, action authorization, approvals, execution, details, evidence export, simulations, transfers, deployment plans and audit.
Request IDs, schemas, consistent errors (RFC 9457 problem+json), authentication, scopes, idempotency (Idempotency-Key header), pagination, rate limits, versioning, and signed outbound webhooks (using Standard Webhooks as well, for consistency).
Publish OpenAPI generated from the schemas. Never document fictional endpoints. Release a TypeScript SDK only once the API is stable.
Infrastructure

Start with managed services and minimal deployable units. Add queues, Redis, separate workers, relays or specialized policy services only when a real need appears. Use bounded retries, timeouts and dead-letter handling, and keep development, test, staging and production credentials and data separate.

19. SECURITY, PRIVACY AND RELIABILITY

Implement and test:

Strong authentication (passkeys/WebAuthn plus email; MFA for admins) and verified-email gates.
Server-side authorization and strict tenant isolation; RBAC plus resource and action scopes; IDOR/BOLA protection.
RLS where suitable and correctly configured, tested with dedicated cross-tenant tests.
Secure sessions (httpOnly, Secure, SameSite cookies), CSRF protection and CSP with nonces.
Input validation, safe output handling, and safe file and archive parsing.
Rate limits and abuse prevention.
Idempotency and replay protection for side effects and billing webhooks.
Secret storage, redaction, rotation and revocation, including Dodo webhook secret rotation, where the old secret stays valid for 24 hours.
TLS, and encryption in transit and at rest via real infrastructure.
Least-privilege, expiring credentials.
Sandbox isolation, resource limits and egress restrictions.
Dependency, secret and static scanning in CI.
Audit logs without secrets.
Secure deletion, export and retention.
Tested backup and restore.
Webhook signature verification.
Security-focused E2E tests.
Incident response, responsible disclosure and production configuration checks.

Assume every untrusted source may be malicious: AI output, repository content, packages, archives, uploads, tool descriptions, third-party APIs and web content. Never let a model alone decide safety.

Document docs/security/threat-model.md with:

trust boundaries (browser, API, worker, sandbox, desktop, mobile, relay, providers);
STRIDE per boundary;
an OWASP ASI/LLM mapping;
enforcement points and known limitations.

GDPR and SOC 2 checklists are readiness documentation only. Never claim compliance, certification or legal sufficiency without evidence and expert review.

Fail closed when authorization, policy, quota or identity checks are unavailable. Keep emergency pause, revocation, allowed exports and billing access available.

20. TESTING, ACCEPTANCE CRITERIA AND REAL-WORLD VALIDATION

Unit tests for state and policy logic, integration tests for persistence and adapters, E2E tests (Playwright) for core workflows, and security tests for boundaries. Use mocks only where a provider or device is genuinely inaccessible, and label mock verification separately from real provider or device testing.

Core / tenant / security tests
Unauthenticated or unverified users can't access protected data.
One organization can't access another's projects, tasks, billing, devices, evidence, usage or transfers.
Manipulating frontend requests can't bypass backend authorization.
Delegation can't expand scope.
Expired or revoked leases can't authorize new actions.
An approval authorizes only the exact payload hash, contract, policy and resource version that were reviewed.
Changed payloads or preconditions invalidate stale approvals.
Replayed requests don't repeat non-idempotent effects.
Secrets are redacted from logs and evidence.
Tool schemas and paths reject traversal, symlink escape and unauthorized writes.
Prompt-injection payloads can't grant permissions or override policy, with one scenario per relevant ASI ID.
Resource, network and time limits and cancellation behave as designed.
Changed MCP or tool definition hashes trigger re-approval.
RealityLoop / Studio tests
Contract parsing and versioning work.
Protected invariants and scope drift are detected.
The diff is tied to the exact workspace or commit.
"Passed" appears only after the real exit code or result confirms it.
Unrun tests are labelled "not run".
Build failures are reported accurately.
A ProofPack references the exact tested state and includes its limits, and its attestation digest matches.
Checkpoint and recovery preserve unrelated and uncommitted changes.
Simulations and replays can't touch production.
Generated code runs only in the configured boundary.
The preview has no privileged credentials and is served from an isolated origin.
Mesh tests
Manifest and BLAKE3 hash validation.
Chunk boundaries and large files (≥ 2 GB streaming without OOM).
Resume after interruption.
Duplicate or replayed chunks and sessions.
Traversal, symlink, duplicate or case-colliding paths, archive bombs and oversize files are rejected.
Secret-exclusion warnings and user review.
Out-of-storage and cancellation.
Conflict detection.
An untrusted Capsule is imported without executing anything.
Success is reported only after receiver verification.
A revoked or unauthorized device is rejected.

Physical-device tests (separately labelled, never marked passed unless run on real devices):

LAN transfer with the internet disabled.
iPhone and Android pairings.
Phone↔desktop transfer.
Verification of a large file.
Interrupt and resume.
Pairing rejection and revocation.
Offline receiver.
Unsupported transport.
Permission denied (including iOS local-network denial).
App suspended or backgrounded.
LaunchOS tests
Provider errors and timeouts.
Duplicate-purchase prevention.
Pending, completed and failed order transitions.
Consent and budget enforcement.
Missing env vars.
A failed deploy preserves production.
DNS and SSL status reflect the real provider state.
Unauthorized provisioning is denied.
Rollback succeeds only after verification.
No credentials appear in the browser, logs or build output.
Subscription tests (all 20 required)
A new eligible, verified organization gets exactly 14 calendar days.
An unverified user gets no protected access.
The trial needs no card.
Trial reminders follow the schedule (days 7, 12, 13, expiry) with accurate notification status.
Trial expiry automatically becomes Free.
Expiry does not charge.
Paid activation needs a verified billing state and explicit consent.
A replayed webhook can't duplicate state or usage changes (same webhook-id).
Monthly quota boundaries reset correctly.
An idempotent duplicate evaluation is metered once.
Cross-tenant billing and usage access is denied.
The backend rejects above-plan operations.
A quota or service failure never allows unguarded execution.
Downgrade never silently deletes data.
Cancellation communicates the effective date and is usable.
AI credit rules match the operation configuration.
Annual and monthly amounts are consistent and transparent.
Mobile pricing and billing work.
Every key route has meaningful loading, error, empty and success states.
Build, type checks and the relevant test suites pass.

Added Dodo-adapter tests (mocked with signed fixtures, labelled mock):

invalid signature → 401;
stale timestamp (> 5 min) → rejected;
out-of-order subscription.renewed before subscription.active → resolved by re-fetching state;
past_due keeps access while on_hold suspends paid features;
the trial is never created as a Dodo trial.
Design, accessibility and performance tests
axe-core on every route, with zero serious or critical violations.
Keyboard-only E2E of the core flow.
Reduced-motion snapshots.
Lighthouse CI budgets (Section 21).
Visual regression on key components in light and dark themes.
Playwright at 360×800, 390×844, 768×1024, 1280×800 and 1440×900, plus WebKit.
Quality gates
Tests, build and types pass, or failures are documented as pre-existing or environmental.
No known critical security issues introduced.
No fake success states or dead critical buttons.
Mobile behaviour inspected.
Keyboard, focus and reduced-motion behaviour checked.
Docs match the implementation.
Migrations validated and reversible where feasible.

Automated tests can't prove the absence of all vulnerabilities. State the coverage and the residual risk.

21. PERFORMANCE, ACCESSIBILITY AND GLOBAL READINESS

Core Web Vitals targets (p75, "good" thresholds per web.dev):

LCP ≤ 2.5 s
INP ≤ 200 ms
CLS ≤ 0.1

Farbaek's internal budgets are stricter on marketing pages: mobile LCP ≤ 2.0 s and less than 170 KB of initial JS on the home route [target, measure].

Performance practices:

Server rendering and streaming; code-split the editor, 3D and video.
Optimized images (AVIF/WebP, next/image) and video (Section 16.7).
No full-file buffering in transfers.
Paginate or virtualize activity, evidence, logs and file lists.
Indexed queries.
Caching only where authorization and freshness stay correct.
Critical functions keep working if 3D, video, AI, relay or integrations fail.
Push or server-sent events (SSE) where possible, otherwise bounded polling.
Error boundaries, structured sanitized logs and real-user monitoring.
Explicit dates and time zones.
i18n-ready strings (ICU) and locale-aware currency, number and date formatting.

Accessibility (WCAG 2.2 AA):

keyboard navigation, screen-reader labels and focus-visible states;
target sizes (SC 2.5.8) and accessible dialogs and sheets;
error identification, semantic structure, 200% zoom and reduced motion;
a low-bandwidth mode (Save-Data turns off video and 3D);
support for older devices;
testing on real phones and tablets where available.

Never optimize visuals at the expense of a slow or confusing core project, task or approval workflow.

22. ETHICAL GROWTH, ACTIVATION, RETENTION AND CONVERSION

Principle: Users upgrade because Farbaek demonstrably saved them time or risk, never because they were tricked.

22.1 Activation (aha moment)

Define the aha moment as: "first verified ProofPack on the user's own project or the guided sample."

Activation milestones, tracked as server events:

Organization created and trial started.
Project created or imported.
First contract approved.
First diff reviewed.
First real test run.
First ProofPack verified.
Second device paired or a teammate invited or the first deploy plan created.
22.2 Onboarding checklist (tied to real value, dismissible)

A five-item checklist in Mission Control and on the mobile Home tab mirrors milestones 2–6. Each item opens the real feature, not a tour overlay. Progress is computed from server events, never ticked on click. Completing it shows the Seal moment: "Your first verified change."

22.3 In-product upgrade surfaces (only at genuine limits or genuine value)
At 80% and 100% of quota: an inline UsageMeter and banner showing what happens next, with "Upgrade", "View usage" and "Remind me later" (all equal weight).
When a feature isn't in the plan: a disabled-with-reason state plus a "What this does" sheet with a real demo clip or sample. No blurred fake data.
Trial: an informative countdown (the date, plus days remaining) in Billing and a subtle header chip. Banners appear on days 7, 12, 13 and at expiry. No ticking seconds, no red urgency colours, no fake "offer ends".
After a verified ProofPack: a one-line, contextual note when a paid feature would help ("Team plans keep this evidence for 90 days").
Never: confirm-shaming copy ("No, I don't want safety"), pre-checked add-ons, hidden decline buttons, interstitials on every page, or fake scarcity.
22.4 Pricing page and plan comparison
A monthly/annual toggle that defaults to monthly. On annual, show "$180 billed yearly ($15/mo equivalent) — save $48" in the same visual weight as the monthly price.
Plan cards show the price, the main quotas and three to five differentiators, with one honest "Recommended for teams" label on Team.
A full comparison table (sticky header on desktop; on mobile, an accordion per feature group with the plan columns as a horizontal scroller).
Tax note: "Prices in USD. Applicable taxes calculated at checkout." Local currency is displayed by the payment provider where supported.
An FAQ covering: what counts as an evaluation, what happens at the limit, the trial (no card, auto-Free), cancellation, refunds (per the real policy), data on downgrade, and bring-your-own-key costs.
Enterprise: "Contact us", listing only implemented capabilities.
22.5 Trial, downgrade and win-back flows
At trial end: "Your Team trial ended. You're on Free — nothing was charged." Show what changed, the over-limit resources (with select or export), and "Choose a plan" plus "Stay on Free" with equal prominence.
Downgrade and cancel:
reachable in two taps from Billing;
one optional reason survey (skippable);
a factual summary of what changes and when (the paid-through date);
at most one retention offer, which can be declined in one tap;
confirmation, an email or in-app receipt, and immediate status update.
Win-back: at most one message after 14 days and one after 60 days, with an unsubscribe link and no dark patterns.
22.6 Legal compliance baseline (October 2026 — not legal advice; counsel must review)
US federal: The FTC's 2024 "click-to-cancel" amendments were vacated by the Eighth Circuit on July 8, 2025. The FTC published an ANPRM in March 2026, and as of September 2026 no new rule had been adopted. ROSCA and FTC Act Section 5 still apply: clear disclosure of material terms before billing information is collected, express informed consent, and simple cancellation. The FTC continues to enforce these case by case.
US states: Roughly 30 states have automatic-renewal laws (for example California's ARL, with renewal reminders and online cancellation) [VERIFY state list]. 
jonesday
EU/UK: Follow EU consumer law, DSA dark-pattern provisions for platforms, the proposed Digital Fairness Act [VERIFY status], and the UK DMCC Act subscription regime [VERIFY commencement date].
Farbaek standard (meets or exceeds all of the above):
disclose terms before checkout;
express consent with a checkbox or clear CTA language naming the price and interval;
a renewal reminder before annual renewals (30 days) [policy choice];
cancellation online and as easy as signup;
immediate confirmation;
store the consent record (timestamp, displayed terms version).
22.7 Success metrics (each with a defined source)
Metric	Definition	Source
Activation rate	% of new organizations reaching milestone 6 within 7 days	activation_events table
Time to first ProofPack	Median minutes from organization creation to milestone 6	events
Trial→paid conversion	% of trials with a verified paid subscription within 7 days of trial end	subscription_accounts + verified webhook state
Week-4 retention	% of organizations with ≥ 1 verified task in week 4	tasks
Cancellation completion	% of cancel flows started that complete (should be high — evidence of no obstruction)	billing events
Quota-limit encounters	Count per organization per period	usage ledger
Support contacts about billing confusion	Count per 100 paid organizations	support system (if integrated)

Never display these metrics publicly unless they are real and permitted.

23. DODO-READY BILLING ARCHITECTURE (NOT CONNECTED)

Status banner in Admin: "Payments: NOT CONNECTED. Checkout disabled. Eligibility and credentials required."

Before activation, the owner must:

Complete Dodo KYC. Sri Lanka appears in Dodo's eligible merchant and payout country list as of October 2026, but confirm this during onboarding.
Provide test-mode keys.
Create products.
Configure the webhook endpoint.
23.1 Provider-agnostic interface
ts
interface PaymentProvider {
  id: 'dodo' | 'mock';
  mode: 'not_connected' | 'test' | 'live';
  createCheckoutSession(input: { orgId: string; planVersionId: string; interval: 'month'|'year'; customer: { email: string; name?: string }; returnUrl: string; idempotencyKey: string }): Promise<{ url: string; providerSessionId: string }>;
  createCustomerPortalSession(orgId: string): Promise<{ url: string }>;
  changePlan(input: { orgId: string; toPlanVersionId: string; proration: 'prorated_immediately'|'difference_immediately'|'full_immediately'|'do_not_bill'; idempotencyKey: string }): Promise<void>;
  cancel(input: { orgId: string; atPeriodEnd: boolean }): Promise<void>;
  getSubscription(providerSubscriptionId: string): Promise<NormalizedSubscription>;
  verifyAndParseWebhook(rawBody: string, headers: Record<string,string>): Promise<NormalizedProviderEvent>; // throws on invalid
  reportUsage?(input: { orgId: string; meter: string; quantity: number; eventId: string }): Promise<void>; // only if usage billing is enabled later
}
23.2 Dodo adapter boundary (src/server/billing/providers/dodo/ only — nothing outside imports the Dodo SDK)
Use the official TypeScript SDK (dodopayments) [VERIFY version], with environment: 'test_mode' | 'live_mode', keys from the server environment (DODO_PAYMENTS_API_KEY, DODO_PAYMENTS_WEBHOOK_KEY), and separate keys per mode.
Checkout: use Checkout Sessions. Dodo marks direct POST /subscriptions as deprecated in favour of checkout sessions. Pass the orgId in metadata.
Customer portal: use the hosted portal session for payment-method updates and self-service cancellation.
Products: one Dodo subscription product per plan × interval. Prices live in Dodo and the plan_version stores the expected amount; a reconciliation check alerts on mismatch. Existing Dodo subscriptions are never repriced by editing a product, so migrations use change-plan.
[VERIFY] The subscription-period configuration semantics when creating products, so that plans renew indefinitely as intended.
23.3 Webhook ingestion (POST /api/webhooks/dodo)
Read the raw body; never parse JSON before verifying.
Verify with the SDK's webhooks.unwrap() or the Standard Webhooks library, using the headers webhook-id, webhook-signature (HMAC-SHA256, v1,<sig>), webhook-timestamp. Reject if the timestamp is more than 5 minutes off, and compare in constant time.
Insert into provider_webhook_events (provider, webhook_id UNIQUE, type, payload_json, received_at, status). A duplicate means return 200 and do nothing more.
Return 2xx quickly. Dodo times out after 30 s, and its Webhooks documentation says failed deliveries are retried with exponential backoff, up to 8 attempts in total (immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h). Then process asynchronously through the job queue.
Events may arrive out of order. The processor re-fetches the subscription via getSubscription() and applies the latest provider state, guarded by the event timestamp and the stored provider_state_updated_at.
Apply the state change and entitlements in one transaction, write an audit_event, and notify the user.
If processing fails, mark the event failed, retry with backoff and dead-letter after N attempts. Admin replay is available.

Subscribed events (minimum):

subscription.active, subscription.updated, subscription.renewed, subscription.plan_changed;
subscription.past_due, subscription.on_hold, subscription.paused, subscription.unpaused;
subscription.cancelled, subscription.expired, subscription.failed;
payment.succeeded, payment.failed, refund.* and dispute.* [VERIFY exact names].
23.4 State mapping (internal ← Dodo)
Dodo status / event	Internal state	Entitlements
(none; internal)	trialing	Team trial caps (never a Dodo trial)
checkout created, pending	checkout_pending	Unchanged (Free or trial continues)
active (subscription.active/renewed)	active	Paid plan
past_due	past_due	Keep paid access during the grace window; show an "update payment method" banner
on_hold	suspended (reason: payment)	Paid features paused → Free-level limits; data preserved; emergency pause, revocation, export and billing always available
paused	suspended (reason: paused)	Same as above
cancelled with a future period end	cancellation_scheduled	Paid until the period end
cancelled effective now / expired	expired → free	Free limits; over-quota resolution flow
failed (mandate/creation failed)	unchanged (checkout_pending → previous)	No change; show a checkout error
plan_changed	active (new plan_version)	Recompute; downgrades apply to new actions only

[VERIFY Dodo's exact cancellation semantics, for example cancel-at-next-billing-date, before finalizing.]

23.5 Plan changes and upgrade during trial
Upgrade from trial: create a paid checkout with no Dodo trial days. Charging starts at explicit consent, and the UI states "Billing starts today; your remaining trial days end now." [Owner decision; alternative: defer the start date — requires verified Dodo support.]
Upgrades: prorated_immediately (shown with Dodo's preview-change amount where the API supports it [VERIFY "Preview Plan Change" endpoint]).
Downgrades: schedule at period end, or do_not_bill; disclose before confirmation.
23.6 Modes
not_connected (default): checkout buttons show "Payments coming soon — continue on Free/Trial". The admin can grant a development entitlement via an audited, non-production-only command.
test: Dodo test mode; the UI shows a persistent "TEST MODE" ribbon.
live: enabled only by an environment flag plus an admin confirmation recorded in audit, and only after the go-live checklist in docs/billing/go-live.md is complete (KYC approved, live products, webhook verified with a test event, tax and refund policy published, legal review).

Optional later items (ADR first): Dodo usage-based meters for paid overages (disabled until priced and consented), credit-based billing for AI credits, and license keys for desktop builds. Farbaek's own ledger stays the enforcement authority.

24. REQUIRED DOCUMENTATION AND ENGINEERING HYGIENE

Maintain:

docs/architecture/current-state.md, ADRs (docs/adr/NNNN-*.md) and docs/security/threat-model.md.
Setup guide and supported platforms, and .env.example (names and safe placeholders only).
Data model and migrations, API contracts and OpenAPI, and provider setup and permissions.
Security and privacy limitations, the action and task lifecycle reference, and the pricing and entitlement reference.
Test instructions and actual results (docs/testing/results-YYYY-MM-DD.md).
The Mesh compatibility matrix, desktop and mobile packaging, deploy and rollback operations, and known issues and roadmap labels.
docs/research/ (sources and dates) and docs/billing/go-live.md.

Keep secrets out of Git and logs. Follow the repository's package manager and lockfile. Add only justified, maintained dependencies. Preserve user files and uncommitted state. Use feature flags for risky rollouts, never to hide broken functionality.

25. RESEARCHED INNOVATION BACKLOG (DIFFERENTIATORS BUILT ON EXISTING CONCEPTS)

Each item extends RealityLoop, Trust, ProofPack, Mesh or LaunchOS. None is a new parallel subsystem. Tiers: MVP (Stages 1–3), Next (Stages 4–6), Frontier (Stages 7–8).

Cost-Before-Compute Envelope (MVP)
Problem: Builders report unpredictable credit and token burn on iteration with Lovable, Bolt, Replit and v0.
Solution: Before any AI or sandbox run, show an estimated credit and cost range and a hard cap. The run stops at the cap with a resumable checkpoint. Credits for runs that fail because of a platform error are automatically refunded to the ledger.
Implementation: the Cost Brain, the credit ledger and a per-task budget in the contract.
Acceptance: every run displays its estimate and actual cost; a capped run never exceeds the cap; a refund entry is linked to the failure evidence.
Intent Diff Lens (MVP)
Problem: Agent diffs are hard to review against what was asked.
Solution: Every hunk is annotated with the contract clause it satisfies, or flagged as "unexplained scope". On mobile it shows as an inline chip per hunk.
Implementation: IntentLock, plus mapping the diff to the contract via file globs and AI suggestion, with the deterministic check first.
Acceptance: hunks outside the allowed globs are always flagged, even if the AI mapping says otherwise.
Portable Proof (MVP→Next)
Problem: Generated code arrives without verifiable evidence, and builder security incidents erode trust.
Solution: ProofPacks as signed in-toto attestations, a GitHub status check ("Farbaek ProofPack: verified"), and a public verify page that checks the signature and digest without exposing code.
Acceptance: tampering with a ProofPack causes verification to fail; the status check reflects the real result.
Eject Anytime (MVP)
Problem: Lock-in concerns with browser-runtime builders.
Solution: Every project is a standard repository. One-tap export of code, contracts, ProofPacks and history (JSON) with no feature that depends on Farbaek hosting.
Acceptance: an exported project builds outside Farbaek using the documented commands.
Approval Wallet (MVP→Next, mobile)
Problem: Approvals are tied to one vendor's surface or sent as insecure links.
Solution: A mobile approvals inbox where each card shows the payload hash, an expiry timer, risk and a recovery path. Optional biometric step-up. Approvals sync to the desktop runtime.
Acceptance: a stale hash cannot be approved; an approval executes only the exact hashed payload.
Continue-on-Desktop Handoff (Next)
Problem: LocalSend, AirDrop and Quick Share move files, not project state; cloud agents don't run on the user's own machine.
Solution: A Capsule that carries contract, context passport, diff and next steps. The desktop runs tests locally and returns a ProofPack to the phone.
Implementation: Mesh over LAN, plus the desktop runner.
Acceptance: the full mobile-to-desktop flow (Section 13) passes on real devices, with the device test log stored.
Model Change Canary (Next)
Problem: Providers retire or replace models on short notice, which silently changes behaviour. OpenAI's API Deprecations page records that gpt-5-codex, gpt-5.1-codex, gpt-5.1-codex-max, gpt-5.1-codex-mini and gpt-5.2-codex were shut down on July 23, 2026 (announced April 22, 2026), and OpenAI's Codex models page says GPT-5.3-Codex-Spark was retired on September 14, 2026.
Solution: When a configured model is deprecated or changed, run counterfactual replay of recent sanitized tasks on the new model in the sandbox and show the differences in tests, scope and cost before switching.
Acceptance: no automatic switch; a report is produced; the owner approves.
Tool Definition Pinning (Next)
Problem: MCP tool poisoning and agentic supply-chain risk (ASI04).
Solution: Hash-pin tool descriptions and manifests; any change quarantines the tool until it is reviewed, with a diff of the description.
Acceptance: a changed description blocks tool calls until re-approval.
Sandbox Egress Ledger (Next)
Problem: Agents' network side effects are invisible.
Solution: A per-run record of the domains contacted (allowed or blocked) included in the ProofPack, using provider egress controls where available (for example Vercel Sandbox's network policies) or a proxy.
Acceptance: blocked domains appear in the ProofPack; no unlisted egress succeeds in deny-all mode.
Launch Evidence Gate (Next)
Problem: Deployment is separate from verification.
Solution: LaunchOS requires a verified ProofPack for the exact commit being deployed and attaches the post-deploy health checks to the same evidence chain.
Acceptance: deploying a commit without a verified ProofPack requires an explicit, logged override by an authorized role.
Incident Replay Theatre (Frontier)
Solution: Step through an incident's real event timeline and trust graph to see which policy would have stopped it, then generate a prevention rule (via incident-to-prevention memory) to test in shadow mode.
Acceptance: the proposed rule is evaluated against historical events before activation.
Real-Project Loom (Frontier)
Solution: An optional 3D view of a project's actual intent-to-proof graph for executive and demo use, built only from real data, with a full 2D accessible equivalent.
Acceptance: every node links to a real record; usability testing shows a measurable benefit, or the feature stays off.
26. DEFINITION OF DONE

A feature is complete only when its workflow genuinely works in the target environment, is tested as far as possible, handles failures, enforces permissions, records evidence and is documented.

Long-term success means:

A beginner can go from an idea to a real working app on a supported stack.
A professional can import a repository, inspect context, approve a contract, review edits, run tests and produce evidence.
The agent runs with no dependency on the Claude Code extension or CLI.
Protected operations are authorized by code outside the model.
Build, test, deploy and transfer states are genuine.
Mobile review connects to desktop execution through secure, approved handoff.
Transfers verify the received data and never auto-execute.
Deployments involve explicit cost and impact authorization and provider-confirmed results.
The trial, limits, metering and no-surprise billing are enforced on the backend.
The app is premium, responsive, accessible, maintainable and economical.
Remaining limits are transparent.

Build the smallest cohesive, valuable, secure system first, then expand with measured demand.

27. HOW TO RUN THIS IN CLAUDE CODE — FILE LAYOUT, SAFETY AND PHASE PROMPTS
27.1 Recommended file layout
CLAUDE.md                       # ≤200 lines: commands, architecture map, non-negotiables, pointers
docs/FARBAEK_MASTER_SPEC.md     # this document (source of truth)
docs/adr/                       # one ADR per significant decision
docs/architecture/current-state.md
docs/security/threat-model.md
docs/research/                  # dated source notes
docs/stages/stage-N.md          # plan + acceptance results per stage
.claude/settings.json           # shared permissions + hooks (committed)
.claude/agents/                 # subagents: security-reviewer, test-runner, a11y-auditor, design-reviewer
.claude/skills/                 # e.g. proofpack/, migration-safety/, dodo-webhooks/ (SKILL.md each)

Rules for this layout:

CLAUDE.md holds only always-true facts and rules. Procedures belong in skills.
Enforcement belongs in hooks. A CLAUDE.md line like "never edit .env" is a request, not a guarantee.
27.2 Safe permissions and hooks (verify the schema against current Claude Code docs before committing)
Never use --dangerously-skip-permissions or any blanket bypass.
permissions.deny:
Read(./.env*), Read(./**/*.pem), Read(./secrets/**);
Bash(rm -rf:*), Bash(git push --force:*), Bash(curl:* | sh);
any production deploy or DB command.
permissions.allow: the repository's test, lint, typecheck and build scripts, plus read-only git commands.
Ask for: dependency installs, migrations, git push.
PreToolUse hook:
block writes to .env*, lockfiles (unless the task approves it) and migrations/ without a matching ADR or stage note;
block commands containing --force, DROP, TRUNCATE against non-test DBs.
PostToolUse hook: run the formatter on edited files.
Stop hook (optional): run typecheck and the affected tests, and report.
Use plan mode (Shift+Tab, or --permission-mode plan) at the start of every stage and for anything touching authentication, billing, the schema or public APIs.
Use subagents for repository exploration, security review, accessibility audit and test triage to keep the main context clean.
Checkpoints/rewind cover only Claude's own edits. Commit at every green milestone; checkpoints are not a substitute for git.
27.3 Verification command set (adapt to the repository's real scripts and package manager)
<pm> run typecheck && <pm> run lint && <pm> test && <pm> run build
<pm> exec playwright test                      # incl. mobile + WebKit projects
<pm> exec drizzle-kit check (or prisma migrate status)
gitleaks detect --no-banner ; osv-scanner -r . ; semgrep scan --config auto --error
<pm> exec lhci autorun                         # Lighthouse CI budgets
27.4 Stage prompts (paste one at a time; each begins in plan mode)

Stage 0 — Audit and safety baseline

Read docs/FARBAEK_MASTER_SPEC.md fully. In plan mode, explore the repository with subagents, then produce:

docs/architecture/current-state.md with all Section 3 items;
the baseline results of every existing check;
CLAUDE.md (≤ 200 lines);
.claude/settings.json with the deny/ask/allow rules and hooks from 27.2;
ADRs 0001–0006: stack, editor (CodeMirror 6), sandbox provider, policy engine, auth, job queue;
docs/security/threat-model.md;
design tokens as Tailwind v4 @theme variables;
logo discovery results.

Don't change product behaviour yet.

Acceptance: the docs exist; the baseline commands have run with their outputs recorded; hooks block a test write to .env; the logo was found or its exact blocker documented.

Stage 1 — Core

Implement:

organization-isolated authentication with email verification;
the unified project and task model and the RealityLoop state machine;
the responsive shell (desktop sidebar, mobile bottom tabs);
the onboarding checklist from real events;
the plan catalog (exact Section 15 values), entitlements service, usage ledger and the 14-day trial with reminder jobs;
the Billing page in not_connected mode;
the design-system foundation components with all states.

Acceptance: subscription tests 1–6, 9–14, 16–17 and 19 pass; cross-tenant tests pass; axe shows no serious violations on the new routes; mobile 390px screenshots reviewed.

Stage 2 — Studio vertical slice

Implement:

project create/import (GitHub and upload), the file tree, CodeMirror 6 editor and search;
the ModelProvider gateway with one real provider (if a key exists) plus a labelled mock;
the Intent Compiler and contract editor;
targeted patch generation, diff review and checkpoints;
execution via the SandboxProvider (microVM adapter if credentials exist; otherwise state clearly that isolation is not active and restrict execution to Review Only);
real test runs and the task timeline with the Proof Thread.

Acceptance: "passed" appears only from real exit codes; the preview runs on an isolated origin; the mobile diff review works at 360px.

Stage 3 — Trust and RealityLoop

Implement:

the policy engine interface and outcomes, approvals with payload hashes, leases and autonomy levels 0–2;
shadow mode, scope drift, the ProofPack (in-toto JSON, plus the optional signature) and the Seal;
recovery previews, Future-State Arena on disposable worktrees, and the security eval suite v1 mapped to ASI01–ASI10;
Cost-Before-Compute and the Intent Diff Lens.

Acceptance: all core/tenant/security and RealityLoop tests pass; tampered ProofPacks fail verification.

Stage 4 — Agent desktop

Write the Tauri 2 (or Electron, per ADR) companion: command broker, path canonicalization, the local runner labelled honestly, provider configuration in the OS keychain, cancel/resume, and signed-build scripts (document the missing certificates).

Acceptance: symlink and traversal tests pass; cancellation kills process trees; installers built or the exact blocker documented.

Stage 5 — Mesh

Implement:

the Capsule format, BLAKE3 manifests and validation;
LAN transfer (mDNS/Bonjour) between desktop and desktop, then desktop and mobile;
PAKE or Noise pairing, resume, conflicts and secret exclusion.

Acceptance: all automated Mesh tests pass; physical-device results recorded separately, or listed as "not run".

Stage 6 — LaunchOS

Implement the Launch Planner, one real provider adapter (owner's choice after verifying its API), the purchase/deploy authorization screen, idempotent orders, the lifecycle with health checks, and the Launch Evidence Gate.

Acceptance: all LaunchOS tests pass; no deploy without a verified ProofPack or a logged override.

Stage 7 — Mobile native and handoff

Build the Expo app (current SDK, New Architecture): local workspaces, editor and diff, the Approval Wallet, pairing, Mesh LAN transport, push notifications, and the full mobile-to-desktop flow. Run a Wi-Fi Aware/Nearby research spike.

Acceptance: the end-to-end handoff passes on at least one real iPhone and one Android device (logs stored), or the blockers are documented.

Stage 8 — Advanced and enterprise

Add expanded replay, autonomy levels 3–4, graph analytics, SSO/SCIM, outcome watch, Model Change Canary, Tool Definition Pinning, egress ledger, Incident Replay Theatre, and, after the Section 23 go-live checklist, Dodo test-mode then live activation.

Acceptance: each feature meets its Section 25 criteria; billing tests 7, 8, 15 and 18 pass against Dodo test mode with real signed webhooks.

27.5 Realistic session expectations

One session can complete roughly one stage's slice of planning plus several focused implementation milestones. Large stages (2, 3, 7) will span multiple sessions. At the end of every session, update docs/stages/stage-N.md with what was done, what was verified and what's next, then commit.

28. FINAL CLAUDE CODE EXECUTION CHECKLIST
Inspect the repository structure, manifests, lockfiles, routes, DB, authentication, APIs, model providers, execution tooling, design components, logo assets, billing, integrations and tests, without printing secrets.
Establish the baseline build, test and type-check status and record any pre-existing failures.
Research the current official docs for APIs about to be implemented, and save notes with dates.
Create the current-state assessment, gap map, threat model outline and prioritized MVP plan.
Identify the single source of truth for identity, projects, contracts, policy, evidence, subscriptions and usage. Plan incremental migrations with no duplicates.
Implement the highest-value vertical slice: real project/context → contract → reviewable patch → actual tests → ProofPack, plus trial and entitlement enforcement.
Use Farbaek branding and the original supplied logo, unaltered.
Apply the Proof Atelier design system. Design centred mobile flows intentionally, without universal centring.
Add secure error handling, loading and empty states, and accurate statuses.
Add tests for state transitions, tenant isolation, approval binding, idempotency, quotas and the implemented workflow.
Run lint, types, tests, migration checks and the production build, and fix the failures you caused.
Don't stop at a homepage or proposal. Continue until a real environment, dependency or credential constraint stops you.
Final report, in precise terms:
the architecture found and the files and modules changed;
the capabilities actually implemented;
the commands and tests executed, with their results;
live vs mocked or unconfigured integrations;
the logo used, or the exact blocker;
the security controls actually enforced;
subscription, trial and billing state, and whether Dodo is connected (never claim it without verification);
supported platforms and any physical-device testing actually done;
known limitations, blockers and the exact steps to run and test;
the next highest-value stage and why.

Final instruction: Build Farbaek as one coherent platform with exceptional design and real, verifiable engineering. Durable source code, protected execution, actual tests, clear evidence, honest limitations and user trust come before superficial breadth or impressive but fake demonstrations.

29. REQUIREMENTS TRACEABILITY MATRIX
Source section	Content	Location in this spec
0 Operating instructions	12 rules + blocker handling	§0 (rules 1–12 preserved, +13)
1 Identity & brand	Name, product line, exact logo rule, promise	§1
2 Vision & strategy	10 pillars, lifecycle, customer groups, differentiation	§2 (+ competitor table), §25
3 Execution strategy	Assessment, first slice, Stages 0–8	§3, §27.4
4 Architecture	Modular monolith, 15 domains	§4
5 Core	Areas, Mission Control, onboarding/retention	§5, §22
6 Studio	Templates, proposal, workspace, AI pipeline, preview security	§6 (+ CodeMirror decision, GSAP note)
7 Native Agent	Runtime, tools, 3 permission modes, isolation, deps, cancel/recovery	§7 (+ sandbox research table)
8 IntentLock/RealityLoop	Compiler, Context Passport, lifecycle, Arena, replay, outcome watch, incident memory	§8
9 Trust	6 outcomes, approvals with hashes, ProofPack, undo, risk, leases, autonomy 0–4, policy builder, shadow, drift, injection, trust graph, incidents, egress, registry, eval suite	§9 (+ OWASP ASI mapping, MCP pinning, in-toto)
10 Dev Intelligence	IntentLock code, ProofPack, Failure Futures, mutation, Why-Graph, Reversibility Radar, Cost Brain, Learn/Pair/Build/Audit	§10
11 Mesh	Capsules, protocol, connectivity, transport, device trust, sync	§11 (+ reality matrix, crypto choices)
12 LaunchOS	Planner, adapters, purchase authorization, lifecycle, domains	§12
13 Native apps	Desktop, mobile, mobile→desktop flow, pairing	§13, §17
14 AI/privacy	Provider independence, context, credits, privacy	§14
15 Subscriptions	Exact catalog, trial caps, reminders, enforcement, usage, states, data model	§15, §22, §23
16 UI/UX	Aesthetic, centred mobile, 3D, video, interaction, public pages, demo mode	§16, §17 (demo mode: §16.8 and below)
17 Technical foundation	Stack, entities, action lifecycle, APIs, infrastructure	§18
18 Security	Control list, threat model, fail closed	§19
19 Testing	Core, RealityLoop, Mesh, devices, LaunchOS, 20 subscription tests, quality gates	§20 (all 20 preserved)
20 Performance/a11y	List	§21 (+ CWV thresholds, WCAG 2.2)
21 Documentation	List	§24
22 Definition of done	Criteria	§26
23 Final checklist	13 steps + report	§28

Demo mode (from source §16, preserved): Provide an interactive, clearly labelled demo using synthetic projects, agents, products and actions. Users can inspect permissions, preview a change, see risk, approve or reject, and inspect mock results and an evidence receipt. Demo mode uses separate data and credentials and is technically unable to execute real external actions, send real email, charge money or modify real systems. Enforce this with a separate demo tenant flag checked in the execution broker, the payment provider (forced to mock) and notifications.

30. RESEARCH LEDGER (accessed 13 October 2026 — re-verify items marked [VERIFY])
Dodo Payments documentation:
Countries Eligible for Merchant Acceptance (Sri Lanka listed; payouts only in listed countries; KYC documents must be issued in a listed country).
Webhooks (Standard Webhooks; 30 s timeout; 8 attempts; out-of-order delivery; webhook-id idempotency; 5-minute timestamp tolerance; 24-hour secret rotation overlap).
Subscription Webhooks / Events Guide; Subscriptions (trial period days, proration modes, POST /subscriptions deprecated in favour of checkout sessions).
Subscription Upgrade & Downgrade (trial ends on change).
FAQ ($0 mandate on trial).
Customer Portal; API Reference (test/live hosts); Official SDKs; Adaptive Currency (LKR); License Keys.
Frameworks and libraries:
Next.js blog (16.4 on Oct 6, 2026; security update announced for Oct 14, 2026) and endoflife.date (Next 15 security support ends Oct 21, 2026).
React Three Fiber v9 docs and releases (9.8.1); a third-party three.js 2026 WebGPU migration guide (Drei Text and postprocessing incompatibility).
Expo SDK 54 and 55 changelogs.
Better Auth blog (Auth.js stewardship; Vercel acquisition July 7, 2026).
Vercel AI SDK 6 announcement.
Editors, motion and standards:
Monaco Editor README FAQ (no mobile support); CodeMirror homepage and changelog (mobile support).
GSAP Standard License and 3.13 release notes.
web.dev Web Vitals; W3C Understanding SC 2.5.8.
Platform guidance:
Android 14 foreground service types; Apple local network privacy (WWDC20 session 10110; TN3179).
Apple WWDC25 Network framework / Wi-Fi Aware; Google Nearby developer page.
Security standards:
OWASP Top 10 for Agentic Applications 2026 (via OWASP GenAI project summaries).
MCP specification releases (2025-11-25; 2026-07-28).
Legal analysis: law-firm analyses of the FTC Negative Option Rule vacatur and the 2026 ANPRM (Crowell, Goodwin, Jones Day, BCLP).
Third-party comparisons (treat as secondary):
Sandbox comparisons 2026 (E2B, Daytona, Modal, Vercel Sandbox, Cloudflare).
AI builder and coding-agent pricing comparisons 2026.
Claude Code docs: Best practices; Extend Claude Code; "Steering Claude Code" article.
31. ASSUMPTIONS THE OWNER SHOULD CONFIRM
The existing repository is a TypeScript web app compatible with Next.js. If not, the stack table adapts.
The owner's business entity will complete Dodo KYC as a Sri Lanka-based merchant (eligibility listed, but approval isn't guaranteed).
USD is the base pricing currency, with Dodo Adaptive Currency for local display.
Upgrading during the trial starts billing immediately (alternative: defer, if Dodo supports it).
Instrument Sans / Instrument Serif / JetBrains Mono are acceptable, and the logo's colours may adjust the accent tokens.
The first sandbox vendor (E2B or Vercel Sandbox) and the first deploy provider are to be chosen by the owner after a cost review.
GSAP stays limited to marketing pages pending a legal read of its licence restriction.
Legal documents (terms, privacy, refund policy, auto-renewal disclosures) will get professional review before live billing.
Caveats
Some facts come from secondary sources and are marked [VERIFY]: competitor pricing, the AI SDK 7 and Expo SDK 56/57 versions, and the EU Digital Fairness Act and UK DMCC timelines. Claude Code is told to re-check them against official documentation before relying on them. The sandbox prices now come from E2B's pricing docs and Vercel's knowledge base, and the Lovable incident details from The Next Web's April 21, 2026 report. The "roughly 30 states" auto-renewal figure is still unconfirmed, because sources disagree (from 25 states to 35 states plus D.C.).
Dodo's merchant-country list shows Sri Lanka is eligible. It doesn't guarantee your business will pass KYC or that every payout method will be available to you.
The colour hex values are deliberate starting points. Contrast ratios must be computed in CI, and the accents may need adjusting to match your actual logo.
Physical-device behaviour (Wi-Fi Aware, Nearby Connections, background transfers) can't be confirmed from documentation alone. The prompt deliberately makes LAN transfer the first transfer path.
