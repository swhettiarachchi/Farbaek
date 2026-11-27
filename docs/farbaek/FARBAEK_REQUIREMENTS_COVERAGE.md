# Farbaek requirements coverage

Every section of the owner's two master briefs, checked against what Farbaek has. Written 2026-11-23, after both briefs were read again in full: "FARBAEK — The Ultimate Hyper Intelligence Ecosystem" (34 sections, called **A** below) and "FARBAEK — Master Build Directive" (21 sections, called **B**).

**Why this exists.** The earlier plan (`FARBAEK_IMPLEMENTATION_PROGRESS.md`) covered only part of the briefs. Telepathy, the Research and Audio studios, the three modes, the X connector, the benchmark engine, new skills and several documents were not on it, so progress was reported against a smaller list than the owner wrote. This page is the full list. A line says **Done** only when it is merged and has a test or a check behind it.

**Updated 2026-11-25** for stages 271 to 273: scheduled tasks (ADR 0278), usage given back when a call is cut off (ADR 0279), and scheduling from Chat (ADR 0280). The counts in "In short" are as first written on 2026-11-23, except where a line says otherwise; the sections below are current.

**The words used:**
- **Done:** built, merged and checked.
- **Partly:** some of it works; what is missing is named.
- **Not started:** nothing built yet.
- **Waiting on the owner:** needs a key, an account, money or a decision only the owner can give.

## In short

The 55 sections of the two briefs cover 32 subjects; many sections of B repeat sections of A. Counted by subject, strictly (a subject with anything missing is "Partly"):

| | Subjects |
| --- | --- |
| Done | 3: the existing core modules kept and in use (A21), billing for today's plans (A28), checkpoints between sessions (B21) |
| Partly | 28 |
| Not started | 1: Grok, X search and the X connector (B9), which waits on the owner's xAI key |
| Waiting on the owner | an xAI key and budget, an X developer account, a paid video key, the price decision, and the DNS fault at Spaceship |

Inside the "Partly" subjects, whole parts are also not started: the Audio Studio, the phone voice assistant, the visual workflow builder, triggers other than time, the investor report, and most of Telepathy. (Schedules were on this list until stage 271, and the three modes until stage 285.)

The largest gaps, by the briefs' own priority: **automation and persistent agents** (A12, A13, B6, B7), the **voice assistant on phones** (A15, B8), **Grok and X** (B9), **Telepathy** (A16), and **redesigning the inside of every page** (A23, B4).

## Section by section

### A0 Mission and A1 authority: Partly

The whole transformation is under way, not finished. The approval rules (production, destructive data, irreversible migrations, live billing, purchases, publishing, new providers) have been followed: no live price changed, no migration applied by Claude, merges and deploys are the owner's.

### A2 and B2 Repository discovery: Partly

| Item | State |
| --- | --- |
| `FARBAEK_MASTER_AUDIT.md` | Done (2026-11-22, four audits, five faults fixed in stage 209) |
| `FARBAEK_FEATURE_INVENTORY.md` | Not written. `docs/architecture/current-state.md` holds most of it |
| `FARBAEK_ROUTE_INVENTORY.md` | Not written. The responsive audit lists the routes but not their 14 facts each |
| `FARBAEK_EXISTING_ARCHITECTURE.md` | Not written |

### A3, B1 Reference research: Partly

| Item | State |
| --- | --- |
| ChatGPT, Claude, Antigravity, Dots, Muse studied in a browser | Done at desktop width: 46 real screenshots in `research/reference-screenshots/`, `FARBAEK_REFERENCE_RESEARCH.md`, `FARBAEK_CHATGPT_STUDY.md` (seven conversations read, nine tests) |
| xAI (B1) studied in a browser | Not done. Its API was researched (`research_notes/`), its site wasn't visited |
| Phone and tablet widths of the signed-in apps | Not done: Chrome's window couldn't be narrowed |
| One document per platform (`FARBAEK_CLAUDE_RESEARCH.md`, `_DOTS_`, `_MUSE_`, `_ANTIGRAVITY_`, `_ADDITIONAL_PLATFORMS`) | Not written. Two research notes complete, five partial (cut off by a usage limit) |
| A reference registry for new URLs | Not written. The briefs' "Additional reference" slots were left blank |
| Claude in Chrome checked (A3.3) | Used throughout; its version and file upload weren't recorded |

