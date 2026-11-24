# Stage 250: AutoSurvey, nothing lost on a refresh

- **Date:** 2026-11-24
- **Branch:** `feat/stage-250-resume`, on main after #313.
- **Decision:** ADR 0258
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: what's kept is never trusted, and the evidence and its consent stay the server's;
  - `farbaek-ui` and `farbaek-human-made` for the line on the start screen and the card on the project.

## Why

The owner asked for the brief to be built in full. Its §7 and §19 ask that a refresh or a dropped connection loses no progress, for resumable uploads and jobs, and for incremental regeneration. Before this stage, a refresh on the start screen lost every file chosen, and a sketch read cut off part way lost its photos.

## What was built

- **`components/survey/staging.ts`:** a small browser store (IndexedDB) for what a run still needs. Each key carries the signed-in person's id; entries older than a week are forgotten; any failure keeps nothing and breaks nothing.
- **`components/survey/start-uploads.ts`:** the start screen's files as they're kept and back; what sketch photos are kept as; and whether kept photos were read after all, by time and by the names the server gives them (`sketchFileNames`, now shared with the server).
- **The start screen:** keeps its files, title and grid as they change. A refresh brings them back with one line: "The 2 files you chose before are back. They stay in this browser until the plan is generated, for a week at most", and "Start again". Generated, they're forgotten. Consent to read sketches is never kept.
- **Sketch photos:** kept before a read is sent, from the start screen and the Draft step, and forgotten once it's saved.
- **"Sketches still to read"** on the project's Plan and Draft steps: the photos' names, the consent sentence, "Send and read them now" and "Forget them". It shows nothing when the read was saved after all.
- **The migration apply script:** a bare yes-or-no check is wrapped in a select, and a read-back that fails says so and exits with an error, rather than printing "Done" as it did for v105.
- **Incremental regeneration, decided:** the plan is worked out again from its saved inputs, which takes about 5 ms, rather than cached. Tests hold what the brief protects instead: a correction changes only what depends on it.

## A fresh review, and what it changed

A review agent found eleven problems. All are fixed, the rules with tests.

1. **The resume card showed while a read was still working,** and pressing it would have paid for a second read that replaced the first. It now waits while the run that sent the photos is running, or for five minutes after a Draft step read.
2. **The card never went away** once its photos were read or forgotten. It clears itself.
3. **Newer photos with a phone's usual names ("image.jpg")** could be taken for an earlier read within a ten-minute clock allowance and forgotten. A read now counts only if it's newer than the one the plan had when the photos were kept; no clock is compared.
4. **The card said "added" where a read replaces.** It says what reading these replaces.
5. **Kept start files weren't scoped to a workspace,** so a firm's files could come back in another workspace. Keys carry the workspace.
6. **A browser that never answers** could hold the start screen on "Drawing your plan…" or stop a Draft read being sent. Every storage call gives up after 1.5 s, and removals aren't waited for.
7. **Files could be kept again after the plan existed,** or come back after a refresh mid-run as if nothing was made. Nothing is kept once the plan (or a half-imported project) exists, and files sent to Generate come back saying the plan may already be in the survey projects.
8. **"A week at most" wasn't true** for entries never looked at again, or for an account that signed out on a shared computer. The store sweeps old entries whenever it opens, other accounts' entries go on every signed-in page, and signing out clears it.
9. **Every keystroke rewrote everything kept.** Keeping waits 400 ms after the last change.
10. **A failed look could wipe what was kept.** A look now says found, nothing or failed, and only a look that worked lets the screen keep files.
11. **Smaller:**
   - a bare migration check ending in a semicolon is wrapped correctly;
   - the whole-plan tests now say exactly what may change (the title paragraph may wrap around a renamed lot or land; every other text stays within a letter's width) and what may not;
   - the demo and view-only workspaces keep nothing, since they can't generate;
   - the run view's wording about photos matches the card;
   - long photo names wrap.

## v105, and stage 249 in production

- **v105** (office profiles) was applied by the owner on 2026-11-24 from #312's fixed file. Its line's read-back was a bare expression, so the old script's read-back failed and still said "Done". `check-migrations.ps1` read v105 back as `t`.
- **Stage 249 live:** on the owner's real job in production, "It's 20: use 20 for the 10 read" made version 5. The lot went through 20, at 125.84 m² (it was 112.26), and the crossing question went. The tighter fit then offered "It's 17: use 17 for the 14 read", left for the owner. Run locally, both corrections give corners 1, 35, 18, 20, 21 and 22 at 132.70 m²: the surveyor's lot.

## Verified

- **`components/survey/start-uploads.test.ts`:**
  - what's kept is only what can be sent;
  - it comes back as the screen shows files;
  - a damaged entry is left out;
  - kept photos come back only whole;
  - Generate Plan's "sent" mark comes back;
  - "read already" needs a newer read than the plan had, of photos named as the server names repeated "image.jpg".
- **`core/survey/incremental.test.ts`:**
  - the same inputs give the same plan, byte for byte;
  - renaming a lot leaves every outline, area, line and mark, and every text but the title paragraph within a letter's width, changing only B to C;
  - moving one label moves it alone;
  - changing the land's name changes only the title paragraph.
- **In the browser** (dev demo, before the review's fixes; after them the demo keeps nothing, since it can't generate):
  - a points file added, the page refreshed, and the file back, read again, with the line saying so;
  - "Start again" clears it, and nothing comes back after another refresh;
  - the card for kept photos at 1280 in light and 375 in dark, shown on the Sample only for the look and removed after, with its button off and the Sample's reason under it.
- **Checks:** `tsc --noEmit` with a 4 GB heap, lint on the changed code, and the survey and component tests.

## Not done, and why

See ADR 0258:

- server-side resumable uploads in chunks;
- finishing a cut-off read without the browser that started it, which needs the photos kept on the server before reading, a migration.
