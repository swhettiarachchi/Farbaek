# Stage 276: All work, one page for everything Farbaek is doing

- **Date:** 2026-11-25
- **Branch:** `feat/stage-276-command-center`, from stage 275's branch (it stacks on that pull request)
- **Decision:** ADR 0283
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` for the page (section headings with their icon, status as one of the thirteen kinds with its words, the counts in a sentence instead of tiles, one action for each row); `premium-app-ui` for restraint (no dashboard: four plain lists and a sentence); `ui-ux-pro-max`'s list checks (one tap target for each row, 44px actions, status never by colour alone, an empty list said in words). The owner's direction: simple, like ChatGPT.

## Why

The briefs ask for a command center, and the coverage map had it as not started. Farbaek did five kinds of work for a person on five pages; nowhere showed all of it, and nowhere had the one pause beside it.

## What was built

- **`core/command/board.ts`:** `buildBoard` sorts what was read into four lists (needs you, in progress, scheduled, just finished), each thing once; `boardSentence` says their numbers.
- **`app/work/page.tsx`:** the All work page: the sentence, the four lists, and the workspace's pause. Every row opens the page that owns the thing.
- **`components/command/board-list.tsx`:** one heading and its rows.
- **Shared reads:** Home's two private loaders moved to `server/cloud-agent/inbox.ts` and `server/automation/work.ts`, used by Home and All work. `laneSummary` moved into `core/agent/inbox.ts`, and `endedRuns` came out of Home's rule (`core/automation/home.ts`), so the two pages say the same thing about the same run.
- **Finding it:** under More tools and in search ("All work", "Command center"), and from Home's "What the agent is doing".

## Verified

- **Tests:** `core/command/board.test.ts` (18): each list's contents and order, each thing listed once, the latest eight that finished, what is said when a read is missing, and the sentence. `core/automation/home.test.ts` (22, two new for every run that ended and every row) and `core/agent/inbox.test.ts` (7, two new for the line that says where a run stands). With the design tests and the other rule tests: 991 in the last run.
- `tsc --noEmit` with a 4 GB heap, and lint on the changed files.
- **In a browser, the demo workspace,** at 375 and 1280 px, light and dark: the sentence ("One thing needs you. Nothing is in progress, and 3 are scheduled."), a change under Needs you (its workflow no longer listed beside it), the sample scheduled tasks under Scheduled, six finished runs each said as it ended, and the pause control (off in the demo, with the reason). No console errors, no sideways scroll.
- `qa:responsive --strict` on All work and Home at 320, 375, 768 and 1280 px, All work in Dark and at 200% text; `qa:a11y` on both: no findings.
- **Checked by reading:** what the workspace's pause stops. New agent runs and agents' changes are refused by the database while it is on (`agent_runs_paused`, `change_proposals_paused`), a workflow's steps are agent runs, and scheduled runs are refused since stage 275. So the card's sentence holds.
- **Not verified:**
  - **Real agent builds on the page.** The demo has none, so the rows for a build that is working, waiting on a question or ready to review were exercised in tests, not seen.
  - **Real data at all:** the page has only been opened in the demo workspace.
  - The page with a great deal of work on it (dozens of rows): it lists every scheduled task and every open item, uncapped except for what finished.

## A fresh review, before the PR

A reviewer read the stage without my notes, after its checks had passed. It found Home unchanged by the move of its loaders, and nothing shown to anyone that they couldn't already see. It found nine faults in the new page. Some I had found and fixed while it read; all are fixed now:

1. **A build's change could be listed as "Ready to review" to someone who can't approve it,** and a change that ran out of time appeared twice with opposite labels. A build is now listed for its change only when the plan's checks stopped it; a change waiting for a yes or no is the change's own row, or is counted as someone else's.
2. **"Needs you" ignored who can act.** A viewer saw "Waiting for you" on a workflow they can't continue, and an owner in a workspace with changes off saw it on a question they can't answer. For someone who can't act, nothing is said to be waiting for them: each thing is listed where it stands.
3. **The page reloaded itself every five seconds** while anything was merely waiting for review, or due. It now does that only while a build is under way or stopped on a question, or a scheduled run is running.
4. **A read that failed was said as "nothing".** Unread scheduled work is now said as missing, and the opening sentence isn't given when any list is known to be incomplete.
5. **One piece of work could be listed twice through its workflow:** as the workflow and as its step's change or build. A waiting change is its own row once; a build a running workflow started is said by the workflow.
6. **The pause card overstated.** A workflow with a step under way stops and has to be started again, and a scheduled run already under way finishes. The card says exactly that now.
7. **Work Farbaek paused stayed under "Needs you" for good.** As on Home, it leads for seven days, then is listed with the scheduled work.
8. **A draft workflow with every plan approved was missing** for the owner or admin who has to approve it. It is under "Needs you" for them.
9. **Tests that were missing:** the cases above, a finished thing whose time can't be read, the line that says where a run stands, every run that ended, and every row.

**Still open from the review:** who may answer a build's question, the archived-project filter and the mapping of a run are worked out in the page, not in the tested function. They are short, and the same rules Home uses.

## Next

- An agent's cost shown and capped in AI usage; acting from a row.
- Triggers other than time (a webhook in).
- The rest of the briefs' list in `FARBAEK_REQUIREMENTS_COVERAGE.md`.