### A4 ChatGPT: Partly

Studied and tested in the owner's signed-in ChatGPT. The OpenAI API research note is partial. **A4.2 images from ChatGPT for Farbaek:** one picture was generated (a clock with task cards, meant for an empty state). It hasn't been brought into the product.

### A5 Dots and A13, B7 Persistent personal agents: Partly

Research complete. Part 1 is built (stage 275, ADR 0282): an agent with a name, a lasting goal, a schedule, a limit on its runs in any 30 days, notes of its own that carry from run to run and that the person can read and clear, a switch for the person's memory, progress run by run, and pause, resume, work now and remove. It lives on the Agents tab of the Scheduled page. **Not built:** a budget in AI usage and the cost of each agent, agents that use tools or act on a computer, more than one piece of work for an agent, talking to an agent with its goal in mind, a character or face. **No agent has run on production yet.**

### A6, A14 Secure work environment (Muse): Partly

| Item | State |
| --- | --- |
| Sandboxed code execution | Done: Vercel Sandbox, network off by default, limits per plan |
| Desktop agent with a folder guard, every command asking first | Done |
| Token vault for connected accounts | Done |
| Rules for a task on a person's computer (browser, files) | Written and tested, not wired to anything (ADR 0225) |
| Isolated browser for agents, persistent workspace, credential vault for connectors, one task timeline | Not started |

### A7 Agent command center (Antigravity): Partly

A first version is built (stage 276, ADR 0283): the All work page lists the agent's builds, changes waiting for a yes or no, workflows, scheduled tasks and agents in one place, sorted into needs you, in progress, scheduled and just finished, with the workspace's one pause (which stops scheduled work too since stage 275). Home shows scheduled work in one card and leads with a task Farbaek paused (ADR 0281). **Not built:** each agent's tools, stage and cost in its row; acting from the row (every row opens its own page); the paired desktop agents; an owner's view of other members' work.

### A8 Claude ecosystem: Partly

Claude is integrated, with a workspace's own key and a company gateway. Farbaek keeps its own orchestration, memory, policies, audit and interface. The Anthropic research note is partial.

### A9, B3 Skills: Done for the inventory, Not started for new skills

`FARBAEK_SKILLS_INVENTORY.md` lists 113 skills, what each teaches and where each disagrees with Farbaek's rules. Skills were loaded and applied each stage. **B3 asks for new skills where none fits:** durable automation, model routing and evaluation, unit economics, phone assistants and threat modelling have no skill. None has been written.

### A10, B5 Model intelligence: Partly

| Item | State |
| --- | --- |
| A10.1 dated snapshot of current models | Partly: 7 of 14 prices carry the day they were read |
| A10.2 registry | Partly (stage 213): provider, what it makes, uses, tiers, price date. Missing: version, release date, status, context, output limits, latency, reliability, rate limits, privacy, retirement |
| A10.3 benchmark engine | Partly: measured floors for Sinhala and Singlish reading, web research decisions and citations; a canary for Claude switches. Missing: tasks across reasoning, coding, research and tools on every model, with cost per finished task |
| A10.4 router | Partly: Chat climbs a price ladder across Claude and OpenAI, a person can pick the model, and Chat says why. The build agent has its own router. Neither reads the registry yet; no workspace list of allowed providers |
| A10.5 resilience | Partly: failover and circuit breakers in Chat and search only |
| xAI and open-weight models | Not started |

### A11, B5 Intelligence core: Partly

Present: identity, conversations, memory, metering and usage, approvals, audit, ProofPack, billing, a research engine, file handling. Missing: one tool registry, a context engine shared by all spaces, knowledge retrieval (embeddings), an integration registry, and documented boundaries between them (`FARBAEK_INTELLIGENCE_ARCHITECTURE.md`, `FARBAEK_PRODUCT_ARCHITECTURE.md` not written).

### A12, B6 Full automation: Partly, and the largest gap

