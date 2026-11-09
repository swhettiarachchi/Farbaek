# Stage 170: The rest of the audit

- **Branch:** `feat/audit-rest`, from `feat/public-pages` (#216), so it carries the public-pages pass until that merges.
- **ADR:** none new; the work holds ADR 0170, 0180 and 0181. No migration.
- **Skills:** `farbaek-human-made` and `farbaek-ui` as the bar for every agent; `ui-ux-pro-max` rules on touch, feedback and forms; `workflow-authoring` for the run.

## What the owner asked

Whether stage 169 finished everything in the standing prompt. It didn't: of the audit's 130 findings, stage 169 fixed the ones people meet first, and left about 60 lower ones, plus the end-to-end run on production. This stage finishes the findings.

## How it was done

One workflow over nine areas, each owning a disjoint set of files so the agents could edit the same working tree at once without colliding:

| Area | What it owns |
| --- | --- |
| App shell and Build | Home, the shell, the loading state, Build, Test space, Check an app, Move projects |
| Tasks | Tasks, a task's page, Approvals, the plan card, the task components |
| Project | A project's pages, the Projects list, launch, publish, GitHub and security components |
| Workspace pages | Settings, Desktop app, Connections, Who can do what, Problems and pause, Rules, Skills, Billing, Help, Workflows, History, Templates, More |
| Change components | The change review (intent lens, impact, second check), undo, files, insights, trials |
| Build components | Run, test space, preview, Studio, Move projects, verify |
| Public site | Home sections, films, showroom, pricing, sign-in, security, verify, footer |
| iPhone | The SwiftUI app and the phone API views it reads |
| Desktop and messages | The desktop app's renderer, and server messages people read |

Each area went through an implementer, then two independent reviewers reading its diff (one for correctness: parsing, imports, types, behaviour, tests; one for the standard: the human-made tells, words, targets, tokens), then a fix pass for what they found. No agent ran checks (eight gigabytes of memory, nine areas at once); the lead ran typecheck, lint, the full suite, the demo build and both audits afterwards, one at a time.

## Found and fixed

The nine areas recorded 100 fixes, some covering several findings. The reviewers then raised 35 problems in those edits, and each was fixed or settled. The shape of what changed:

- **Status is words.** Hand-drawn status pills on the change review, second check, mutation trial, failure futures, arena, launch and handoff cards are now `StatusBadge`: a word in its colour and border, with a mark only for done and failed. A trial that didn't run is a dashed "Didn't run", never a red cross, and a row that still passes in the arena is a plain word, not a third green check.
- **No dots, no counters beside headings.** The task's history timeline was the last drawn-dot list; each step now has a check, and a step into a failed or cancelled state has none. The counts beside Runs, Sessions, Tasks, People, the task groups and the security severity headings are gone, and the guard in `tests/design/human-made.test.ts` now catches 2.5 and 3 sized dots too, leaving a radio's inner dot alone.
- **Plain headings.** Icons came off the h2s on Home, a task's page, the project page and Skills, so every heading on a page looks alike. Eyebrows above titles ("Your plan", "Step N", the hero's pill, a showroom item's category) are gone.
- **Plain words.** "Gateway" is now "your company's server" on Settings, Connections, Who can do what and in the address checks. "Incident" is "problem" wherever a customer reads it (the failure futures card, the change graph, suggested rules, the escalation email, the plan limit), matching the "Problems and pause" page. "Mesh transfers" is "Moving projects", "Recovered" is "Undone", "Exited 0" is "Succeeded", the merge view's Accept and Reject are Keep and Leave out, and secrets are "keys and passwords" kept "in your host's settings, not in the code". Reversibility classes read "Can be undone" through "Back up first". Sentences over 25 words were split on every page the areas own.
- **Operator detail stays with operators.** Sandbox setting names, commands and provider hints (`E2B_API_KEY`, `SANDBOX_VERCEL_TOKEN`, `pnpm sandbox:templates`) now go to the server log. People read "Checks can't run on this server right now" or "Previews aren't available on this server yet". The staff console still shows the operator detail.
- **Every control is reachable.** Studio's section actions, the prompt composer, the footer's email links and the iPhone's Privacy and Terms links are at least 44px. A disabled reason that lived only in a `title` now shows as a line under the control (billing submit, Studio's Delete and Add a section). The live site check uses the shared button.
- **Fingerprints and hashes on request.** Key fingerprints on the phone pairing screens, per-file hashes and the capsule digest moved behind Technical details. The digests on /verify stay, because comparing them is that page's job.
- **The iPhone app.** The approval deadline is words in its colour ("Closes in 3 days", "Closes tomorrow", "Expired"), with no clock icon and no "47 h". Home shows the period's AI usage, as the web does. The tasks list keeps what it showed when a refresh fails, and an answer for an old filter can't replace the new one's list. Notifications say when iOS has them off, and the web page view draws its loading state.
- **The desktop app.** Nearby lost its middots, the "4:59 left" counter badge and the shield on states that aren't safe. A task's allowed operations read as words, not ids in mono.
- **Answers that say what happened.** A malformed approval fingerprint gets its own message instead of "the plan changed". A failed import states the real limits. The generated image's message is a sentence, with the path as its own field for the link.
- **Loading and empty states.** The app's loading skeleton is a neutral title and two cards instead of four stat tiles on every page. The Tasks and Approvals empty states now offer the next action.

