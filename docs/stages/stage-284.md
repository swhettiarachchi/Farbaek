# Stage 284: memory reaches the plans Build drafts

- **Date:** 2026-11-26
- **Branch:** `feat/stage-284-memory-in-build`, from `main` after stage 283 was merged (#340)
- **Decision:** ADR 0292 (what a person asked Farbaek to remember reaches the plans Build drafts)
- **Part of:** Telepathy, part 1: one memory across spaces, its first step.
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `ecc-security-review` (whose memory, where it goes, the switch honoured on the server, personal facts in a plan teammates can read); `farbaek-ui` (one sentence in the editor's note and one in settings, no new control).

## Why

Memory lived in Chat only. A person who told Chat their business's name and colours had to say them again every time they asked Build for a site. The briefs ask for one memory across the spaces.

## What was built

- **The plan's drafter is given what the person asked Farbaek to remember** (`DraftBrief.remembered`), in the two places a plan is drafted on the web: starting a build from a sentence, and "Draft with AI" in the plan editor.
- **A few lines, not the whole memory** (`memoryForBrief`): the newest twelve at most, each one plain line, 1,200 characters in all.
- **As information, never instructions:** the drafter's rules say to use what bears on the task and leave the rest out of the plan.
- **Only the person's own,** read as them (`rememberedForWork`); never held up or failed by it.
- **The same switch.** The browser writes its memory switch as a cookie (`fb_memory=off` only while it is off), and every signed-in page keeps it true (`MemoryCookieSync`), so the server can honour it outside Chat.
- **The person is told:** the plan editor's note says how many remembered things the drafter was given, and Chat's settings say where memory is used.

## What a person no longer has to do

- Repeat their business's name, colours or preferences in every build request.

## Verified

- **Tests,** new unless said:
  - `core/chat/memory.test.ts` (3 new): what goes with a brief (newest first, one line each, within a size); memory is on unless the browser said off; the cookie as written, for a year when off and cleared when on.
  - `server/ai/prompts.test.ts` (1 new): the brief carries what is remembered as information about the person, counts it in the reserved tokens, leaves it out when there is none, and never carries more than a few short lines; the drafter's rules say what it is.
  - `server/workspace/ai-drafting.test.ts` (1 new): the use case says how many went with the brief.
  - `server/workspace/start-from-prompt.test.ts` (1 new): starting from a sentence gives the drafter what is remembered, and nothing of the kind when there is none.
  - The whole suite: 5,529 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed, with the 4 GB heap its type check needs on this PC.
- **Not verified:**
  - **A real plan.** No model has drafted a plan with something remembered yet. To be tried on production after the merge: remember a business name in Chat, then ask Build for a site.
  - **The cookie in a real browser:** that switching memory off in Chat's settings writes it, and that a page load restores it. The cookie's text and the server's reading are tested; the browser's own writing is not.
  - **The editor's note and the settings sentence on a screen:** text only, not looked at.
  - No fresh review was run for this stage.

## Next

- Try it on production.
- The three modes: Standard, Advanced, Professional.
- Memory for the build agent itself and for the phone apps, each with a switch to honour.