| Item | State |
| --- | --- |
| Multi-step workflows, each step a task with its own approved plan, teams of up to three, a usage ceiling | Done (ADR 0092, 0128) |
| A workspace-wide pause | Done |
| A task from natural language | Partly: a scheduled task is an instruction in plain words, its schedule read from them (English, Sinhala, Sinhala in English letters), and Chat offers, under an answer, to schedule a request said with a time (ADR 0278, ADR 0280). A multi-step workflow written from words: not started |
| Visual workflow builder | Not started |
| Time triggers, schedules, recurring tasks | Partly: built, merged and live since 2026-11-25 (ADR 0278): once, hourly, daily, weekdays, chosen days, monthly, in the person's time zone; pause, resume, run now, change, remove; a history of runs; email and push. **No real run has been made on production yet**, and the every-minute timer waits for the owner |
| Event triggers, webhooks in, app triggers | Partly: a webhook in is built (stage 277, ADR 0284): one secret link for a task or an agent, which queues a run and can hand it a little text as data. Triggers from inside Farbaek and from connected apps: not started |
| Conditions, loops with limits | Not started |
| Durable execution that survives a restart, retries, dead letters, checkpoints, idempotency | Partly: scheduled runs are claimed once under a lease in Postgres, retried twice, given ten minutes, and the task pauses itself after five that didn't finish (ADR 0278). Usage reserved by a call a restart cut off is given back each hour (ADR 0279). Agent builds and workflows still hold their run in the web server's memory for at most 40 minutes; no checkpoints inside a run |
| Autonomy levels (Observe to Delegated) | Partly: the build agent has levels 0 to 4; automations have none |
| Command center | Partly: the All work page and one pause (ADR 0283). Cost and acting from a row are not built |

### A15, B8 Universal voice assistant: Partly in the browser, Not started on phones