### From looking at the pages

After the checks passed, every changed page was read at 375 px on the demo build. That found what no scan could:

- **Home's three number tiles** (Projects, Open tasks, Waiting for you) repeated the cards around them, with the third alone on its row on a phone. They're now one sentence under Recent tasks, "You have 3 active projects, and your plan allows 5. Across them, 7 tasks aren't finished yet, and 1 change waits for your yes or no.", with the counts as links. Archived projects and their tasks no longer count as active.
- **The launch page said "it runs a server" three times** on its first screen. Whether Farbaek Sites fits is now said once, beside the plan, and frameworks go by their names ("Worked out from Next.js in package.json", not "next").
- **The plan-match line read "2 changes: 2 share words with the plan."** It's now sentences: "Both changes share words with the plan."
- **The approval card ran a command into the next word** for copied text and screen readers ("pnpm testruns"), because a margin did the spacing. Commands are now separated by real spaces, commas and "and".
- **Skills said its title and lead twice** when its fold opened, and Practice mode carried a "Sample" chip on a real setting. Both are gone.
- **The test space's failure words** said "sandbox runtime", and one told people to check the runtime's key in Settings, which is Farbaek's own server setting. They now say "the test space service" and what to do.

### From the independent review

A fresh review of the whole diff, run after every check passed, found these, all fixed:

- **The staff console said previews were on** when the server had turned them off for a short secret or a URL where a host name belongs. It now applies the server's own rules and names the setting at fault. Customers still read only that previews aren't available.
- **"This agent's access doesn't allow Moving projects"** had a capital mid-sentence. The words are now "moving projects between computers", and the permission's title is "Move projects", like its siblings.
- **A refused test space said "try again later" twice**, once in the message and once in the advice. The advice is now only "Write to support@farbaek.com if it keeps happening." The runtime's own words say "test space", not "sandbox".
- **The session-start button's reason talked about checks.** The sentence now covers both: "Project code can't run on this server, so test spaces and checks are off and changes stay unverified."
- **A signed ProofPack would have read "Checks did not run: Checks can't run..."**. The record and /verify now put the reason after a full stop, so any reason reads right.
- **The phone's file picker and its error described the same rule in different words.** Both now say files that hold keys or passwords stay on the device.
- **On the iPhone, line numbers from 10,000 up would wrap** in a change's diff, and Home said "Used 0% of the trial's AI usage." The number column now grows with the text size, and the usage line appears from 1%.
- **"Back up first" carried a red cross**, as if a check had failed. It's advice, so it's now in the needs-a-person tone with no mark.
- **The proof film still showed Accept and Reject buttons.** Its stage now says Keep and Leave out, like the product.
- **Operator detail could still reach customers** in two places: the test space page listed server setup steps and setting names when no test space was connected, and a full test space account named Farbaek's own provider and plan. Both now say what happened in the product's words, and the hints go to the server log.
- **The device permission said it only moved projects between computers**, but it also covers sending files to a paired phone or browser. It's now "Send files between devices".
- **Smaller wording:** publishing's blocked reason no longer repeats the box above it, the trial sentence's subject is the workspace, the Free plan's line no longer promises "once or twice" when the numbers back once, and the privacy page says "your company's own server".

## Checked

All on the final tree, one at a time:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passes |
| `pnpm lint` | Passes |
| `pnpm test` | 385 files and 2,827 tests pass, 17 skipped |
| `pnpm security:eval` | 41 of 41 scenarios pass, run re-recorded |
| `pnpm qa:responsive` on the demo build | 550 page views, no findings |
| `pnpm qa:a11y` on the demo build | 96 page views, no findings |

- The iPhone fixtures were regenerated from the server's sample answers, and the iPhone's unit test now expects the new deadline words and the usage line. The iPhone app compiles and its tests run in CI after the push.
- The desktop app's bundle was rebuilt with `node desktop/build.mjs`.
- Every changed page was read at 375 px on the demo build, and two independent reviews read the whole diff.

## Not done, and why

- **The proof film's captions keep "Exit codes decide" and "Launch gate".** They describe the recorded video, which still shows those words. The film's stage components already say "The real results decide" and "Before publishing", so the plainer words arrive when the films are next recorded with `pnpm films:record`, and the captions, chapters and manifest change with them.
- **"index.html" stays in the publish and launch messages.** Naming the file is what someone needs to make it.
- **High and Critical severity keep their warning mark.** Severity isn't a status, and the mark means act now.
- **"Mutation trial" keeps its name.** It's the feature's name in server messages, History and errors, so renaming one screen would split the words.
- **Short commit ids stay in mono on the GitHub pages.** Developers copy them.
- **The end-to-end run on production.** It creates real tasks and spends real AI usage, so it waits for the owner's yes.
- **Owner-only steps:** a real sign-up and payment, the Windows Store's second submission, the Google Play script, and the twelve Play testers.
