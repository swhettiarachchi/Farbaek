# Farbaek

From idea to verified software, with control at every step. The source of truth is `docs/FARBAEK_MASTER_SPEC.md`; current status is in `docs/architecture/current-state.md` and `docs/stages/`.

## Commands

```bash
pnpm dev          # local dev server on :3000
pnpm build        # production build (does not lint)
pnpm start        # serve the production build
pnpm start:demo   # serve the build with the read-only demo workspace (no Supabase keys)
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm test         # vitest run (unit, domain and design-token tests)
pnpm check        # typecheck, lint, test in sequence
pnpm security:eval   # run the OWASP-mapped security scenarios and record the run (/security shows it)
pnpm qa:responsive   # every route on phones (portrait and landscape), tablets, touch iPads and desktops: sideways scroll, cut-off content, small or lost taps, out of proportion, console errors (--strict fails on all; --shots then scripts/qa/contact-sheet.mjs to look)
pnpm qa:vitals       # phone-profile LCP, CLS, TBT, FCP and bytes per page, median of three (lab numbers, ADR 0052)
pnpm qa:a11y         # every route at 1280 and 375: nameless controls, alt text, headings, landmarks, hidden focusables, visible focus (ADR 0053)
node scripts/brand-assets.mjs   # regenerate icon sizes from the logo
```

The dev PC has 3.8 GB of RAM. Run checks one at a time, and stop any dev or preview server before `pnpm build`.

## Architecture map

