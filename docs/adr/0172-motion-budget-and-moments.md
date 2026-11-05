# ADR 0172: A motion budget, and three moments

- Status: accepted (2026-11-05).
- Follows the owner's research report of 2026-11-05 on hybrid iOS rules and premium UX, kept outside the repo; what this decision takes from it is stated below. Builds on ADR 0052 (3D and film load carefully) and ADR 0170 (where the Seal went).

## Context

The owner asks for an app that feels cinematic and alive, with beautiful animation and 3D. The research found the way to get there without hurting the product:

- Everyday UI stays quick and quiet. Feedback takes about 100 ms, a change of view 200 to 300 ms, and product UI never reaches 500 ms. Exits are quicker than entrances, and only `transform` and `opacity` animate.
- Expressive motion is for hero moments only, "which for Farbaek means first run, publish and success".
- It found no measured evidence that 3D helps working screens. Forms, lists, tables and editors have no WebGL, and 3D is kept for rare moments with a still to fall back on.
- Motion that starts by itself and lasts over five seconds can be paused (WCAG 2.2.2).

Meanwhile:

- Stage 157 folded the verified Seal, Farbaek's best moment, into Full details, so someone finishing a task no longer saw it.
- Publishing was one line of green text.
- A run finishing while someone watched just gained a card.
- Nothing kept motion within a budget.

## Decision

**A written budget, which a test enforces** (`tests/design/motion-budget.test.ts`, over the signed-in app):
- `--motion-feedback` 100 ms, `--motion-ui` 240 ms, `--motion-exit` 160 ms, `--motion-moment` 420 ms, and `--ease-expressive`, which overshoots a little, for transforms in hero moments only.
- No `transition-all`. No transition of 500 ms or more, except Studio's preview changing width.
- No animation of 500 ms or more, except a first run's progress, a security score filling in, and the core's loops, which mean the agent is working.
- Everything that moves is `motion-safe:`.
- The moments' own keyframes touch only `transform` and `opacity`.
- The public site and the films are exempt, as the research says of marketing reveals.

**Three moments.** Each is rare, plays at most once, never holds anyone up, and says the same under reduced motion, where it's simply there.

1. **Done and checked.** The next-step card on a verified task carries the Seal, generated from the real digest, and it forms in 3D the first time. `verifiedSeal` fails closed: the newest record decides, so an older success can't stand in for a damaged record or a newer failure, and a check receipt counts only if it ran against the applied files. No such evidence means no Seal, and the Seal says what the evidence is. The Seal's own forming, about 1.5 seconds, stays as it was, as the one thing past the budget, because it's once per digest and nothing waits for it.
2. **Your site is live.** Pressing Publish now ends in a card with the real site's picture rising into place in CSS 3D, the address, Open your site and Copy address. It's only the answer to that press, so a reload can't replay it.
3. **The agent finished.** A run that ends while someone watches has its result rise into place, and Review and apply becomes the main action. A reload at a finished run shows it plainly (`endedWhileWatching`).

**Everyday motion, inside the budget.**
- A next-step button leaves a short ring around where it landed, once the scrolling stops. It's a fade, so it stays under reduced motion, as the research allows for hierarchy.
- Folds fade and rise over 200 ms.
- Usage bars slide with `transform` instead of changing `width`. The right end stays round, and the browser doesn't lay out on every frame.
- The aurora rests in the signed-in app, since it's decoration behind a form. It keeps breathing on the public site.

**3D.**
- A lost WebGL context, which phones do under memory pressure, falls back to the still (`fallBackOnContextLoss`).
- The hero has a Pause motion button, remembered in this browser, for the float, the shadow and the Loom.
- No WebGL was added to working screens. The moments use CSS 3D. This is deliberate.

## Consequences

- The peak of each main flow now feels earned, and everything else stays quick.
- New motion has to fit the budget, or name why it doesn't.
- Publishing and a real run's end can't be reached in the read-only demo, so they get their first real look on production in normal use.
- The research's runtime 3D checks on a mid-range phone remain open: nothing here measures a Helio G99-class device.
