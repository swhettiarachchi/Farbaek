# Stage 160: iPhone, native first

- **Branch:** `feat/iphone-native`, from `feat/motion-moments` (PR #204), because it uses `taskNextStep`'s newer facts and the report opening.
- **Decision:** ADR 0173.
- **Research:** the report of 2026-11-05 on hybrid iOS rules and premium UX, kept outside the repo.
- **Skills used** (the owner asked for them on every build): `mobile-app-ui-design` and `premium-app-ui` for the native screens, `chrome-browser` for the CI result.

## Design brief

- **Product and audience:** Farbaek on an iPhone, for anyone who has never built software, checking on and approving what the agent does.
- **Feeling:** calm, clear, in control.
- **Primary action:** on a task, its next step. On a project, Open your site or Describe a change.
- **Dials:** motion 2 of 10, depth level 0 to 1, standard density.

## What changed

**Phone API, additive (`src/server/phone/`).**
- `tasks/:id` gains `nextStep`, from the same `taskNextStep` as the web.
- `projects/:id`, new: the project, its tasks and its live address.
- `reports`, new POST: a task or a project, and a reason. It opens a support request under `abuse`, and viewers can use it.

**The app (`ios/Farbaek/`, version 1.1.0).**
- **Plain words:** Progress, Proof, Rules, suggests, and Home for Today.
- **Tabs:** Home, Approvals, Build, Projects, You. All tasks is on Home.
- **`NextStepCard`** leads a task, with a symbol and a word for each tone, so status never relies on colour alone.
- **`ProjectsView` and `ProjectDetailView`,** with Open your site, Describe a change, and Preview and edit on the web.
- **`AIConsentSheet`:** asked before a build, a plan's approval, or a message to a running agent. A switch in You changes it.
- **`ReportSheet`:** on a task, a change, a finished run and a project.
- **More on the web,** in You: eleven tools with the web's one-liners. Billing and pricing are absent on purpose.
- **Removed:** the brain icon on a run's model steps, which ADR 0153 bans. `plain-icons.test.ts` missed it, because the symbol was returned from a function. It now looks there too.

## Verified

- `src/server/phone/api.test.ts`: `nextStep` for each kind of state, `projects/:id` and `reports` including refusals. Fixtures regenerated, including the new `project.json`. Typecheck, lint and the full suite pass (2,703 tests).
- **An independent review read every changed Swift file as a compiler would,** because there's no Swift compiler here. It found no compile errors, and a second read of its fixes found none. It did find, and I fixed:
  - **The tour would have failed on the first push,** because it reads the live server, which doesn't have the new routes yet. It now waits for them.
  - **A sent report promised an email reply.** Replies only appear in Help, which the app had no way to reach. It now says so and links there, and Help is in More on the web.
  - **Next steps promising what the app can't do:** "Write the plan" landing on "There's no plan yet", and words offering undo over a button to a project, which has none. Both now open the web.
  - **An archived project still said "Your turn",** with a live Approve button. It's now nobody's turn, and the approval and plan screens name the reason.
  - **The consent sheet could hide Not now** below the fold on a small iPhone. Both answers now stay in view.
  - **A project from another workspace could stay chosen on Build,** which got a 404.
  - **Tap areas smaller than 44 pt,** because the frame sat outside the link.
  - **The report's length was counted differently from the server,** so long text in Sinhala or with emoji would pass here and be refused there.
  - **Two quick taps could start two builds.**
  - **The sample linked to tasks that don't exist on the web.** It now says where that step would be.
  - **Permission survived signing out,** so the next person on the iPhone wouldn't be asked. Signing out now clears it.

The Mac build's result and the tour's screenshots are recorded below once they've happened.

## Not possible in this stage

- A real device, Face ID and real push.
- The consent sheet and a sent report with a real account, because the sample refuses writes first. These wait for a TestFlight build, once Apple's verdict is in and the owner agrees.
- Nothing is uploaded to TestFlight or App Store Connect here.

## What's next

- **The store's screenshots aren't redone.** They come with the 1.1.0 submission. `scripts/release/store-images.mjs` still names the 1.0.0 screens, and the tour now takes `1-home`, `5-projects`, `6-project`, `7-task` and `8-you`.
- **Web-backed screens,** after the owner books Apple's App Review consultation and decides about in-app purchase.
- **Native Seal, undo and fix** on the iPhone. Until then, a failed task whose fix is already open doesn't name that fix on the phone. The button opens the task on the web, which does.
