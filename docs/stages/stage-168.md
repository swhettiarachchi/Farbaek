# Stage 168: Human-made, not generated

- **Branch:** `feat/human-made`, from `main`.
- **ADR:** 0180. No migration.
- **Skills used:** `taste-skill:design-taste-frontend` and `taste-skill:high-end-visual-design` for the list of tells, `ui-ux-pro-max` for the rules on status, touch and small text, `anthropic-skills:skill-creator` for the shape of the new skill, `farbaek-ui` for the system, and `built-in-browser` to look at the result. The new `farbaek-human-made` skill holds the standard from now on.

## What the owner asked

Six crops of Farbaek's own screens, and a permanent standard: remove everything that makes an interface look AI-made, including small text, numbers and generic icons; use professional type, well-crafted text and professional icons; and apply it to Farbaek and to everything built with Farbaek, so nobody can tell Farbaek was used.

## What was decided

ADR 0180, in short: status is a word in its colour and border, with an icon only for done and failed; mono is for data people copy, so a model is shown by its product name; no drawn dots; numbers only when real and useful, in sentences; icons name the action; and the same tells are banned for what the agent builds. A skill holds the full table, and a test enforces what a scan can catch.

Each crop, and what it became:

| The crop | Now |
| --- | --- |
| "Turning on" with an hourglass | "Turning on", the word alone in its colour |
| A flask standing for "Built" or "Beta" | The word, or a check |
| "Needs approval" with an hourglass | "Needs approval", the word alone |
| "0:00" on a film that hasn't played | The film's length until it plays, then "0:14 of 1:32", in Geist with tabular figures |
| "1 change no line of the plan explains" as a chip with a question mark | A line in a list: "1 change that no line of the plan explains" |
| Monospace tool names with coloured dots | That card isn't in the product any more. The rule that would have caught it is in the skill and the test |

## What was built

- **The standard:** `.claude/skills/farbaek-human-made/SKILL.md`, the table of tells and what replaces each, for Farbaek's screens and for what it builds. `CLAUDE.md` points at it.
- **The guard:** `tests/design/human-made.test.ts`. No hourglass, flask, test tube, fingerprint, circuit or lightning icon on the web or in the desktop app; no hourglass symbol in the iPhone app; no drawn status dots (a radio control's dot and the unread marker are real things); no mono on a model; no literal 0:00.
- **One way to draw a status:** `StatusBadge` and `RunStatusBadge` take an optional icon, and every state table in the app follows: tasks, runs, proposals, workflows, test spaces, handoffs, launches, transfers, support, agent leases, failure trials, the approval wallet, the showcase's capability pills, the marketing status section, the desktop app's badges.
- **Models by name:** `modelName()` in the rate card, used on the run page, the plan editor, proposals, second checks, task notes, failure trials and the office's model page. "claude-haiku-5-5" reads "Claude Haiku 5.5".
- **The run page** says "Step 7 of a balanced run on Claude Haiku 5.5" and "Used so far: 2% of this month's AI usage, with a cap of 8%", with the cap's meter under it, instead of five pills.
- **Icons that name the action:** approve is a check; try is play; top up is a plus; priority support is the lifebuoy; proof is the Seal; tests are the test space; office security is the shield; "ran on its own" is play.
- **Dots gone:** spinners for live work (security check, live-site check, film loading, office search), a warning for "files changed since", real list bullets, words for "Active".
- **The film player** shows the film's length until it plays, and its chapter list names the chapters without a timecode beside each: the scrubber shows where you are.
- **"What this task has used"** names the models it used, not their ids.
- **What Farbaek builds:** the Studio standard names the production tells (version stamps, numbered sections, scroll cues, city-and-time strips, coloured dots, monospace words, fake-precise statistics, photo credits, version footers, glyph-only status), and `review_site` flags the ones a scan can find, with a test for each.
- **The desktop app and the iPhone app** follow the same rule in code. The desktop change ships with its next release; the iPhone change with its next build.

## Checked

- `tests/design/human-made.test.ts` was red on 45 places, and is green.
- Typecheck, lint and the full test suite.
- The review's new checks on a page seeded with every tell.
- On the demo workspace in the built-in browser: the task page's status chips (no glyphs, the words alone), the approvals wallet's facts as lines, the home page's capability pills and film player (the length until it plays, chapters without timecodes). The demo has no run of its own, so the run page's sentences were checked by type and by reading, and are looked at on production after the merge.
- Farbaek's own templates against the new review: three of them carried the dot tell (a payment row, a "booking" status, a pipeline column), and each now says it another way: a check for the chosen row, the sentence alone, a colour line on the column.

## Not checked yet

- **The recorded films** show the old chips until `pnpm films:record` is run on a machine with room for it.
- **The desktop app** on a real computer, in its next release.
- **The iPhone app's build** on GitHub's runner, which the push starts.
