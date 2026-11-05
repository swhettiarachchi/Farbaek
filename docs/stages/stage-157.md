# Stage 157: Simple by default

- **Branch:** `feat/simple-by-default`, from `main` after PR #200.
- **Decision:** ADR 0170.
- **Research:** the report of 2026-11-05 on hybrid iOS rules and premium UX, kept outside the repo.
- **Skills used** (the owner asked for them on every build):
  - `deep-research` for the research;
  - `premium-app-ui`, `ui-ux-pro-max`, `mobile-app-ui-design`, `frontend-design`, `design-taste-frontend` and `farbaek-ui` for the structure and the next-step card;
  - `chrome-browser` and `built-in-browser` for the walks.

## Why

The owner asked that every part of Farbaek be easy to understand and use for anyone, whatever they know about software. The audit found the mechanics clean: 550 responsive page views and 96 accessibility page views, with no findings. The gap was comprehension: a flat 17-item sidebar of technical names, an approve button about 3,300 px down the task page on a phone, and different words for the same thing on different screens.

## What changed

**One vocabulary on screen** (the table is in ADR 0170 and `.claude/skills/farbaek-ui/SKILL.md`).
- A plan, a change, proof, rules, undo, a test space. Code, routes, API fields and state keys don't change.
- Task status labels are plain too, and reach iPhone through the phone API, so its fixtures were regenerated. The iPhone app's own strings wait for its stage.
- `tests/design/plain-words.test.ts` keeps the replaced words off the signed-in app's screens.

**Navigation** (`src/components/app/app-nav.tsx`).
- Five always in view: Home, Build, Projects, Tasks, Approvals.
- "More tools" holds the other nine. It remembers its state, opens by itself on one of its own pages, and can't be reached by Tab while closed.
- Billing and usage, Settings and Help come after it.
- The sidebar has no scrollbar taking up width, so opening the group doesn't squeeze it.
- Phones keep their five tabs. The More page lists every other page with one plain line, and now includes Who can do what.
- Search still finds the old names.

**The task page** (`src/app/app/tasks/[taskId]/page.tsx`).
- A next-step card comes first (`src/core/realityloop/next-step.ts`, `src/components/tasks/next-step.tsx`): one plain sentence and one button, from the task's real state. Every state is covered, and "done" is only said of a task that reached VERIFIED or RECOVERED.
- The card that matters right now comes next. Everything else folds into one Full details section (`src/components/ui/disclosure.tsx`).
- The buttons use `JumpLink`, which opens what holds the target, scrolls there and moves focus. A plain link with a hash left the fold shut, so the button looked dead.
- No state rule, permission or write changed. Only where each card renders.

**Reviewing a change** (`src/components/proposals/proposal-review.tsx`, `src/components/arena/`).
- "Try it on a copy" comes before the change and its button.
- On a phone, the approve button now follows the reader, full width, just above the tab bar. Discard waits at the end of the review, so it can't be pressed by accident while scrolling. If approving isn't possible, the reason stays in the bar beside the grey button.
- Keyboard focus can't land behind the bar (WCAG 2.2, 2.4.11).
- Plan version, fingerprints and model moved under Technical details.
- The explanations of flags and matches, and of the AI's notes, are rewritten in plain words.

**Home and project names.**
- Home has a title, the build box, recent work and three stat tiles. The sentence about records, the second New project button and the raw hashes are gone.
- `src/core/agent/prompt-start.ts`: "Make this the landing page for Ledgerline, a bookkeeping service" now gives "Landing page for Ledgerline". Existing projects aren't renamed.

**Deep pages.** Each now starts with a line a beginner can read: Move projects, Rules, Who can do what, Problems and pause, Test space, Desktop app, Workflows, History and Connections.

## Found while checking

- **A wording change almost changed who is listed.** `whoCanChange` in `src/core/trust/trust-graph.ts` decided by comparing an edge's label to "can propose changes". Rewording it to "can suggest changes" dropped agents from the answer, and a test caught it. Both now use one constant, `AGENT_CAN_SUGGEST`.
- **So the whole diff was scanned for the same mistake.** Every string it replaced was searched for in comparisons across `src` and `tests`. The only hits were state keys that moved lines but weren't renamed.
- **`JumpLink` first opened every fold inside its target**, which popped Technical details open. It now opens only what holds the target, or a fold the target directly wraps.
- **The first sticky bar was 177 px tall on a phone**, because Discard and the reasons sat inside it.
- **Two next-step sentences read wrong in real states:** "waiting for approval" with no change to review, and an approved plan that can't start building. Both are rewritten.

