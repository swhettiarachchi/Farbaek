# Farbaek implementation progress

The running record of the program the owner set on 2026-11-22. Read this first in a new session. Each stage's detail is in `docs/stages/stage-N.md`; what exists today is in `FARBAEK_MASTER_AUDIT.md` and `docs/architecture/current-state.md`.

**Rule for this file:** a line says "done" only when the work is merged or has a test or a live check behind it. Everything else says what it is waiting for.

## Where it stands (2026-11-25)

| Work | State | Waiting for |
| --- | --- | --- |
| Stages 206 to 208: research when needed, Chat memory, rules for computer tasks | Merged as #273 on 2026-11-22 and live | A read-back of migration v101 on production (`scripts/vps/check-migrations.ps1`), which this record has not seen |
| Stage 209: the audit and five faults fixed | Merged as #275 | The next desktop release, for its desktop fix |
| Stage 210: the black cat is the logo (ADR 0226) | Merged and live | New app releases for the icon on phones and the desktop |
| Stage 211: Dark for every signed-in page, beside Crystal White (ADR 0227) | Merged as #276 and live | Nothing |
| Stage 211, part 2: the public site in Dark, with the control in its footer (ADR 0232) | Merged as #282 and live | Nothing |
| Stage 212, part 1: the main screen is a greeting and one box that asks or builds; Chat is a phone tab (ADR 0228) | Merged as #277 and #279, and live | Nothing |
| Stage 212, part 2: every signed-in page in one frame on wide screens, a shorter sidebar in the spaces' colours (ADR 0230) | Merged as #280, with #283 (the studios in the frame) and #285 (every page full screen) | Nothing |
| Stage 212, what is left: "Build" opening one place; one plus menu in Chat | Not started | Nothing |
| Stage 213, part 1: one registry of the models Farbaek uses (ADR 0229) | Merged as #278 | Nothing |
| Stage 213, part 2: staff see which prices to read again, on the office's Models page | Merged as #284. Not seen in a browser: the console needs a staff sign-in | Nothing |
| Stage 213, what is left: both routers reading the registry; dating the seven prices that have no day | Not started | Nothing |
| Stage 218, part 1: the suggested prices worked out in code, with a page to decide from (ADR 0231) | Merged as #281 | The owner decides the prices, monthly or yearly for the smallest plan, the hours and seats, and what each plan includes |
| Stage 271 (the order's 215 and 216, first part): scheduled tasks. A person writes what Farbaek should do and when; the server runs it as a Chat turn as them, once for each due time, with retries, a pause after five that didn't finish, a history of runs and a notice (ADR 0278) | Merged as #328 and live on 2026-11-25. Migration v106 applied the same day, after the merge, read-back `check|t`; the live page then read clean | The owner switches the every-minute timer on. A real run on production is the first live check |
| Stage 272: usage given back when a call is cut off by a restart, for every kind of call (ADR 0279) | Merged as #329. Migration v107 applied on 2026-11-25, read-back `check|t` | The hourly job's first result in the server's log |
| Stage 273: Chat offers to schedule a request said with a time, under its answer; every scheduled run tells the model it is one (ADR 0280) | Built and tested, PR open | The owner merges. No migration |
| Stage 274: Home shows scheduled work in one card and leads with a task Farbaek paused (ADR 0281) | Built and tested, PR open, stacked on stage 273's | The owner merges stage 273's first. No migration |
| Stage 275: agents that keep working toward a goal, on a second tab of the Scheduled page (ADR 0282) | Built and tested, PR #332 open. **Migration v108 to apply before the merge** | The owner applies v108, then merges. No agent has run on production |
| Stage 276: All work, one page for everything Farbaek is doing, with one pause (ADR 0283) | Built and tested, PR open, stacked on stage 275's | The owner merges stage 275's first. No migration |
| Stage 277: a link that starts a task or an agent from another app, the first trigger besides time (ADR 0284) | Merged as #334 and live (2026-11-26). **Migration v109 was not confirmed applied; v108 is still not applied** | The owner applies v108, then v109. No real call has been made |
| Stage 278: answers worth reading. A request for news is a dated roundup of stories with their pages' pictures, researched from several newsrooms (ADR 0285) | Merged as #335 and live (2026-11-26). The first live roundup found one readable story: the search gave front pages | Stage 280 |
| Stage 280: a roundup with depth, read from the newsrooms' own feeds, with room to write and a stronger model on paid plans, and offered every morning in one press (ADR 0288, ADR 0287) | Built, reviewed by a fresh agent (six faults fixed) and tested, PR open. No migration | Ask the owner's message on production after the merge and put the two answers side by side |
| Skills inventory, master audit, the study of the reference products | Written | Nothing |
| Research on providers and platforms | 2 of 7 notes complete, 5 partial | Finishing the 5, a few at a time |

The server was running main's latest build when checked on 2026-11-25 (`/api/health` showed the build of #327's merge). Survey Studio's AutoSurvey stages 222 to 270 (#286 to #327) were merged in between and are recorded in `docs/stages/`.

