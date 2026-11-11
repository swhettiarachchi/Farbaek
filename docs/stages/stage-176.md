# Stage 176: What a signed-in person can really use

- **Branch:** `feat/free-plan-fixes`, on `feat/store-purchases` (#222).
- **No ADR and no migration.**

## What the owner asked

"Once a user logs in to the website, they will be able to access and use all the features, right? Deep check and tell me." Then: "Did you fix this?"

## What the check found

- **Every signed-in page loads.** 41 page types were read on www.farbaek.com in the owner's workspace on the Free plan, including each project, task, test space, build and template page, with their full streamed content. None showed an error.
- **What someone can do depends on their plan, their role and a few connections.** New workspaces start a 14-day trial at Pro level. Workflows, level 3 autonomy, incident tools, impact analysis, Fable models, per-person permissions and priority support are sold only above Pro.
- **Five problems,** fixed here.

## Fixed

1. **The build box on Home, Build and New build** always made a new project. A Free workspace with its one project in use was refused only after the person had written their build. The box now offers "Build in": a new project, or one of the workspace's projects (`src/core/workspace/build-target.ts`). With the plan's projects in use, it starts on the most recent project and says why a new one can't be made.
   - **A template** needs a new project, so with the plan full, New build says so before anything is written.
   - **A prompt kept from before sign-in** is never sent into an existing project by itself: the person sees where it would go and sends it.
2. **Connections** listed private GitHub import and local models as "Not available yet". Both work. GitHub now says it imports private repositories too, and the desktop app says it can run on a model hosted on the computer.
3. **Activity history** on the pricing page (7, 30, 90… days) wasn't applied. History and its CSV download now show the plan's days, and say so. Older events stay stored, and a plan with a longer history shows them.
4. **The connections count on Billing** included GitHub, but the plan's limit counts only hosting accounts, so it could read "2 of 1". It now counts what the limit counts, and says GitHub doesn't.
5. **The developer API** was sold as available. It answers only to a sign-in session that lasts an hour, and the website gives no key and no docs. Pricing now says "Coming soon" for it. Real API keys need a database change and keys stored only as hashes, plus a Settings page and docs: a stage of their own.

## Verified

- **Unit tests:**
  - where a build goes: room on the plan, a full plan, five projects kept from a trial on a one-project plan, archived projects, no limit;
  - the history window.
- **Checks:** `pnpm typecheck`, `pnpm lint`, and 1,476 core, component, workspace and design tests.
- **On the demo dev server:**
  - Home shows "Build in" with a new project and the three demo projects;
  - Connections no longer lists the two as unavailable;
  - History shows the plan's days;
  - pricing shows "Coming soon" for the developer API.

## Not done

- **Real developer API keys:** proposed as the next stage.
- **The full-plan state of the build box** was checked by its unit test, not in the browser. The demo workspace's plan has room.