## Found by an independent review, and fixed

An agent that hadn't seen my reasoning read the risky files against the old page. It confirmed every old card and control still appears under its old conditions, and found these:

- **A change the plan stopped showed the wrong card, and hid.** A stopped change has status `blocked`, but the card looked only for `pending`. So it said "A rule stopped this plan" and left the violations and Discard folded away. It now comes first and says what happened.
- **An expired change still said "Check what changed, then approve".** Nothing moves it out of `pending`. The card now says it ran out of time and points at Discard.
- **A running agent read as "Ready to build".** A cloud run leaves the task at plan approved, and the page didn't read runs. It now does: "The agent is working" with a link to the run, or "The agent is waiting for you" when a command needs approval. The start button is unavailable with that reason, and the page refreshes while the run goes.
- **An approve error could land off-screen.** The button had moved into the sticky bar, and the error was still after the last file. It now shows in the bar.
- **Project names:** words were counted before "Build me a" was removed, so "Build me a website, for my bakery" gave "Website". Greetings, `Project name:`, web addresses, emoji and "1,000" are now handled, with tests.
- **"Ask the agent to fix it" ignored a fix that already existed.** It now says "A fix is open" or "A follow-up task fixed it", and links there.
- **It was "your turn" for people who can't act:** viewers, members with approving turned off, changes that need an owner or admin, and archived projects. They're now told what's going on, and offered a look instead. My own test for this caught one more case, a viewer offered a fix on a partly verified task.
- **Smaller:**
  - More tools didn't open when the browser refused storage, so it now keeps its state for the visit;
  - the page had two elements with `id="fix"`;
  - a closed fold's caret looked open inside an open one, because `group-open` matches any open ancestor;
  - an address like `#%` threw while decoding, inside an effect;
  - "See Undo below" pointed the wrong way when Undo comes first.
- **`tests/design/plain-words.test.ts` now reads sentences with an expression in them too.** It had missed "You review its contract, {…}".

## Verified

- **Checks:** typecheck and lint are clean. The full suite passes 2,660 tests, with 17 skipped. `pnpm security:eval` passes 36 of 36, and its run was recorded again because one scenario's expected wording changed.
- **Scanners on a demo production build:** `pnpm qa:responsive` 550 page views, 0 issues. `pnpm qa:a11y` 96 page views, 0 findings.
- **At 375 px, in the demo:**
  - every sample task state (`b001` to `b008`) has the right sentence and button, with no duplicate ids;
  - on the change waiting for review, "Review the change" opens and scrolls to it, while Technical details, More ways to check and Full details stay shut;
  - the approve button follows the reader, full width and 48 px tall, directly above the tab bar;
  - there's no sideways scroll, and an address ending in `#%` no longer breaks the page.
- **At desktop width, in Chrome:** the sidebar with More tools opening, remembering its state and opening by itself on Move projects, Rules and Who can do what; Home; a project page with Skills folded and one with a skill waiting for review; Approvals; Settings; the change review with its bar.

**Not checked in a browser, because the demo has no such data.** These are covered by unit tests only:
- a change the plan stopped;
- an expired change;
- a live agent run, which reads production's run records;
- the screens a viewer or a member with approving turned off sees.

The live run and a real approval get their first real check on production after the merge.

## Next

- **After the merge, on production in Chrome:** Sunrise Bakery's tasks in the signed-in app, including a run in progress, with no policy violations.
- **Stage 158, phone polish from the research:** the keyboard, text scale, a share target, purchase controls at first paint on Android, safe areas and 48 dp targets.
- **Stage 159, signature moments and the motion system,** within the research's budgets.
- **Stage 160 on, the iPhone:** a native Projects tab first, then more screens, previews opening in the browser, and its own strings ("Lifecycle", "proposes") in the new words, tested on a Mac runner.
- **A later pass:** the public site's and the films' older words.
