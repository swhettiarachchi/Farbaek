# Stage 140: The first screen shows what Farbaek does

- **Branch:** `feat/first-run-tour`.
- **Migration:** none.
- **ADR:** none.

## 2026-11-03

### Asked

The owner opened Farbaek for Android as a new user and landed on "What do you want to build?" with only the build box. They asked for the first screen to show Farbaek's other features and options too, premium, attractive and friendly.

### Done

That screen is what anyone signed in without a workspace sees: the first screen in the apps and right after signing up on the web. The build box stays first; below it, `src/components/app/first-run.tsx` adds three sections:

- **How a build goes:** describe it, approve the plan, watch it build, preview and publish, in a double-bezel panel. The build step's node is the turning Agent Core mark. The thread between steps draws down as it scrolls through the screen, using a scroll-linked CSS animation (`.first-run-thread` in `globals.css`); where that isn't supported, or under reduced motion, it's simply drawn. The last step says "publish it to its own web address" only when this server has a site domain; otherwise "download the code".
- **Start from something like these:** the homepage's showroom of eight concept mockups (ADR 0031), labelled as concepts. "Start a build like this" puts the concept's sentence in the build box at the top and scrolls to it.
- **What every build comes with:** the ten capabilities from the homepage, each with its real status on this server (working, or turning on with what it's waiting for). Cards to swipe on phones (the row takes keyboard focus, so it scrolls from the keyboard too), two columns on wider screens.

The status logic moved out of the homepage's showcase section into `src/components/showcase/capabilities.tsx` (`capabilityRows`, `CapabilityStatusPill`), so the homepage and this screen read the same list.

The intro is shorter ("Describe it, and Farbaek drafts a plan for you to approve, then builds it."), and the trial line now says what's true: a new workspace gets the 14-day Pro trial once per email address, no card, then Free. The sections lay out only as they near the screen (`home-later`, ADR 0052), so the first paint on a phone is unchanged.

Two fixes on the same screen:
- **Sideways scroll on phones:** the build box's glow reached 11 px past the screen's edge at 375 px (it did before this stage too). Below desktop widths the screen now clips sideways overflow, as the app's other pages do.
- **"Sign out of …"** was a 20 px target; it's 44 px now.

### Verified

- `pnpm typecheck`; ESLint on the changed files; `vitest` on `tests/design`, `src/content` and `src/components`: 28 files and 229 tests.
- **A production demo build**, with the demo's workspace switched off for the check (an environment flag in `context.ts` and a launch entry, both removed afterwards):
  - at 375 px: the three sections render; the thread fills as it scrolls; "Start a build like this" put Typeset Foundry's sentence in the build box, scrolled to it and focused it, and said so; the capability row swipes (10 cards, statuses from the configuration, "Previews of real code" turning on in the demo, which has no sandbox);
  - no sideways scroll at 320 and 375 px after the fix; every control on the screen is at least 44 px tall;
  - at 1280 px: the steps panel, the showroom with its index beside the picture, and the capabilities in two columns;
  - no new console errors.
- **Not checked here:** reduced motion in a browser (the thread's animation sits inside `prefers-reduced-motion: no-preference`, the agent mark uses `motion-safe`, and the showroom already follows the setting), and the screen inside the Android and iPhone apps, which show this same page.

### Next

- After the merge: open Farbaek for Android with a new account and check the screen on a real phone.
