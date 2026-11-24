# ADR 0256: Office profiles: a surveyor's set-up, saved once, picked by the files

- **Status:** accepted (stage 248, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0237 (a returning surveyor's defaults, carried from their recent plans);
  - ADR 0243 (line words);
  - the brief's section 6 (an automatically resolved surveyor profile).
- **Changes:**
  - schema v105 (three tables, three server-only functions);
  - Generate Plan's starting document;
  - the start screen;
  - a new page, Office profiles.

  No new dependency.

## Context

The owner's AutoSurvey brief asks for a persistent profile a surveyor configures once and reuses. It holds their equipment and export formats, coordinate system, code library, drawing presentation and title-block preferences. It's picked automatically when that's clear, and asked about once when it isn't. It's versioned, and never learns legal truth from a past drawing.

Until now Farbaek carried a surveyor's last checked code list and sheet presentation from their recent plans (ADR 0237). That works, but it can't be named, shared in an office, chosen by instrument, or read back, and the carried list still waited for a check on every new plan.

## Decision

**An office profile** (`core/survey/profile.ts`) belongs to the workspace and holds:

- the grid it works in (or "ask each time");
- up to ten instruments, each with its kind, make, model and the file formats it exports, by Farbaek's readers;
- an office code library (up to 500 codes) and how the crew writes line words;
- the sheet's presentation (layout, paper, orientation, decimals, schedule, lettering, face dimensions, permit box);
- the statement printed on the plan.

It holds nothing about a piece of land: no title, lot, owner, extent, district or plan number. The scale isn't kept either, since it belongs to each land.

**Saved by the server only** (schema v105): `app_survey_profile_save` (a new profile, or a new version from the version on screen, refused when someone saved since), `app_survey_profile_archive` and `app_survey_profile_choose`.

- Each checks the actor contributes to the workspace and records an audit event.
- Every version is kept in `survey_office_profile_versions`, so what a plan started from can be read again.
- Members read profiles and versions through row-level security, and each surveyor reads only their own last choice.
- A workspace keeps 50 profiles in use and 200 with the archived ones, a profile 200 versions of up to 100 KB, and saves take a lock per workspace so the limits hold.

**Picked by the evidence** (`resolveProfile`), before anything is saved:

1. the profile whose instruments export every format uploaded;
2. if several do, the one this surveyor used last among them;
3. else the one they used last;
4. else the only profile;
5. else Generate Plan waits for one question: which profile, or none.

The screen says which it picked and why, with one control to change it. When the profile's grid differs from the one chosen on screen, the screen says so, and the plan uses the one chosen on screen. A grid is never taken from a profile without the surveyor's confirmation.

**Applied by Generate Plan** (`withProfile`), over the surveyor's own carried defaults (ADR 0237), so what the profile doesn't set (a sheet, a code list) stays as they had it:

- **The code library,** the codes the files use first, as the plan's list, **taken as checked.** Saving a library into a profile is the surveyor's own deliberate, attributable, versioned act, so the plan doesn't ask again. A library uploaded with the files still wins, and still waits for its check.
- **Line words, the sheet's presentation and the statement.**
- **The plan's first version** names the profile and its version.
- **The choice is remembered** for the next plan; choosing none forgets it.

Without a profile, the plan starts from the surveyor's recent plans, as before.

**A profile can be started from a plan** (`profileFromPlan`): its checked office list (never the common or Survey Department list, or a list nobody checked), line words, sheet, statement, and the project's grid if confirmed. Instruments are added afterwards.

## Consequences

**A returning surveyor's path is upload, then Generate Plan.** The code list check that every plan asked for once is gone when a profile carries the list.

**Not built, and why:**

- **Learning from corrections:** suggesting a change to the profile from edits made on a plan. The brief asks that such suggestions stay separate until approved; that's a later stage.
- **CAD layers, linetypes, text and dimension styles:** Farbaek's DXF writer has its own fixed layer set, so these aren't yet a profile's to change.
- **Title-block fields other than the statement:** they belong to each job.
- **Plan numbering:** a legal identifier the surveyor gives each plan.
