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

## 2026-10-19: Live on www.farbaek.com, the preview domain, Phases C and D

Decisions: [ADR 0028](../adr/0028-presence-templates-rescue.md) (agent presence, templates, rescue import).

### Live

- Pull request swhettiarachchi/Farbaek#2 (Phases A and B) was merged. `/api/health` on www.farbaek.com reports `ab640adae0f4`.

### farbaek.si (in progress)

- **Bought** by the owner at Hostinger. It resolves through Hostinger's DNS (`athena` and `apollo.dns-parking.com`).
- **Before any DNS points there:** the proxy now keeps Farbaek off the preview domain. Only `p-<id>` preview hosts are served; the bare domain redirects (308) to Farbaek's address, and every other name gets a plain 404, so the app and its sign-in never appear on the domain for people's content. This is in pull request swhettiarachchi/Farbaek#3.
- **Railway:** adding the custom domain `*.farbaek.si` (port 8080) is blocked for me by auto mode, as the www domain was. The form is filled in for the owner.
- **Still to do:**
  1. merge #3;
  2. add the domain on Railway;
  3. add Railway's 2 CNAME records and 1 TXT record in Hostinger's DNS;
  4. set `SANDBOX_PREVIEW_DOMAIN=farbaek.si`, and `SANDBOX_PREVIEW_SECRET`, which the owner generates and pastes.

### Phase C: done

- **Agent inbox** on Mission Control: Needs you, Working, Ready for review and Done, each run with a small Agent Core and one line on where it is. The page refreshes itself while an agent is live.
- **Presence orb** in the sidebar and phone header, from a light status route. It checks often while an agent is live and pauses when the tab is hidden.
- **Command palette** on Ctrl or Cmd+K, plus a sidebar button: pages, projects, templates, the rescue import, a build from what's typed, and switching workspace.
- **The verified Seal forms once**, in 3D, when it first comes on screen.
- **Sidebar:** its controls no longer squeeze on short screens.
- **The `farbaek-ui` project skill** (`.claude/skills/farbaek-ui/`): the design system, components, motion and 3D rules, copy, and the React patterns the lint expects.

### Phase D: done

- **Six templates:** landing page, software site, portfolio, local business, event page and blog.
  - A gallery with live, script-free thumbnails and a full preview page each.
  - "Use this template" leads into the prompt flow with the template chosen.
- **Rescue import:**
  - a `.zip` is unpacked and screened in the browser;
  - the server creates a project, imports the files and starts a security check;
  - a zip bomb, ZIP64, encryption and bad checksums are handled.

### Verified

- **Tests:**
  - inbox lanes and presence;
  - palette matching;
  - every template's screening, links and that nothing is fetched;
  - a chosen template winning over the prompt's words;
  - the zip reader: Farbaek's own writer, deflate, size and total caps, a lying size, encryption, CRC, not a zip, too many entries;
  - the rescue zip (top folder, secrets, dependency folders);
  - the rescue use case's outcomes.
- **On a local production build against the hosted project:**
  - the inbox showed the real runs in the right lanes (one ready for review, two done);
  - the palette found the bakery project, offered "Plan a build: …" for a longer phrase, and opened Billing on Enter;
  - the gallery's six thumbnails, a template's preview, and New build with `?template=local-business` (the starter field set, the example as placeholder) all worked;
  - both verified Seals on the README task waited off-screen, then formed at 160px;
  - a deliberately flawed app zipped with Windows' tar imported as 3 files with `node_modules` left packed, and its check scored 53 (grade D), finding the DOM XSS and the `eval`;
  - by Host header: `farbaek.si` returned 308, `login.farbaek.si` 404 on `/`, `/app` and `/sign-in`, and a `p-` host reached the gateway.

### Not verified

- **Phone width (375px)** for the inbox, palette, gallery and rescue page. The owner's Chrome was minimised, and the app refuses framing. They use the same grid and pill patterns as checked pages.
- **The Seal mid-animation:** screenshots a second apart caught the hidden and finished states only.

### Next

1. The owner merges #3 (it now carries Phases C and D too), then the domain steps above.
2. Phase E: live app previews on `p-<id>.farbaek.si` once the domain and secret are set, then Publish (ADR 0029, migration 19).
