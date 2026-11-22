# Farbaek master audit

- **Date:** 2026-11-22, on the code of branch `feat/stage-209-program-audit` (main plus stages 206 to 208).
- **Why:** the owner's master brief of 2026-11-22 asks for the whole platform to become one intelligence ecosystem. This is what exists today, measured against that brief.
- **How it was made:** four read-only audits, one for each area below, each reading the code and returning facts with file and line. Every fault listed as "confirmed" was then read again in the code by the session that fixed it. Everything else is "as reported": true to the reader's notes, not yet re-checked.
- **What this isn't:** the list of features. That is `docs/architecture/current-state.md`, kept up to date stage by stage. This document doesn't repeat it.

## The short version

Farbaek is much more than a chat wrapper already. It has a governed build flow with contracts, approvals, proof and undo, a real payment system, sandboxes, a desktop agent, native apps, Chat with research and memory, image and video studios, and a staff console. Its security controls are real and tested.

Against the brief, the largest gaps are these, in the order they matter:

1. **Automation that outlives a page view.** Agent runs live in the web server's memory for at most 40 minutes. There is no scheduler a person can set, no triggers, no persistent agents, and no single place to see and pause running work.
2. **One model registry.** Model ids, prices, names and tiers are spread over four files, with no capabilities recorded. There is no Grok, and failover exists for Chat only.
3. **Dark mode and one navigation.** Tokens are light only. There are five navigation systems, and "Build" opens three different places.
4. **Plans.** The live catalog is Lite $1 to Max 3x $300 with one pool of AI usage. The brief's anchors ($3.99, $20, $50, $100, $200) and per-feature limits don't exist, and the margin is a worst case per plan, not a blended model.
5. **Phone voice assistant.** Voice exists only in the browser. Neither phone app has any assistant integration.
6. **Product analytics.** No daily or monthly active people, retention, churn or cost per finished task.

## Faults found and fixed in stage 209

All five were confirmed in the code, fixed, and given a test. Details are in `docs/stages/stage-209.md`.

| Fault | What happened | Where |
| --- | --- | --- |
| Chat left a workspace's own key | When a workspace's own Claude key couldn't be read, Chat answered with OpenAI on Farbaek's key and said nothing. ADR 0125 says such a key fails closed | `src/server/chat/setup.ts` |
| A working step marked failed | A run keeps its task at `CONTRACT_APPROVED` until it has a change. The hourly sweep read that as "ended without a change" and stopped the workflow | `src/server/workflows/orchestrator.ts` |
| One step settled an hour | The sweep looked at one step in progress per workflow, so a team's other steps waited | `src/server/workflows/wiring.ts` |
| Abandoned runs stayed "working" | A run whose server restarted was marked interrupted only when someone opened Home or the run's page | `src/server/jobs/hourly.ts` |
| Secrets could reach a model | The agent's file reading and search had no screening, so a local `.env` or key file could be sent in a prompt. A command's output wasn't screened either | `src/agent-runtime/workspace.ts`, `loop.ts` |

## AI providers, models and routing

