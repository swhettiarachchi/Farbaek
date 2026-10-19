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

## 2026-10-19: Publish, the Farbaek Studio standard and skills

Decisions: [ADR 0029](../adr/0029-publish.md) (Publish), [ADR 0030](../adr/0030-studio-standard-and-skills.md) (Studio standard and skills).

### Done

**Publish** (Phase E, ready for the domain):
- **Migration 19** adds sites and deployments, with the publish gate repeated in the database.
- **Serving** live sites at `<name>.farbaek.si` from stored revisions.
- **The project page's Publish panel:** address, what's live, history, make live, take offline.

**The Farbaek Studio standard**, from the owner's Premium Build Standard, is in the agent's instructions on every run:
- the design read and `DESIGN.md` first;
- none of the AI tells;
- purposeful motion and 3D;
- honest visuals and samples;
- complete, accessible pages, checked before finishing.

**Skills**, in Claude's SKILL.md format:
- seven built-in skills, suggested on the plan card and chosen per build;
- the project's own skills from `.farbaek/skills` or `.claude/skills`;
- a stated precedence;
- skills can't widen the contract.

**Previews** can load pinned libraries from jsDelivr, unpkg and cdnjs.

### Verified

- **Unit tests** (717 at the time, plus the new ones): the publish gate, names and digest, serving, the use case, skills parsing, ordering, limits and suggestions, the agent's instructions, and a cloud run that passes the chosen and project skills and names them.
- **Database tests:** migration 19 in PGlite (5 tests) and the schema-wide tests (33).
- **Live, on a local production build against the hosted project:**
  - "A futuristic one-page site for Volt Ride…" gave a plan with `DESIGN.md` in scope.
  - Motion, 3D and Brand identity were suggested and chosen.
  - The run said "Building to the Farbaek Studio standard, with these skills…", wrote `DESIGN.md` first, then the site, in 4 steps and 5% of usage.
  - The result has a distinctive dark and electric-lime identity, working navigation and menu, scroll reveals, a booking form that validates and says nothing is sent, and a real three.js hero with fallbacks.
  - The change was applied to the test project.

### Not verified

- **The three.js hero rendering:** this PC reports 4 cores, which the first version of the 3D skill treated as weak, so it showed the still fallback. The rule now matches Farbaek's own.
- **Publish end to end:** it needs the farbaek.si domain connected (see the farbaek.si section).

### Migration 19 on the hosted project (2026-10-19)

- **Applied** after the owner's "set up everything".
- **Hash check:** the SQL Editor held exactly the tested file (SHA-256 `8d8080121c4b8f1929574dec134b0745510eef33da58bb6235569d411cf2a9a2`, 9,302 bytes).
- **The RLS warning:** Supabase warned that a table had no row-level security, because its check misses the `enable row level security` lines further down. It was run as written ("Run without RLS" runs the SQL unchanged).
- **Read-only checks afterwards:**
  - `sites` and `site_deployments` have row-level security on, with one read policy each;
  - `authenticated` can't insert or execute `app_publish_site`;
  - `service_role` can.

### Next

1. The owner merges swhettiarachchi/Farbaek#3, which now carries all of this, and approves applying migration 19.
2. farbaek.si:
   - the Railway domain;
   - the Hostinger DNS records;
   - `SANDBOX_PREVIEW_DOMAIN` and `SANDBOX_PREVIEW_SECRET`.
3. A `review_site` tool for the agent's own checks.
4. Custom skills from the app.
5. Lifting the starters and templates to the standard.
6. An image-generation integration, if the owner chooses a provider.

## 2026-10-19: The agent checks its work, project skills in the app, templates to the standard

### Done

**`review_site`** is a read-only agent tool. It checks the project's pages the way a careful reviewer would:
- links, anchors and referenced files;
- titles, descriptions, viewport and `lang`;
- alt text and labels (a control inside its `<label>` counts);
- motion without a reduced-motion fallback, and hidden focus;
- em dashes, lorem ipsum and leftover placeholders.

The Studio standard tells the agent to run it after its last change and fix what it marks.

**Project skills from the app.** The project page has a Skills section:
- paste or load a SKILL.md, and it's saved as `.farbaek/skills/<name>/SKILL.md`;
- remove one with a button;
- a skill without a frontmatter name takes its first heading.

Published sites never serve hidden folders (`.farbaek`, `.claude`); `.well-known` is still served.

**Publish says what happened.** Make live and Take the site offline report success and failure, and the "Published" note clears once a site is offline. Suggested names keep the subject: "One-page site for Volt Ride" becomes `volt-ride`.

**The six templates, rebuilt to the standard.** Each has a `DESIGN.md`, its own direction, a signature and one feature that works:

| Template | Direction | Signature and working feature |
| --- | --- | --- |
| Landing page (Tidewater) | Calm, cool, rounded type | A floating 3D week over a drifting tide; a planner that spreads your notes over the week |
| Software site (Ledgerly) | Precise, ledger mono numbers, one orange | A tilted, working invoice screen (reminders send, invoices get paid); a chase timeline you scrub |
| Portfolio (Jordan Lee) | Black-weight type, one cobalt | A name that builds itself; drawn case-study covers that tilt; a copyable email |
| Local business (Harbor Café) | Nautical, harbour signage type | An illustrated cup with rising steam and a rocking boat; a live open-now status; a menu filter |
| Event page (Build Day 2027) | Blueprint, condensed engineering type | A 3D ticket that turns over and fills in as you register; a live countdown; a track filter |
| Blog (Field Notes) | Editorial, serif for reading | Line drawings that draw themselves; a reading-progress line; light and dark themes |

They still fetch nothing. The motion runs without JavaScript, so gallery thumbnails (no scripts) look alive. Nothing is hidden unless `script.js` is running. Looping motion pauses off screen, and everything stops under reduced motion. ADR 0030 records the change to ADR 0028's "plain HTML and CSS".

### Verified

- **Unit tests:** 885 pass.
  - New tests: every template has a `DESIGN.md` in the standard's shape and a clean `review_site` (zero findings);
  - every template has a reduced-motion fallback, scripts that parse, and no content hidden without the `.js` class;
  - also the wrapped-label rule, hidden folders on published sites, and the name suggestions.
- **Each template in a browser, at desktop width and at 375 px:**
  - every interaction was exercised: the planner with a `!` line and more than 21 tasks; reminders, payments and the total; the timeline, tone and billing switches; the open-now status (Monday evening showed "Closed now, opens tomorrow at 7 am"); the menu and track filters; the ticket filling in and turning over; the form errors; the theme switch;
  - no horizontal scroll at 375 px.
- **In the app, on a local production build:** the gallery thumbnails render complete with scripts off. The template previews run their scripts in the sandbox with no console errors.
- **Publish:**
  - the `volt-ride` test site was taken offline through the panel;
  - the site domain then answered "There's no site here" (404);
  - a project skill (`volt-voice`) was added from the page.

### Not verified

- **A full agent build starting from one of the new templates.** The standard and `DESIGN.md` are in place, but no run has used them yet.
- **Safari and Firefox.** CSS scroll-driven animation (the blog's progress line) is skipped where unsupported, by design.

### Next

1. The owner merges swhettiarachchi/Farbaek#3 and connects farbaek.si (the Railway domain, the Hostinger DNS records, `SANDBOX_PREVIEW_DOMAIN` and `SANDBOX_PREVIEW_SECRET`).
2. The plain starters (static website, Next.js app) to the standard.
3. A build from a template, end to end.
4. An image-generation integration, if the owner chooses a provider.
