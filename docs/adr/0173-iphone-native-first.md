# ADR 0173: The iPhone app catches up, natively

- Status: accepted (2026-11-05).
- Follows the owner's research report of 2026-11-05 on hybrid iOS rules and premium UX, kept outside the repo; what this decision takes from it is stated below. Builds on ADR 0110 (the native iPhone app), ADR 0170 (plain words and one next step) and ADR 0171 (reporting on phones).

## Context

The owner wants every web feature on the iPhone, for anyone. Android runs the website, so it gets everything by itself. The iPhone app is native, and it had fallen behind:

- It spoke the old words: Lifecycle, Evidence, Policy, proposes.
- It had no Projects, except a picker on Build.
- A task had a few hard-coded buttons instead of the next step the web gives.
- Nothing asked permission before sending someone's words to an AI, and nothing could report what the AI made. The research lists both as App Store requirements (guidelines 5.1.2(i) and 1.2).
- Most of the product couldn't be reached from the app.

The research's fuller design shows other web screens inside the app, with a one-time-code handoff. Its advice is to book Apple's free App Review consultation before building that. Billing inside those screens also depends on the owner's in-app purchase decision, and build 22 is still waiting for Apple's first verdict. Live previews can't run in the app at all (guideline 2.5.2).

## Decision

**Native first, and safe whichever way those decisions go.** No web view is added in this stage.

- **The same words and the same next step as the web.** `tasks/:id` gains `nextStep`, made by the same `taskNextStep` the web uses. A button goes to a native screen when the app has one that can do what the words say. Otherwise it opens the task on the web and says so with a browser icon, so every action stays reachable:
  - Writing or changing a plan is on the web. The app reads and approves one.
  - Where the words offer undo (a failed or interrupted check, or a change with nothing to check it), the button opens the task's web page, not the project.
  - `canFix` and `canUndo` are false, because those actions aren't in the app yet. An archived project is nobody's turn, as on the web.
  - The sample's tasks don't exist on the web, so the sample says where a step would be instead of linking to a page that isn't there.
- **Tabs are Home, Approvals, Build, Projects and You,** as on the web's phone tabs. Tasks stays one tap from Home and from each project.
- **Projects are real.** The list, and a project with its address when it's live, Open your site, Describe a change (which opens Build with that project chosen), its tasks, and Preview and edit on the web. A generated site is never run inside the app.
- **Permission before AI.** The first time someone's words would go to an AI (a build, a plan approved, a message to a running agent), a sheet says what goes to whom, with Allow and Not now. It's remembered for the person signed in, can be changed in You, and is cleared by signing out. Not now sends nothing, keeps the words and says why. Answering the agent's yes or no question isn't gated, because it carries no one's words, and Stop isn't either.
- **Report this result** beside what the AI made: a task, a change, a finished run and a project. It's native and opens the same support request under the `abuse` topic as the web, so it reaches Office Space's abuse filter. A viewer can report, because reporting isn't a change to the workspace. The sample refuses it.
- **Everything else is a link, labelled as one.** More on the web, in You, lists the other tools with the web's own one-liners and opens the default browser. Billing and pricing are deliberately absent, as the app's rules require.

**The server changes only add.** Build 22 under review ignores unknown fields and nothing it reads changes shape. Both new routes are new paths.

## Consequences

- The app and the web can't drift on what a task needs next: there's one source.
- A person on an iPhone reads tools as links, not as parts of the app, until the consultation decides about web-backed screens. That's a real gap, and an honest one.
- Consent is kept on the device, so a second iPhone asks again, and so does the next person to sign in on this one.
- Switching it off stops anything more being sent from this iPhone. It doesn't stop a run that's already going, which the switch says.
- Native Seal, undo and fix on the iPhone wait for later stages.
- Swift can't be compiled on the dev PC, and macOS minutes count ten times against a shared free allowance. So iPhone changes go up in one careful push, with an independent read for compile errors first.
