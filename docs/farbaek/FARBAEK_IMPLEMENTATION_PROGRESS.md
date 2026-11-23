# Farbaek implementation progress

The running record of the program the owner set on 2026-11-22. Read this first in a new session. Each stage's detail is in `docs/stages/stage-N.md`; what exists today is in `FARBAEK_MASTER_AUDIT.md` and `docs/architecture/current-state.md`.

**The full list is `FARBAEK_REQUIREMENTS_COVERAGE.md`:** every section of both briefs, what is done, partly done and not started, and the full order of work. The stage table below is the plan as it was first written; it left out Telepathy, the three modes, the Research and Audio studios, the X connector, the benchmark engine and new skills, which the coverage page adds.

**Rule for this file:** a line says "done" only when the work is merged or has a test or a live check behind it. Everything else says what it is waiting for.

## Where it stands (2026-11-23)

| Work | State | Waiting for |
| --- | --- | --- |
| Stages 206 to 208: research when needed, Chat memory, rules for computer tasks | Merged as #273 on 2026-11-22 and live | A read-back of migration v101 on production (`scripts/vps/check-migrations.ps1`), which this record has not seen |
| Stage 209: the audit and five faults fixed | Merged as #275 | The next desktop release, for its desktop fix |
| Stage 210: the black cat is the logo (ADR 0226) | Merged and live | New app releases for the icon on phones and the desktop |
| Stage 211: Dark for every signed-in page, beside Crystal White (ADR 0227) | Merged as #276 and live | Nothing |
| Stage 211, part 2: the public site in Dark, with the control in its footer (ADR 0232) | Built and tested, PR open | The owner merges |
| Stage 212, part 1: the main screen is a greeting and one box that asks or builds; Chat is a phone tab (ADR 0228) | Merged as #277 and #279, and live | Nothing |
| Stage 212, part 2: every signed-in page in one frame on wide screens, a shorter sidebar in the spaces' colours (ADR 0230) | Built and tested, PR #280 open | The owner merges |
| Stage 212, what is left: Chat, the studios and Build's workspace sharing the one frame component; "Build" opening one place; one plus menu in Chat | Not started | #280 first |
| Stage 213, part 1: one registry of the models Farbaek uses (ADR 0229) | Merged as #278 | Nothing |
| Stage 213, part 2: staff see which prices to read again, on the office's Models page | Built and tested, PR open. Not seen in a browser: the console needs a staff sign-in | The owner merges |
| Stage 213, what is left: both routers reading the registry; dating the seven prices that have no day | Not started | Nothing |
| Stage 218, part 1: the suggested prices worked out in code, with a page to decide from (ADR 0231) | Built and tested, PR #281 open | The owner merges, then decides the prices, monthly or yearly for the smallest plan, the hours and seats, and what each plan includes |
| Skills inventory, master audit, the study of the reference products | Written | Nothing |
| Research on providers and platforms | 2 of 7 notes complete, 5 partial | Finishing the 5, a few at a time |

The server was running main's latest build when checked on 2026-11-23 (`/api/health` asked at the server's own address).

## The order of work

The brief asks for everything. This is the order that makes each stage stand on the one before, with the reason for its place.