- `src/app/(site)/`: the public site with the site header: the homepage, a page for each of the four spaces (`/build`, `/chat`, `/survey`, `/proof`, ADR 0214), `/pricing` and `/sign-in`. `src/components/site/spaces.ts` names the spaces for the header, phone menu, footer, homepage and the app's Home. `src/app/app/`: the signed-in app (Mission Control, projects, tasks, approvals, billing, settings). Server Components by default.
- `src/server/workspace/`: request context, readers (Supabase and demo), write use cases. Writes go through `use-cases.ts` (TypeScript rules) then the service-role-only `app_*` SQL functions; the browser can only read.
- `src/core/chat/intelligence.ts` and `src/core/chat/ladder.ts`: Farbaek AI's routing between Claude and OpenAI (ADR 0215, ADR 0220): GPT-6 Luna answers first, harder questions step up a shared price ladder (fast, standard, strong, frontier) to the provider that leads for the kind, with up to three fallbacks. New chat models go in `ladder.ts` plus the rate card and model names. `src/server/studio/`, `src/core/studio/`, `src/components/studio/`: the image and video studios at /app/images and /app/video (ADR 0216).
- `src/core/chat/language*.ts`: the language a person writes in, however they type it (ADR 0221): scripts, languages typed in English letters, requests such as "answer in English", and the short language note sent beside the unchanged system prompt. A new language needs a profile and a test example; settings only offer tested ones.
- `src/server/web/`, `src/core/web/`: live web research for Chat, when a question needs it (ADR 0222, ADR 0223): whether to search is read from the message (`intent.ts`), a planner model writes the searches (`plan.ts`, with a model-free fallback that reads Sinhala into search words, `gloss.ts`), results are ranked (`rank.ts`), and a deep task gets a second round. SearXNG on the VPS (`deploy/vps/searxng/`) and the page reader, its own locked-down container (`src/server/web/reader/*.mjs`: public addresses only, robots.txt, size and time limits). The app itself never fetches a page address. An answer cites sources by number; the finished answer's citations are checked against the pages (`citations.ts`) and saved in its meta. `src/core/web/eval/` holds the measured floors: a new rule or word list needs its cases there.
- `src/core/chat/memory.ts`, `src/core/chat/summary.ts` (ADR 0224): what a person asked Farbaek AI to remember, saved only from words they typed (never from a model, a page or a pressed choice) and sent beside their message, never with the instructions; and a summary of a long conversation's earlier part, made after the answer by a small model and read only once messages have dropped out, beside the ones still read. Tables `chat_memories` and `chat_summaries` (v101); a shared chat carries only an answer's `search` facts.
- `src/core/automation/`, `src/server/automation/`, `src/app/app/scheduled/`, `src/components/scheduled/` (ADR 0278): scheduled tasks, work Farbaek does by itself at a time a person set. The schedule and its next time are tested code (`schedule.ts`; `words.ts` only prefills from the person's words); a run is a Chat turn made on the server as that person (`headless-chat.ts`), claimed once under a lease (`app_scheduled_claim`, v106) and settled by `settle()` in `tasks.ts`. The tick is `POST /api/internal/jobs/scheduled`, every minute (`farbaek-scheduled.timer`), with the 15-minute sweep as its fallback. The browser never says when a task runs next. In Chat, a request said with a time is offered as a schedule under its answer (`offer.ts`, `src/components/chat/schedule-offer.tsx`, ADR 0280): read from the person's typed words only, saved only when they press.
- `src/core/automation/agents.ts`, `src/server/automation/agents.ts`, `src/app/app/scheduled/agents/` (ADR 0282): agents, helpers with a name and a goal that keep working toward it. One scheduled task does an agent's work (`scheduled_tasks.personal_agent_id`, v108), so the runner, lease and pause are that task's. A run is told what it is (`agentRunNote`), and the opening of its answer and its "Next:" line are kept as the run's note (`noteFromAnswer`) for the next run: given as a record, never as instructions. Its limit is runs in any 30 days, counted by the database. In the database the table is `personal_agents`; `agents` is the paired desktop agents.
- `src/core/agent/computer/` (ADR 0225): the tools and policy for a task on a person's computer (a browser the agent owns, files in folders they chose): allow, ask or refuse, by lists of what is allowed. Nothing calls it yet; `COMPUTER_CAPABILITIES` stays as it is until a desktop release can run it. A new rule needs its bypass tests in `computer.test.ts`.
- `src/core/chat/intent.ts`: tells a request to act on the person's computer from a question, and holds the one list of what the computer side can and can't do (ADR 0223). Chat never says it did something on a computer.
- `src/server/chat/`, `src/core/chat/`, `src/components/chat/`: Farbaek Chat (ADR 0213): conversations with branches, answers streamed as Server-Sent Events from `/app/chat/api/turn`, files, images and read-only links. Its own Markdown, code tint and MathML; no HTML from the model. It fills the screen, as every signed-in page does (ADR 0230), and answers can hand a request to Images, Video or Build (ADR 0218).
- `src/app/app/workbench/`, `src/components/workbench/`, `src/server/workbench/`, `src/core/workbench/`: Build's workspace at /app/workbench/[projectId] (ADR 0219): the agent, the preview, the code and the output on one screen, in Chat's frame. It reuses the build flow's parts (`ApproveBuild`, `useRunFeed`, `loadPlanCard`, `StaticPreview`, the CodeMirror surface); a hidden `surface` word keeps the flow inside it (`src/core/agent/build-surface.ts`).
- `src/server/ai/`: model providers behind interfaces: Claude and Gemini for contract drafting and change proposals (ADR 0009, ADR 0014; AI_PROVIDER picks one). Server-only; output is untrusted and only prefills forms.
- `src/config/usage.ts` and `src/core/billing/rate-card.ts`: the AI operations, and what each model costs per token (with `docs/billing/usage.md`, ADR 0020). `src/core/billing/allowance.ts` turns a price into a plan's allowance.
- `src/components/<area>/`: UI. Anything using Motion, state or effects is a `"use client"` leaf.
- `src/core/<domain>/`: framework-free domain logic shared by server, browser and the future native apps. ESLint blocks React, Next, Motion and UI imports here.
  - `billing/`: plan catalog (the one pricing source), trial lifecycle, entitlements, usage metering.
  - `trust/`: RFC 8785 canonical JSON, SHA-256, approval binding.
  - `realityloop/`: task state machine, intent contract schema and checks.
  - `proof/`: Seal geometry from a digest.
  - `workspace/`: project file path rules, import screening (secrets, binaries, build folders), file tree.
- `src/content/samples.ts`: sample data for the public site. Always label it "sample" where it's shown.
- `src/styles/tokens.css`: the light look's colour tokens; `src/styles/theme-dark.css`: their night values (ADR 0227). `tests/design/contrast.test.ts` and `tests/design/dark-theme.test.ts` enforce WCAG AA for every pair in each. `src/core/theme/`, `src/server/theme.ts` and `src/components/theme/` hold the person's choice: the cookie, the server's mark in the page (`ThemeMark`) and the control (`ThemeChoice`).
- `src/components/three/`: the 3D scene on `/build`. `src/components/films/`: the recorded films.
- `docs/adr/`: one ADR per significant decision. Add one when you change a decision.

## Non-negotiables (full list in spec section 0)

- Never fabricate integrations, test results, metrics, prices, payments or testimonials. Demo data is labelled and isolated.
- Security is enforced on the server or runtime. Hidden buttons and prompts are not boundaries. Fail closed.
- No dead ends: every control works or is visibly unavailable with an honest reason.
- Billing stays `not_connected` until `docs/billing/go-live.md` is complete. The trial is internal, never a provider trial.
- Never read or print secret values. `.env*` (except `.env.example`) and key files are off limits.
- Don't claim "first", "guaranteed", "complete protection", certifications or compliance.
- Pin exact dependency versions, avoid releases that are only days old, and keep lifecycle scripts off by default.

## Design rules (White Signal, ADR 0008)

- Two looks, one set of token names (ADR 0227). Crystal White, the light look (`src/styles/tokens.css`), is the default. Dark (`src/styles/theme-dark.css`) is the person's choice for every page: the public site (ADR 0232), every signed-in page, the staff console and admin, saved once (`ThemeChoice`, cookie `fb_theme`); Auto follows their device. Light is what a new visitor sees. A page built ahead of time can't read the cookie on the server, so its layout carries `SiteThemeMark` and `SiteThemeScript`, together and first. A colour literal will not turn, and a new colour token needs a night value (`tests/design/dark-theme.test.ts`). `data-theme="light"` or `"dark"` on an element keeps that piece in one look. Look at a new screen in both: `pnpm qa:responsive --theme=dark --shots=<folder>`. Colours come from tokens only. One accent: signal blue (`accent`); signal cyan (`accent-2`) only in the aurora, orbit and syntax tint. No gold. The public site and the spaces' own chrome also use the spectrum (ADR 0217): `spark-rose` for Images, `spark-aqua` for Video, `spark-leaf` for Build, `spark-ember` for playful marks, as identity and as light from behind product windows (`Halo`), never for status.
- Dark `media` tokens are for media frames only (concept film, evidence terminal), never for whole sections.
- Shape lock: buttons, chips and segmented controls are pills; inputs 12px (`rounded-sm`); cards 20px (`rounded-md`); large panels 28px.
- Fonts: Geist (UI and display, weight 500 headlines, tight tracking) and Geist Mono for code and data only (hashes, paths, commands, IDs, keys). No serif.
- Small text (ADR 0049): sentence-case Geist labels, no `//` labels or eyebrows over titles, at least 12px (11px only for tab labels and badges), one `·` per line at most. `tests/design/type-tells.test.ts` checks it.
- Logo (ADR 0226): the black cat, `public/brand/farbaek-logo-v2.webp`, used unaltered through `BrandLogo` or `LOGO`, directly on the page: no frame, filter or recolouring. The paper round the cat is transparent; the white inside the drawing is part of it. On a dark page (Chat's Dark) the cat sits on its own white paper, drawn by `src/styles/chat-theme.css`: never invert it.
- App icon and favicon only: `public/brand/farbaek-app-icon.webp` (the same cat on its white paper, since icons need a solid background). It's never used anywhere else. The owner's image is `scripts/brand/farbaek-cat-source.webp`; `node scripts/brand-assets.mjs` makes the logo, the icon and every size from it. No other logo artwork exists.
- 3D and film load lazily, pause off-screen, and fall back to static under reduced motion, Save-Data, weak hardware or a touch-first screen (ADR 0052). Film content is labelled sample data. Measure phone changes with `pnpm qa:vitals`.
- Motion only for live state, hierarchy, storytelling or feedback; always honour `prefers-reduced-motion`.
- No CSS filters (`blur`, `drop-shadow`, `brightness`): on iOS 26 they paint a black square at the top left (ADR 0055). Draw soft light with gradients; `backdrop-filter` is fine. `tests/design/no-filters.test.ts` checks it.
- Status is one of the thirteen kinds in `StatusBadge` (ADR 0183): its words, icon, colour and border together, never a hand-drawn pill, a blank where an icon belongs, an hourglass, a flask or a dot. Blue (`approval`) means your turn, burnt orange (`caution`) is for real warnings only, steel (`info`) is information and work in progress; no gold, amber or purple. Section headings in the app use `CardTitle` with their icon. Models show their product name (`modelName()`), never an id in mono; numbers only when real, in a sentence. The `farbaek-human-made` skill has the full list of tells; `tests/design/human-made.test.ts` checks it (ADR 0180, ADR 0183).
- Icons name the action (hammer for build, pen nib for drafting): no sparkles, robots, wands or brains, on the web or in the native apps (ADR 0153). `tests/design/plain-icons.test.ts` checks it.
- Copy: plain sentences, no em dashes in UI text, no filler verbs.
- Mobile first, sized phone first (ADR 0211): titles from `titles.ts`, page stacks and bezels from `surfaces.ts`, each starting at the phone size and stepping up. Buttons are 40px (`sm`), 44px (`md`) or a 40px icon circle, with a 48px touch area (`.tap`); fields are 44px with 16px text on touch, 40px and 14px with a mouse on a large screen. No horizontal page scroll (check at 375px). A button's own `inline-flex` overrides `hidden`: control visibility with a wrapper.
- Text size and keyboard (ADR 0171): text is in rem, so Android's text size reaches it (`tests/design/rem-text.test.ts`; check with `pnpm qa:responsive --text-scale=2`). Anything pinned above the phone tab bar uses `bottom-[var(--tab-bar)]`, which is 0 while someone types.

## Workflow

- Start each stage in plan mode. Commit at every green milestone, on a branch.
- Update `docs/stages/stage-N.md` with what was done, what was verified and what's next.
- Ask before: dependency installs, migrations, `git push`, anything touching production or money.
