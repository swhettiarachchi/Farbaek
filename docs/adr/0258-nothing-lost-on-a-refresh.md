# ADR 0258: Nothing lost on a refresh, and a plan worked out again rather than cached

- **Status:** accepted (stage 250, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0239 (Generate Plan as a job with real stages);
  - ADR 0244 (a run cut off after its import can be finished);
  - ADR 0240 (sketch photos kept beside their readings once read).
- **Changes:**
  - the start screen keeps what the surveyor chose in the browser until the plan is generated;
  - sketch photos are kept in the browser until their read is saved, and a read that didn't finish can be finished from the project;
  - the apply script for migrations wraps a bare yes-or-no check and fails loudly when its read-back fails.

  No migration, no new dependency.

## Context

The owner's brief asks that "a project should not lose progress because a user refreshes a browser or temporarily disconnects", for resumable uploads and jobs, and for incremental regeneration: "a single label correction should not rebuild the entire survey plan".

Until now:

- **The start screen held its files in memory.** A refresh, a phone locking mid-choice or a dropped connection before Generate lost them all.
- **A sketch read cut off part way** (the page closed, the connection dropped, the server restarted) lost its photos. They're only kept on the server once read (ADR 0240), so the surveyor had to choose them again from the Draft step.
- **A run cut off after its import** could already be finished (ADR 0244).

## Decision

**What the surveyor chose is kept in their browser until it's safely on the server.**

- **On the start screen:** every file is kept a moment after it's added (a survey file's or code library's text, a sketch photo as shrunk, a document's name), with the title and the grid chosen. A refresh brings them back, said in one line with "Start again". They go once the plan is generated, or once a project was made before a file failed to import, and nothing is kept again on that screen. Pressing Generate Plan marks them sent first: if a refresh comes before the answer, they come back saying the plan may already be in the survey projects. Consent to read sketches is never kept: it's asked again. Only where Generate can run: the demo and view-only workspaces keep nothing.
- **Sketch photos:** before a read is sent, from the start screen or the Draft step, the photos are kept, with the read the plan had then. A saved read forgets them. When a read didn't finish, the project's Plan and Draft steps show "Sketches still to read", with the photos' names, the consent sentence, "Send and read them now" and "Forget them"; when the plan already has readings, it says reading these replaces them and the answers given about them. Nothing shows while the read may still be working: its Generate Plan run is still running, or it was sent from the Draft step in the last five minutes. If a read of them was saved after all (the plan has a newer read than when they were kept, from photos named as the server names them, with no clock compared), they're forgotten and nothing shows.
- **Whose and how long:** each key carries the workspace and the signed-in person's id, so files never come back in another workspace or account. Every signed-in page removes other accounts' entries (beside the device store's claim, ADR 0192), and signing out removes them all. Each time the store is opened, anything older than a week goes, whatever its key.
- **Where storage fails:** a private window, cleared or blocked site data, a full disk, or a browser that never answers (each call gives up after 1.5 s) keeps nothing, and the screens work as before. A look that fails never counts as nothing kept, so it can't wipe what's there. The server never trusts what's kept: every file is read again, and every read checked, as when it was first chosen.

**The plan is worked out again from its saved inputs, not cached.** Checking and composing a whole plan takes about 5 ms for a typical job and 7 ms at 3,000 points (BENCHMARKS.md). A cache of intermediate results would add invalidation to get wrong, and a stale cache could show a plan that isn't the saved one, for no time anyone would notice. What the brief's incremental regeneration protects is that a correction changes only what depends on it. Tests hold that instead:

- the same inputs give the same plan, byte for byte;
- renaming a lot leaves every outline, area, line and mark on the sheet exactly as it was;
- moving one label moves that label alone;
- filling in the title block changes no geometry and no check about the land;
- a sketch correction redraws only what the sketch drew from that number and nobody confirmed (ADR 0257).

This is revisited if production's own timings (`autosurvey-timings.ps1`) show composing a real plan taking long enough to matter.

**The migration apply script fails loudly.** v105's apply line had a bare yes-or-no read-back. The script's read-back step refused it but still printed "Done", because its `psql` didn't stop on errors. Now a bare expression is wrapped (`select 'check', (…);`), and a read-back that fails says so in yellow and exits with an error.

## Not done

- **Server-side resumable uploads** (chunks, resumed after a drop): the start screen sends survey files in one request of at most a few MB, and keeping them in the browser covers a refresh or a drop before Generate. A cut-off import is finished from the project (ADR 0244).
- **Finishing a cut-off read without the browser that started it:** the photos are only on that device until a read is saved. Keeping them on the server first needs a pending state for sketch photos (a migration), which is later work if real runs show reads being cut off.