| Stage | What | Why here | Needs the owner |
| --- | --- | --- | --- |
| done in 209 | Study ChatGPT, Claude, Grok, Antigravity, Dots and Muse in a browser, with real screenshots (`FARBAEK_REFERENCE_RESEARCH.md`, `FARBAEK_CHATGPT_STUDY.md`). The five partial research notes are still to finish. Stage 210 became the new logo, which the owner asked for on 2026-11-22 | The brief asks for this before design decisions | Signing in where a product needs it |
| 211 | Crystal White and a dark mode for the whole product: dark values for every token, the person's choice saved once, contrast tests for both, and the places that assume light | The most visible gap, and it needs no new provider | Nothing. ADR 0008 changes, with its own ADR |
| 212 | One navigation: Chat as the simple home, the other tools as workspaces, "Build" opening one place, one button system | Five navigation systems confuse people today | Nothing |
| 213 | One model registry: every model's id, price, name, capabilities, status and dates in one place, read by both routers | Grok and failover both need it first | Nothing |
| 214 | Grok as a provider, and Live Intelligence: `x_search` and `web_search` with sources and times, topics to follow | The brief's real-time knowledge | An xAI key, a budget, and a yes to sending people's questions to a new provider |
| 215 | Durable work: run state out of the server's memory, and one queue in Postgres with retries, timeouts and dead letters | Scheduling and persistent agents can't stand on a 40-minute run in memory | Nothing. A migration |
| 216 | A scheduler and triggers people can set, and persistent agents with a goal, a budget and pause, resume and stop | The brief's highest priority | Nothing. A migration |
| 217 | One command center: what's running, waiting, failed and needs approval, with one pause | Follows 215 and 216 | Nothing |
| 218 | Plans: a blended unit-economics model for $3.99, $20, $50, $100 and $200, with a limit for each kind of use, then the catalog | Needs real cost numbers from stage 210's research | A yes before anything live changes: prices in Dodo, the App Store and Google Play |
| 219 | Product analytics in Office Space: active people, retention, churn, cost per finished task | Investors need actuals | Nothing |
| 220 | The voice assistant: App Intents, Siri and Shortcuts on iPhone; shortcuts and the assistant role on Android, as far as each system allows | Needs the phone research finished | App Store and Google Play submissions |
| 221 | Public pages: docs, the API, a changelog, about, contact and help | Small, and can go between larger stages | Nothing |

**Hardening that fits between stages:** enforce the app's content security policy, encrypt backups, a second factor for customers, and the stale documents the audit lists.

## What only the owner can do

- **Now:** apply v101 and merge #273. The line is in the PR.
- **For Grok (stage 214):** an xAI account and API key, and a monthly budget. The research found prices of $2 in and $6 out per million tokens for the flagship, and $5 per thousand posts fetched by `x_search`. It could not confirm that the API is offered in Sri Lanka; signing up is the test.
- **For new prices (stage 218):** a yes before live plans change.
- **For the desktop fix in stage 209:** publishing the next desktop release.
- **Python:** seven film skills and two tools need it, and this PC has none. Installing it is the owner's call.

## Decisions already taken in this program

- **Fix before building.** The audit's confirmed faults were fixed first (stage 209).
- **A workspace's own key is never left.** Chat stops, and doesn't fall back to another provider.
- **Research in small steps.** Seven researchers at once used up the session's usage limit on 2026-11-22. Research now runs a few at a time.
- **Records live here.** One folder, `docs/farbaek/`, and no second copy of what `current-state.md` and the ADRs already hold.

## Documents the brief asks for

| Document | State |
| --- | --- |
| `FARBAEK_MASTER_AUDIT.md` | Written, 2026-11-22 |
| `FARBAEK_SKILLS_INVENTORY.md` | Written, 2026-11-22 |
| `FARBAEK_IMPLEMENTATION_PROGRESS.md` | This file |
| `FARBAEK_REFERENCE_RESEARCH.md` | Written, 2026-11-22 |
| `FARBAEK_CHATGPT_STUDY.md` | Written, 2026-11-22: the owner's seven most recent ChatGPT conversations read for their shape, and nine direct tests |
| `FARBAEK_DESIGN_SYSTEM.md` | Stage 211 |
| `FARBAEK_MODEL_REGISTRY.md`, `FARBAEK_INTELLIGENCE_ARCHITECTURE.md` | Stage 213 |
| `FARBAEK_XAI_INTEGRATION.md` | Stage 214 |
| `FARBAEK_AUTOMATION_SPEC.md`, `FARBAEK_AGENT_RUNTIME.md` | Stages 215 and 216 |
| `FARBAEK_SUBSCRIPTION_ECONOMICS.md` | Stage 218 |
| `FARBAEK_VOICE_ASSISTANT.md` | Stage 220 |
| `FARBAEK_PRODUCT_ARCHITECTURE.md`, `FARBAEK_SECURITY_REVIEW.md`, `FARBAEK_API_AUDIT.md`, `FARBAEK_TEST_REPORT.md` | Written as their stages land; the security outline today is `docs/security/threat-model.md` |
