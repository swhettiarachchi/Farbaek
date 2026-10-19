# Stage 6: Farbaek for everyone

The plan: the first hour, the live workspace, then Publish.
- **Phase A:** from one sentence to a running agent.
- **Phase B:** the run page becomes the workspace.
- **Phase C:** meaningful 3D and motion.
- **Phase D:** templates and rescue import.
- **Phase E:** Publish on farbaek.si.

Decisions: [ADR 0027](../adr/0027-prompt-first-and-run-steering.md) (prompt-first builds, run steering, instant static previews).

## 2026-10-19: Phases A and B

### Done

**Phase A: one sentence to a running agent.**
- One prompt box ("Describe what you want to build") on the home page, Mission Control, Build and the sidebar's New build.
  - Before sign-in the prompt is kept in `localStorage` and sent again after; never in a URL.
  - Someone without a workspace gets "My workspace" first.
- `startFromPrompt` creates the project from a fitting starter, the task, and AI-drafted contract version 1, reporting partial success honestly.
- **The plan card** at `/app/new/[taskId]`:
  - what will change, how it's checked, what stays untouched, what happens if it goes wrong, open questions;
  - an estimated share of usage per effort;
  - Approve and build (hash-bound approval, then a cloud run), Edit the plan, and Cancel task.

**Phase B: the run page as a workspace.**
- **Talk to the agent:** a message bar on live runs. Messages show as "you" notes and reach the agent at its next step as guidance within the contract. A message that arrives after the last step gets a note saying it wasn't used.
- **Usage in the open:** "Used so far" while the run works, "Used" after, and refunded steps, from the run's ledger rows.
- **Preview beside the run:** static sites render in a sandboxed `srcdoc` frame with no Farbaek access, and scripts can't make network requests. It offers Before and "With this change", pages, and phone, tablet and desktop widths. The project page has the same live preview.
- **Keep going:** a follow-up composer on finished runs and on the project page, planned into the same project. A note appears when the last change isn't applied yet.
- **Plans name real files:** the drafter gets the project's paths, for follow-ups and for the task page's Draft with AI.
- **Layout:**
  - steps, run details and files on the left;
  - the preview holds the right column and stays in view;
  - Review and apply is also in the Agent Core card;
  - the run page links back to its project.

**Fixes found while checking:**
- **Wallet:** the issued trial grant was matched to its spec by string. The database writes `+00:00` and the spec has `Z`, so the trial was listed twice and the AI usage meter read 0%. It's now compared as instants. Enforcement was never affected.
- A doubled full stop in the "No sandbox this time" note.
- The preview now opens on the newest version after the page reloads with new ones.
- The preview's note now says plainly that https images and fonts load.

### Verified

- **Unit tests:**
  - the prompt helpers and estimates;
  - the orchestrator's order and its failure paths;
  - the paths given to the drafter;
  - the loop taking queued messages at the next step;
  - message limits, roles, and the "wasn't used" note;
  - srcdoc building and escaping, the page and link rules, the change overlay;
  - wallet matching with database timestamps.
- **Counts:** 677 unit tests pass (14 skipped).
- **Database tests:** all 15 files (155 tests) pass, run one file at a time. Several at once run out of memory on this 3.8 GB PC.
- **Typecheck, lint and the production build pass.**
- **Live, on a local production build against the hosted project** (owner's workspace, small real spend on the server key):
  - "A one-page site for Sunrise Bakery…" gave a real Haiku plan. Approve and build ran it to the finish in 3 steps (review only: the trial's sandbox minutes are used up), using 1% of the period.
  - On the run page, the preview showed Before (the starter) and "With this change" (the bakery site) at desktop and phone widths, and the usage chip read "Used 1%".
  - The change was applied from the task page, and the project page's live preview then showed the bakery site.
  - A follow-up, "Add a testimonials section under the menu…", was planned with `index.html` and `styles.css` as its scope. Before the paths fix, a first attempt guessed `src/components` and `src/pages`; that plan was cancelled from the card.
  - **Steering:** "Please give each quote a first name only, like Nimal or Ayesha, and keep the quotes under 15 words" was sent mid-run. It showed as a "you" note, and the agent's change used Nimal, Ayesha and Kamal with quotes under 15 words.
  - **Wallet:** one "Trial usage" row (97% left), and the AI usage meter reads 3%.

### Not verified

- **The run page at 375px after the layout change.** The signed-in Chrome window was minimised, so it couldn't be resized, and the app refuses to be framed. The changes are desktop-only (`lg:`); the phone pane switcher is unchanged from the version checked in stage 5.
- **Production.** Phases A and B reach www.farbaek.com when the owner merges the pull request.

### Next

1. Open the pull request for Phases A and B; the owner merges; check the live site.
2. Phase C: the agent inbox on Mission Control, the presence orb, the 3D Seal, the command palette, motion polish, and the `farbaek-ui` skill.
3. Phase D: templates and rescue import.
4. Phase E once farbaek.si is bought: wildcard domain, live app previews, Publish.