| Item | State |
| --- | --- |
| Dictation and read aloud in Chat (the browser's own speech) | Done |
| Survey Studio's voice drafting assistant | Done |
| Floating assistant, orb, quick actions | Partly: a microphone button beside the sidebar's search box opens the palette listening, and the palette hands a question, typed or spoken, to Chat (stage 289, ADR 0297). No answer in place, no quick actions that do work, no orb |
| Android: assistant role, App Functions, shortcuts, foreground service | Not started |
| iPhone: App Intents, Siri, Shortcuts, Action Button, widgets, Live Activities | Not started |
| Sinhala speech recognition and voice on the server | Not started (research report written: `reports/Voice drafting assistant technology.md`) |
| `FARBAEK_VOICE_ASSISTANT.md`, `_ANDROID_SPEC`, `_IOS_SPEC` | Not written |

### A16 Telepathy: Partly

| Item | State |
| --- | --- |
| Relevant memory, from words the person typed | Done (stage 207) |
| Memory controls: read, delete, switch off | Done |
| Intent understanding | Partly: Chat tells research questions, computer requests and the language written in |
| Next-step recommendations | Partly: Home shows what waits for you, a new workspace's first steps, and, when nothing waits, one suggestion from the person's tasks and live sites (stage 283, ADR 0291). By fixed rules; nothing yet from Chat's history or inside the spaces |
| Project awareness | Partly: a chat filed under a project is told its files and tasks by name, each task's state and whether its site is live (stage 282, ADR 0290). It does not read what is inside a file, and the studios are not told |
| Personalised context across spaces | Partly: what a person asked Farbaek to remember goes to the plans Build drafts for them, under the same switch (stage 284, ADR 0292). Not to the build agent itself, the studios or the phone apps |
| Goal tracking, proactive suggestions, decision support | Not started |
| Explanation of suggestions and user corrections | Partly: every suggestion on Home says why, from the record it came from, and can be put away for a week or switched off by kind (stage 283). Kept in the browser, so it doesn't follow the person across devices |
| The named systems (IntentSense, MindMemory, FutureSense, ContextVision, DecisionMind, AgentSync, LifeFlow, IntentProof) | Not started |

### A17 Sinhala and multilingual: Partly

Done: a language layer that reads Sinhala script, Singlish and other languages typed in English letters, answers in the person's language, and has measured test cases (ADR 0221); web research reads Sinhala into search words. Live checks on 2026-11-17 worked for Singlish and five other languages. Missing: Sinhala voice, and a measured score for answer quality (the floors measure reading, not answers).

### A18, B4 Chat experience: Done, with the three modes in a first version

Done: history with search, sidebar, composer, streaming, stop, model choice with the reason shown, files, images, dictation, read aloud, web research with numbered citations checked against the pages, filing under projects, edit, branches, try again, copy, good and bad feedback, sharing, memory, Markdown, code and maths. News and updates are answered as a dated roundup of stories with their pages' pictures (stage 278, ADR 0285; to be checked with a live model after its merge). Still plain text: comparisons with pictures, places, numbers as charts. **The Standard, Advanced and Professional modes** are built in a first version (stage 285, ADR 0293): a person's choice of how many tools the menus list and whether Chat lists its models, with Standard until they choose. It is never a lock: search and addresses reach everything. Not yet: Settings, Build's workspace, the studios and the apps reading the level, and the choice kept with the account instead of the browser.

### A19, B11 Studios: Partly

| Studio | State |
| --- | --- |
| Research Studio | Partly: a Research place lists everything a person has researched, from the record each answer keeps, and starts a piece of research in Chat (stage 288, ADR 0296). No report saved on its own, no search of the list, no monitoring on the page, no project knowledge base, no X research |
| Image Studio | Done: from words, editing your own pictures, references, a library, download |
| Video Studio | Built, Waiting on the owner: no paid video key, so it can't make a video |
| Audio Studio (transcription, speech, translation) | Not started |
| Vibe coding (sites and apps, previews, checks) | Done |
| Developer studio (file tree, editor, preview, output, GitHub) | Partly: Build's workspace has them; no terminal in the browser, no diff view of every change in one place |
| Documents, presentations, data analysis (B11) | Not started as tools; Chat can write documents |

### A20 Multi-agent network: Partly

A second check by another provider, and workflow teams of up to three, exist. The named specialist agents, each with its model, tools, budget, risk level and audit, do not.

### A21, B12 Farbaek Core and RealityLoop: Done (kept and in use)

Plans bound by hash, approvals, ProofPack, receipts, undo, history, the rules engine, moving projects and the desktop agent are in use. They were not re-audited module by module against the 13-step principle in this program.

### A22, B4 Crystal White design system: Partly

| Item | State |
| --- | --- |
| Crystal White tokens, contrast tested | Done |
| Dark Mode for every page, not an inversion | Done: the signed-in app (stage 211), the public site (#282) |
| One window frame for every signed-in page | Done (#280, #283) |
| Professional colours, warm white, refined neutrals | Partly: whites are cool, and four bright space colours plus a three-colour headline go beyond "refined neutral". The owner was asked on 2026-11-23 |
| The mascot | Changed on the owner's instruction (2026-11-22): the plain black cat replaced the cat knight in black-and-gold armour. The briefs still describe the knight |

### A23, B4 Every page redesigned: Partly

| Area | State |
| --- | --- |
| Home (main screen) | Done: a greeting and one box that asks or builds |
| Navigation | Partly: shorter sidebar, five phone tabs, Build starting in one place (stage 286) and one list of places drawn in every frame (stage 287). The app's frame and Chat's are still two sidebar components |
| The pages inside the app (Projects, Tasks, Approvals, Workflows, Agents, Integrations, Settings, Billing and others) | Partly: they have the new frame and Dark; their content wasn't redesigned |
| Public: homepage, spaces, pricing, security, privacy, legal, sign-in | Partly: Dark added; not redesigned in this program |
| Public: features, solutions, docs, API docs, about, contact, help, changelog | Not started (these pages don't exist) |
| App sections that don't exist yet | Partly: Scheduled exists, with Tasks and Agents (stages 271 and 275). Research exists (stage 288). Audio, Voice, Telepathy and MCP have no section yet |

### A24 Mobile: Partly

The website is built phone first and checked at phone sizes by audit. The iPhone app (1.0) is live, the Android app is in testing, the desktop app is live. None of the apps has the new look, Dark, or any assistant integration. Nothing has been checked on a real phone in this program.

### A25, B13 APIs and backend correctness: Partly

Writes go through typed use cases and checked database functions, and 4,300 tests run on every change. Missing: an API audit of every route (`FARBAEK_API_AUDIT.md`), OpenAPI documentation, end-to-end tests of the main journeys, a queue with retries beyond payments.

### A26, B14 Enterprise security: Partly

Done: row-level security, cross-workspace tests per table, sign-in limits and Turnstile, a token vault, an audit log, nightly backups with a weekly restore test, 43 OWASP-mapped scenarios passing, untrusted web pages and files kept away from instructions. Missing: a second factor or passkeys for customers, encrypted backups, the app's content policy enforced (it reports only), threat models per asset, `FARBAEK_SECURITY_REVIEW.md`.

### A27, B15 Plans and the 57% margin: Partly

| Item | State |
| --- | --- |
| The five prices worked out in code, with both margins and scenarios | Done (#281, `FARBAEK_SUBSCRIPTION_ECONOMICS.md`) |
| Free and Enterprise rows | Not started |
| An entitlement for each of the 26 kinds of use (messages, research, images, video, voice, agents, workflows, schedules, browser, connectors, storage, seats) | Not started: today one pool of AI usage |
| Average, median, 90th and 95th percentile and extreme users | Not started: the model has full use and one assumed share |
| Costs of features not built (X search, voice, agents, video) | Not started: they come in as each feature is built |
| Churn, retention, upgrades, operating costs | Not started |
| `FARBAEK_SUBSCRIPTION_STRATEGY.md`, `_UNIT_ECONOMICS`, `_FINANCIAL_MODEL` | Not written (one economics page covers part) |
| The new prices live | Waiting on the owner |

### A28 Billing: Done for today's plans

Live on the web since 2026-10-29: checkout, renewal, upgrade, downgrade, cancel, signed webhooks, top-ups, usage metering, access only after payment; Apple and Google Play purchases. The new plans follow the owner's price decision.

### A29, B16 Investor-ready: Partly

Staff see signups, activation in 7 days, active workspaces, AI usage by day, run outcomes, MRR and trial to paid. Missing: daily, weekly and monthly active people, retention, churn, ARPU, cost per finished task, feature adoption, and an investor report that separates actuals from forecasts (`FARBAEK_INVESTOR_READINESS.md`).

### A30, B17 Unmentioned features: Partly

The audit found and fixed five real faults; two fresh reviews this program found twelve more, all fixed. The briefs ask for a record of each improvement in ten parts; that hasn't been kept in that form.

### B9 X and xAI: Not started, Waiting on the owner

No Grok models, no X search, no X account connector. Needs an xAI account and key with a monthly budget, and separately an X developer account for the connector. The research found $5 per thousand posts fetched by X search.

### B10 Research and knowledge: Partly

Done: live web research only when a question needs it, two rounds for a deep task, numbered sources checked against the pages, a self-hosted search engine and a locked-down page reader, and a roundup of news read from the newsrooms' own feeds and written in depth (stages 278 and 280). Missing: X research, saved research, scheduled monitoring, credibility scores, project knowledge.

### B19 Testing: Partly

Done: unit, database, security and design tests on every change; responsive and accessibility audits of every route; browser checks of each change. Missing: end-to-end tests of whole journeys, performance tests beyond phone vitals, provider tests against live services, real devices, `FARBAEK_TEST_REPORT.md`.

### B21 Checkpoints: Done

Each stage has its record in `docs/stages/`, and the program's state is kept between sessions.

## The documents the briefs ask for

| Document | State |
| --- | --- |
| `FARBAEK_MASTER_AUDIT.md`, `_SKILLS_INVENTORY`, `_REFERENCE_RESEARCH`, `_DESIGN_SYSTEM`, `_MODEL_REGISTRY` (the "frontier model registry"), `_SUBSCRIPTION_ECONOMICS`, `_IMPLEMENTATION_PROGRESS` | Written |
| `FARBAEK_CHATGPT_RESEARCH.md` | Written as `FARBAEK_CHATGPT_STUDY.md` |
| `FARBAEK_REQUIREMENTS_COVERAGE.md` | This page |
| `_FEATURE_INVENTORY`, `_ROUTE_INVENTORY`, `_EXISTING_ARCHITECTURE`, `_REFERENCE_REGISTRY`, `_CLAUDE_RESEARCH`, `_DOTS_RESEARCH`, `_MUSE_RESEARCH`, `_ANTIGRAVITY_RESEARCH`, `_ADDITIONAL_PLATFORMS`, `_MODEL_BENCHMARKS`, `_INTELLIGENCE_ARCHITECTURE`, `_PRODUCT_ARCHITECTURE`, `_AUTOMATION_ARCHITECTURE` (or `_AUTOMATION_SPEC`), `_PERSISTENT_AGENTS` (or `_AGENT_RUNTIME`), `_SECURE_EXECUTION`, `_VOICE_ASSISTANT`, `_ANDROID_SPEC`, `_IOS_SPEC`, `_XAI_INTEGRATION`, `_API_AUDIT`, `_SECURITY_REVIEW`, `_SUBSCRIPTION_STRATEGY`, `_UNIT_ECONOMICS`, `_FINANCIAL_MODEL`, `_INVESTOR_READINESS`, `_TEST_REPORT`, `_REMAINING_ISSUES` | Not written. Each is written with the stage that builds its subject, never ahead of it |

## The full order of work

Everything not done, in the order that lets each part stand on the one before. Items in bold were missing from the earlier plan.

1. Done on 2026-11-23: the DNS at Spaceship (the owner).
2. Durable work: done for scheduled runs (stage 271) and for usage a restart left reserved (stage 272). Still to do: agent builds and workflows out of the server's memory, with checkpoints.
3. Automation: schedules are built (stage 271), Chat offers them (stage 273), and a link starts a task from another app (stage 277). Still to do: triggers from inside Farbaek and from connected apps, workflows from words, a visual builder, conditions.
4. Persistent agents: part 1 is built (stage 275): name, goal, schedule, a limit in runs, notes of its own, the memory switch, progress, pause, resume, remove. Still to do: a budget in AI usage, tools, more than one piece of work, talking to an agent.
5. One command center with one pause: a first version is built (stage 276, All work). Still to do: each thing's cost, acting from the row, an owner's view of everyone's work.
6. **Telepathy part 1:** project awareness in Chat (built in stage 282, by names and states), suggested next steps with their reasons and corrections (built in stage 283, on Home), memory reaching Build's plans (built in stage 284), one memory across spaces, suggested next steps with "why this" and corrections.
7. **The three modes:** a first version is built (stage 285): the menus' tools and Chat's list of models follow the level. Still to do: Settings, Build's workspace, the studios and the apps reading it; the choice kept with the account.
8. Build starting in one place: built (stage 286, ADR 0294). One list of places in every frame: built (stage 287, ADR 0295); still to do there, one sidebar component for the app's frame and Chat's, and the list in Build's workspace on a phone. **The professional-colours pass** waits for the owner's answer.
9. **Redesign the content of every page** in the app and on the public site; **the missing public pages** (features, docs, API docs, about, contact, help, changelog).
10. The routers reading the registry; failover beyond Chat; **the benchmark engine** with cost per finished task; the registry's missing fields.
11. Grok, X search and the X connector (needs the owner's xAI key, budget and X developer account).
12. **Research Studio:** a first step is built (stage 288): the list of a person's research and a box that starts one. Still to do: reports saved on their own, monitoring, project knowledge.
13. **Audio Studio:** transcription, speech, translation; then Sinhala voice.
14. The voice assistant: a first step on the web is built (stage 289): asking from any page by voice or typing. Still to do: answers in place, quick actions, then iPhone and Android through their supported features.
15. **Secure work environment:** an isolated browser for agents, a persistent workspace, a credential vault for connectors, one task timeline.
16. **Specialist agents** with their own model, tools, budget, risk level and audit.
17. Plans: an entitlement for each kind of use, usage percentiles, Free and Enterprise, the financial model and strategy; then the new prices live (the owner).
18. Product analytics and the investor report.
19. Security: second factor for customers, encrypted backups, the content policy enforced, threat models.
20. **New skills** where none fits: automation, routing and evaluation, unit economics, phone assistants, threat modelling.
21. The apps: new look, Dark, assistant integration.
22. API audit, end-to-end journey tests, real-device checks, the test report and the remaining-issues list.
