# Stage 283: Home suggests what to do next, and says why

- **Date:** 2026-11-26
- **Branch:** `feat/stage-283-suggested-next`, from `main` after stage 282 was merged (#339)
- **Decision:** ADR 0291 (Home suggests what to do next, and says why)
- **Part of:** Telepathy, part 1: next-step recommendations, their explanation, and the person's corrections.
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` (one card in the place Home already had, plain sentences, no numbers for show); `ui-ux-pro-max` (progressive disclosure: the reason opens on request; a visible way back for anything switched off).

## Why

The owner told me not to stop until the platform is built. In the briefs' order of work this is the second piece of Telepathy part 1. When nothing was waiting for the person, Home's first card was empty and they had to remember where they stopped.

## What was built

- **One "Suggested next" card on Home** (`components/app/suggested-next.tsx`), in the place of "what needs you" when nothing does:
  - fix what failed, when a project's newest task failed its checks;
  - carry on where the agent stopped, when its run was interrupted;
  - read the plan and approve it, when a plan is waiting;
  - publish the project, when its newest change is verified and it has no live site.
- **Worked out by rules, not by a model** (`core/telepathy/next-steps.ts`): from the person's tasks and which projects are live. One suggestion a project, from its newest task; nothing for archived projects, for work left over thirty days, or for someone who can't act on it.
- **"Why this?"** opens the reason, built from the record it came from, and says how it was worked out.
- **"Not now"** puts it away for a week. **"Stop suggesting ..."** switches the kind off, and Settings has a switch for every kind to bring it back. Both are kept in the browser.
- Publishing is only suggested where it is set up, to someone allowed to publish, and only when the list of live sites could be read.

## What a person no longer has to do

- Remember which task failed last week, or which project was finished and never published.
- Wonder why Farbaek suggests something: it says, from their own records.

## Verified

- **Tests,** all new:
  - `core/telepathy/next-steps.test.ts` (13): each kind of suggestion and its words; a failed task with newer work after it isn't brought up; publishing only with no live site, where set up, and never when live sites couldn't be read; the order and the limit of three; nothing for archived projects, month-old work or a task dated after now; nothing while work is simply under way; names on one line; a task that fails again is a new suggestion; "Not now" for a week; a kind off and back on; what ran out is forgotten and only so many kept; what the browser stored is read without trusting it.
  - `components/app/suggested-next.test.ts` (2): nothing is drawn on the server, so a dismissed suggestion never flashes back; the switches name every kind and wait for the browser.
  - The whole suite: 5,523 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed, with the 4 GB heap its type check needs on this PC.
- **In the demo workspace, in a real browser,** with a sample suggestion put on Home for the look and then taken out again: the card closed and open at 1280px and 390px, in light and in dark; "Not now" taking it away; and the four switches in Settings at 390px. No console errors.
- **Live, 2026-11-26 at about 20:05 (+05:30), after #340 was merged** (production build e2fcc4e052a3, the merge's own): Settings showed "Suggestions on Home" with its four switches, all on and usable. The owner's Home showed "Your turn" (two changes that ran out of time) and the first steps, so no suggestion was drawn, as designed: what needs the person comes first. A suggestion from real records has still not been seen.
- **Not verified:**
  - **A suggestion from real records.** The demo's Home has a change waiting, so it shows that card, not a suggestion. To be looked at on production after the merge.
  - **The card after the last small changes** (the underline on "Stop suggesting", publishing gated on permission): type-checked and tested, not looked at again.
  - No fresh review was run for this stage: the rules are small and covered by their tests, and the card holds no data of its own.

## Next

- Look at the card on production with real tasks.
- One memory across spaces, then the three modes (Standard, Advanced, Professional).
- Suggestions from Chat's own history, and inside the spaces.