**What works**
- **Three providers:** Claude (drafting, proposals, reviews, the agent gateway, Chat), OpenAI (Chat, the second check, the studio's first image engine) and Gemini (drafting, images, the only video engine).
- **Chat's router** (`src/core/chat/intelligence.ts`): reads the question's kind and difficulty, tries up to three candidates, falls back to the other provider only when nothing was written yet, and routes round a provider that is failing.
- **Metering:** every call reserves, then settles to its real cost or is refunded (`ai_credit_ledger`). A platform daily cap, spend alerts at 80% and 100%, and per-run caps.
- **A workspace's own Claude key**, optionally behind a company gateway (ADR 0125).
- **Evaluation:** measured floors for web research decisions, Sinhala and Singlish reading and citations, with no model involved. A three-task canary compares Claude models before a switch.

**What's partial**
- **Several interfaces, not one adapter:** `ChatModel`, `ContractDrafter`, `ChangeProposer`, `GatewayModel`, `StudioImageEngine`, `ImageGenerator`, `VideoEngine`, `SecondChecker`, `SearchProvider`.
- **The model list is in four places:** `src/core/agent/routing.ts`, `src/core/chat/ladder.ts`, `src/core/billing/model-names.ts` and `rate-card.ts`. No capability, status or retirement date is recorded.
- **Failover** covers Chat only, in one server's memory. Drafting, the gateway, the studios and video have none.
- **Why a model was chosen** is shown in Chat. The agent router says so only when the plan capped it.

**What's missing**
- A provider-independent registry with capabilities, status and dates.
- xAI and Grok: no adapter, no key, no mention.
- A benchmark of live models on Farbaek's own tasks, with cost per finished task and Sinhala.
- A workspace's own list of allowed providers.
- Embeddings, and speech on the server (voice is the browser's own).

**Stale or duplicated (as reported)**
- `GEMINI_MODEL` and `geminiModel()` are used only in tests.
- Two routers share tiers; the studio's prompt refiner uses the agent router for a Chat job.
- Two image paths: Chat and project files use Gemini only, the studio prefers OpenAI.
- Two circuit breakers with different settings (Chat's and search's).
- `.env.example` describes `OPENAI_API_KEY` as the second check only; `production.env.example` doesn't list it; three image and video model settings are undocumented.

## Agents, automation and secure execution

**What works**
- **Cloud runs** (ADR 0022): a contributor with the run permission, a task with an approved contract, one live run per task, 40 minutes, a usage cap, cancel, and stop on pause.
- **Desktop runs:** Review Only and Controlled modes, every command asks first, folder guard against links, an environment allowlist, the token in the system's safe storage.
- **Workflows** (ADR 0092, 0128): 2 to 8 steps, each a task with its own contract, checkpoints, teams of up to 3, a usage ceiling, bound to a hash on approval.
- **Autonomy levels** 0 to 4, earned and budgeted, with sensitive files always sent to a person, enforced in TypeScript and in the database.
- **Sandboxes:** Vercel Sandbox live, network denied by default, limits per plan, a sweep, an egress ledger.
- **Proof:** contracts bound by hash, signed and chained ProofPacks, sandbox receipts, the audit log, undo file by file.

**What's partial**
- **Run state lives in the web server's memory.** A restart ends live runs, and the server can restart on any deploy. The hourly job now marks them interrupted; it doesn't resume them.
- **A pause reaches the server it was pressed on.** Runs held by another process are stopped when they next check.
- **Scheduled work** exists only for the operator: systemd timers for hourly jobs, sweeps, backups and checks.
- **The only queue with retries and dead letters** is for payment webhooks.
- **The rules for computer tasks** (`src/core/agent/computer/`) are written and tested, and nothing calls them yet (ADR 0225).

**What's missing**
- Persistent agents: a long-term goal, a schedule, a budget, its own memory, pause, resume and stop.
- A scheduler and triggers a person can set, including webhooks in.
- Creating a workflow from words, a visual builder, conditions and branches.
- Durable execution for agent work: saved state, retries, timeouts, checkpoints, limits on how many run at once.
- One command center, with one pause.
- A browser for agents in an isolated environment.
- Connectors to outside apps such as email, calendar, files and chat. There are no webhooks out.

**Stale or duplicated (as reported)**
- Two run state machines: the desktop's (`src/core/agent/operations.ts`) and the cloud's (`cloud-run.ts`).
- `transition()` in `task-machine.ts` is used only in tests; the database enforces task changes on its own.
- `farbaek-jobs.service` still calls itself "trial reminders".
- `/api/internal/jobs/trial-reminders` is kept for old copies of `jobs.sh`.
- ADR 0006 still lists dead-lettering as an open need.

## Plans, billing, analytics and security

**What works**
- **One pricing source** (`src/core/billing/catalog.ts`): Free, Lite $1, Maker $1.99, Starter $9.99, Plus $19.99, Pro $50, Studio $79.99, Max $100, Max 2x $200, Max 3x $300, Enterprise by contract, with a 14-day trial and top-ups.
- **The allowance formula** (`allowance.ts`) already aims at 57%: price, less the payment provider's worst-case fee, a fixed share, snapshots and sandbox time, becomes AI usage.
- **Payments are live on the web** (Dodo since 2026-10-29): checkout, portal, upgrade now, downgrade at period end, cancel, signed and deduplicated webhooks. Apple and Google Play purchases up to Pro.
- **Entitlements are checked on the server**, in TypeScript and in the database (usage, seats, trial, sandbox minutes).
- **Security:** row-level security with service-only writes, cross-workspace tests per table, sign-in limits and Turnstile, a token vault, an audit log, nightly backups with a weekly restore test, a security evaluation of 43 scenarios mapped to OWASP (all passed on 2026-11-12), and a threat model outline.
- **Staff numbers:** signups, activation in 7 days, active workspaces, AI usage by day, run outcomes, MRR, trial to paid, an estimated margin.

**What's partial**
- **The margin is a worst case per plan,** assuming 200 subscribers. It leaves out rollover, Free users, trials and Survey Studio's free AI, and has no heavy-user model.
- **The app's content security policy is report-only** unless `APP_CSP_ENFORCE=1`.
- **Backups aren't encrypted.**
- **Customers have no second factor or passkeys.** Staff do.
- **Studio storage is 500 MB a person,** the same on every plan.

**What's missing**
- The brief's price anchors and a limit for each kind of use (messages, research, images, video, voice, agents, automations, storage).
- A blended unit-economics model with payment fees, store commissions and heavy users.
- Product analytics: active people by day, week and month, retention, churn, ARPU, cost per finished task.
- An investor report that separates actuals from forecasts.
- Threat models per asset.
- A workspace's own data and provider policy.

**Stale or inconsistent (as reported)**
- `docs/billing/go-live.md` says payments are not connected at the top and live further down.
- `docs/billing/usage.md` lacks the chat, image and video operations and their models.
- Lite costs $0.99 on Apple and $1.00 on the web and Google Play.
- The trial gives 3 seats on Pro's features; Pro has 2.
- `production.env.example` still ships `BILLING_MODE=not_connected`.
- No server check was found for the `team_collaboration` and `advanced_approvals` features.

## Frontend, design and the apps

**What works**
- **A token-based design system:** 42 colour tokens, checked for contrast; pills, radii, titles and spacing from shared files; 17 design tests.
- **Chat's dark theme** overrides 34 tokens, scoped to Chat's own root, chosen by the person.
- **Responsive and accessibility audits** that fail on sideways scroll, small targets, lost taps and nameless controls.
- **The apps:** a native SwiftUI iPhone app (1.0.0 live), an Android app that shows the site in Chrome with native purchase, share and nearby screens (closed testing), and an Electron desktop agent for Windows, Mac and Linux.

**What's partial**
- **Dark mode stops at Chat.** The image and video studios and the workbench use Chat's frame and never set the theme. Tokens forbid a dark scheme by test. The iPhone app is pinned light.
- **Five navigation systems:** the app shell, Chat's and the studios' own frames, the public site, the office and an older admin console. Home is Mission Control, not Chat. Chat isn't a phone tab.
- **Two button systems:** 177 files use `ui/button.tsx`; 24 draw their own pills. Chat has its own dialog, menu and toast.
- **Light is assumed** by shadows, 11 `bg-white` uses, 89 hex values in 9 files (showcase and films mostly), the survey sheet's paper and the PWA's theme colour.

**What's missing**
- A product-wide dark mode as the person's choice.
- Standard, Advanced and Professional modes.
- Any assistant integration in the phone apps: no App Intents, Siri, widgets or Action Button on iPhone; no assistant role, App Functions or shortcuts file on Android.
- Public pages for docs, the API, a changelog, about, contact and help.

**Stale or inconsistent (as reported)**
- "Build" opens `/app/build`, `/app/new` or `/app/workbench`, depending on where it's pressed.
- CLAUDE.md names four spaces; `spaces.ts` lists six.
- `current-state.md` says the iPhone app isn't compiled; it is live.
- `docs/mobile/android.md` says version 1.1.0; the build is 1.4.0.
- The audits never visit `/office`, `/admin` or `/bot`.

## Skills

`FARBAEK_SKILLS_INVENTORY.md` lists the 113 installed skills, what each teaches, and where each disagrees with Farbaek's own rules. Three things matter for this work:

- **Python.** Seven of the eight film skills, one design skill's search tool and the skill builder's tooling need Python, which this PC doesn't have.
- **Paid generation.** Five skills need a paid image or video model.
- **Rules that disagree.** Several design skills ban pure white, follow the system theme by default, or require eyebrows, blur and serif type. Farbaek's own rules win, and `farbaek-ui` needs dark mode added before the redesign.

No installed skill covers durable automation, model routing and evaluation, unit economics, phone assistant integration, or threat modelling.

## Research in hand

Notes are in `research_notes/Frontier AI platforms and APIs 2026/` (never committed).

| Note | State on 2026-11-22 |
| --- | --- |
| OpenAI Dots and Meta Muse | Complete |
| xAI, Grok and the X API | Complete |
| OpenAI platform and ChatGPT | Cut off by the usage limit, partial |
| Anthropic platform and Claude | Cut off, partial |
| Gemini and Antigravity | Cut off, partial |
| What a phone assistant may do | Cut off, partial |
| Subscription prices and costs | Cut off, partial |

The study of the reference products in a browser, with screenshots, hasn't started.