## The order of work

The brief asks for everything. This is the order that makes each stage stand on the one before, with the reason for its place.

| Stage | What | Why here | Needs the owner |
| --- | --- | --- | --- |
| done in 209 | Study ChatGPT, Claude, Grok, Antigravity, Dots and Muse in a browser, with real screenshots (`FARBAEK_REFERENCE_RESEARCH.md`, `FARBAEK_CHATGPT_STUDY.md`). The five partial research notes are still to finish. Stage 210 became the new logo, which the owner asked for on 2026-11-22 | The brief asks for this before design decisions | Signing in where a product needs it |
| 211 | Crystal White and a dark mode for the whole product: dark values for every token, the person's choice saved once, contrast tests for both, and the places that assume light | The most visible gap, and it needs no new provider | Nothing. ADR 0008 changes, with its own ADR |
| 212 | One navigation: Chat as the simple home, the other tools as workspaces, "Build" opening one place, one button system | Five navigation systems confuse people today | Nothing |
| 213 | One model registry: every model's id, price, name, capabilities, status and dates in one place, read by both routers | Grok and failover both need it first | Nothing |
| 214 | Grok as a provider, and Live Intelligence: `x_search` and `web_search` with sources and times, topics to follow | The brief's real-time knowledge | An xAI key, a budget, and a yes to sending people's questions to a new provider |
| 215 | Durable work: run state out of the server's memory, and one queue in Postgres with retries, timeouts and dead letters | Scheduling and persistent agents can't stand on a 40-minute run in memory | Done for scheduled runs in stage 271 (claimed under a lease in Postgres, retried, timed out at ten minutes, paused after five failures). Agent builds and workflows still hold their run in the server's memory |
| 216 | A scheduler and triggers people can set, and persistent agents with a goal, a budget and pause, resume and stop | The brief's highest priority | The scheduler is stage 271. Next: triggers other than time (a webhook in), then persistent agents. Each a migration |
| 217 | One command center: what's running, waiting, failed and needs approval, with one pause | Follows 215 and 216 | Nothing |
| 218 | Plans: a blended unit-economics model for $3.99, $20, $50, $100 and $200, with a limit for each kind of use, then the catalog | Needs real cost numbers from stage 210's research | A yes before anything live changes: prices in Dodo, the App Store and Google Play |
| 219 | Product analytics in Office Space: active people, retention, churn, cost per finished task | Investors need actuals | Nothing |
| 220 | The voice assistant: App Intents, Siri and Shortcuts on iPhone; shortcuts and the assistant role on Android, as far as each system allows | Needs the phone research finished | App Store and Google Play submissions |
| 221 | Public pages: docs, the API, a changelog, about, contact and help | Small, and can go between larger stages | Nothing |

**Hardening that fits between stages:** enforce the app's content security policy, encrypt backups, a second factor for customers, and the stale documents the audit lists.

## What only the owner can do

- **Now:** apply v108 and merge stage 275's pull request (#332), then stage 276's; switch the every-minute timer on (the line with the key is in the session notes: `ssh -i "$HOME\.ssh\farbaek_vps" farbaek@<server> "sudo bash /opt/farbaek/app/scripts/vps/install.sh --enable-scheduled-timer"`); then schedule one task a few minutes ahead and read its answer in Chat, the first real run, and start one agent.
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
| `FARBAEK_AUTOMATION_SPEC.md` | Written, 2026-11-25 (stage 271) |
| `FARBAEK_AGENT_RUNTIME.md` | With persistent agents |
| `FARBAEK_SUBSCRIPTION_ECONOMICS.md` | Stage 218 |
| `FARBAEK_VOICE_ASSISTANT.md` | Stage 220 |
| `FARBAEK_PRODUCT_ARCHITECTURE.md`, `FARBAEK_SECURITY_REVIEW.md`, `FARBAEK_API_AUDIT.md`, `FARBAEK_TEST_REPORT.md` | Written as their stages land; the security outline today is `docs/security/threat-model.md` |
