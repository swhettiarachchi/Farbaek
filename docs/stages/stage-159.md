# Stage 159: Signature moments and a motion budget

- **Branch:** `feat/motion-moments`, from `feat/phone-polish` (PR #203), because both touch `globals.css`.
- **Decision:** ADR 0172.
- **Research:** the report of 2026-11-05 on hybrid iOS rules and premium UX, kept outside the repo.
- **Skills used** (the owner asked for them on every build): `premium-app-ui` for the moments and the brief, `farbaek-ui` for the system, and `built-in-browser` for watching them.

## Design brief

- **Feeling:** earned, calm, exact.
- **Dials:** motion 3 of 10 every day and 6 at the peaks; depth level 1 to 2 (CSS 3D, no WebGL on working screens); standard density.
- **Signature moment:** the Seal, drawn from a real digest, forming on a finished task. Under reduced motion it's simply there.

## What changed

**A written budget, which a test enforces** (`tests/design/motion-budget.test.ts`).
- 100 ms for feedback, 240 ms for a change of view, 160 ms for exits and 420 ms for a moment, in `globals.css`.
- The test found and I fixed: three hover lifts at 500 ms, two usage bars animating `width` over 500 ms, and a loading state animating without `motion-safe:`.

**Three moments.**
- **Done and checked:** the next-step card on a verified task carries the Seal, which Stage 157 had folded away.
- **Your site is live:** pressing Publish ends in a card with the real site's picture rising in CSS 3D, the address, Open your site and Copy address. It replaces one line of green text.
- **The agent finished:** a run that ends while someone watches has its result rise in, once, when first seen.

**Everyday motion.**
- A short ring shows where a next-step button landed.
- Folds fade and rise over 200 ms.
- Usage bars slide with `transform`.
- 3D crossfades take 300 ms instead of 700 ms.
- The aurora rests in the signed-in app.

**3D.**
- A lost WebGL context falls back to the still.
- The hero has a Pause motion button, remembered in this browser.
- No WebGL was added to working screens. That's deliberate, and it follows the research.

## Found by looking at it

- **The Seal was invisible.** The class and every test passed, but an SVG gets its width from a class rather than the `size` prop, so it rendered with no size. It's now `size-32`, with a test that says why.
- **The Seal's ring had been losing its first letters at every size below 240.** The words were centred on the top of a path that starts at the left, so only half the ring was usable. "FARBAEK" was being clipped on the proof cards too. The path now starts at the bottom, so the words have the whole ring. I measured and looked at it at 128, 160 and 240.

## Found by an independent review, and fixed

- **Hiding the 3D view said "This device couldn't keep the 3D view smooth".** React Three Fiber loses the context on purpose when a scene closes, and my new listener took that for failure. It now ignores a canvas that's already gone.
- **A returning visitor with motion paused got an empty hero.** A scene that never draws still reported ready, which hid the poster. A paused scene now draws its first frame.
- **The Seal check failed open.** With a damaged newest ProofPack and an intact receipt, the Seal drew while Full details said the record had changed. A newer failed run could also leave an older Seal up. The newest record now decides, and a receipt counts only if it ran against the applied files.
- **The agent's moment restarted** on every return to its pane on a phone. It now plays once, when first seen.
- **The Seal always said "Farbaek ProofPack",** even when it came from a check receipt. It now says what the evidence is.
- **Copy address** stayed on "Copied" and failed silently. It now says what happened, and resets.
- **The budget test could miss** `duration-[0.6s]` and `sm:animate-pulse` beside a `motion-safe:`. It now reads each token and each unit.
- **`aria-pressed` with a flipping label** read as "Play motion, pressed". The label alone says it.

**Accepted:** on a hard load of a task whose Seal hasn't been seen, the server draws the Seal, hydration hides it, then it forms. It's a brief blink, once per digest. The alternative hides the Seal until hydration on every visit, which is worse for everyone who comes back.

## Verified

- **Checks:** typecheck and lint are clean. The full suite passes 2692 tests, with 17 skipped.
- **Scanners on a demo production build:**
  - `pnpm qa:responsive`: 550 page views, 0 issues;
  - `pnpm qa:a11y`: 96 page views, 0 findings;
  - at 200% text on 320 and 375 px: 100 page views, 0 issues;
  - `pnpm qa:vitals`, phone profile, lab numbers, on an idle machine: `/` LCP 2.08 s, TBT 241 ms (Stage 158: 1.99 s, 210 ms); `/app` LCP 1.29 s, TBT 175 ms (1.19 s, 134 ms); CLS at most 0.056, unchanged. Pages this stage didn't touch moved by as much between runs, so I read these as within normal variation, not as a proven no-cost.
- **The hero's pause:** it stops the float and the shadow, and stays paused on a return visit, with the hero fully drawn at 1280 and 375 px.
- **The landing ring:** it plays on the card a next-step button jumps to, once the scrolling stops, and it's gone 600 ms later, with or without reduced motion.
- **Watching the moments, frame by frame at 1280 and 375 px, on a temporary page removed before committing:**
  - the Seal forms once and is still on a reload;
  - the published card is readable while it rises;
  - neither causes sideways scroll.
- **The two-run test, with reduced motion on and off:** the task page, the change review and the published card have the same words and the same controls. Nothing is running under reduced motion, and the Seal is fully visible.

**Not checked in a browser, because the read-only demo can't reach them:**
- the Seal on a real verified task, which the demo correctly doesn't show, as it has no evidence records;
- pressing Publish for real;
- a run ending while someone watches, covered by a unit test on `endedWhileWatching`.

The research's runtime 3D checks on a mid-range phone also remain open.

## Next

- **Checked after the merge (2026-11-05), on production in Chrome:** the Seal leads a real verified task, 128 px and drawn from its real digest, with no console errors or policy violations. #203's Report this result opens the abuse form pre-filled; nothing was sent.
- **For the owner, in normal use:** the next publish and the next run's end are the first real look at those moments.
- **Stage 160 on:** the iPhone, the biggest remaining gap.
