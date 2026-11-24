# Stage 248: AutoSurvey, office profiles

- **Date:** 2026-11-24
- **Branch:** `feat/stage-248-office-profiles`, on stage 247 (PR #310).
- **Decision:** ADR 0256
- **Migration:** v105 (`20270115090000_survey_office_profiles.sql`): three tables and three server-only functions, additions only. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: a profile never holds legal truth about land, and the grid is never inferred;
  - `farbaek-ui` and `farbaek-human-made` for the page and the start screen.

## Why

The owner's brief (section 6) asks for a surveyor's set-up to be configured once, picked automatically and versioned. The owner then gave full access to set up and keep building. Until now a new plan only carried the last checked code list and sheet from the surveyor's recent plans (ADR 0237).

## What was built

- **Schema v105:**
  - `survey_office_profiles`, `survey_office_profile_versions` (every save kept) and `survey_office_profile_choices` (each surveyor's last choice);
  - read through row-level security;
  - written only by `app_survey_profile_save` (with a version check), `app_survey_profile_archive` and `app_survey_profile_choose`, each audited.
- **`core/survey/profile.ts`:** the body's schema; `resolveProfile` (files' formats, last choice, only one, or ask); `withProfile`; `profileFromPlan`; `profileSummary`.
- **`server/survey/profiles.ts`:** the reads.
- **The store and actions:**
  - saving, archiving, and starting a profile from a plan;
  - Generate Plan takes the chosen profile, refuses one not in the workspace, remembers the choice, and names the profile in the first version.
- **The start screen:**
  - the profile picked and why, one control to change it;
  - waits for a choice when the evidence leaves more than one;
  - says when the profile's grid differs from the one chosen;
  - the codes and sheet lines say where they come from.
- **The Office profiles page** (`/app/survey/office`): each profile with its summary and version; a form to change it (a new version), its earlier versions, archiving with a confirmation, a new profile, and starting one from a plan. It's linked from Survey Studio beside Surveyor details.

## A fresh review, and what it changed

A review agent found five real faults and two copy problems. All are fixed, the first three with tests.

1. **A profile without a sheet or a code list dropped the surveyor's own.** An office with one profile holding only instruments would have lost every surveyor's last sheet and checked list. Generate Plan now applies the surveyor's carried defaults first and the profile over them; the start screen says the same.
2. **Saving a new profile twice made two.** The new-profile form now empties after a save and is remounted when the list grows.
3. **Choosing "None" wasn't remembered,** so the old profile came back as "used last". Choosing none now forgets the choice (`app_survey_profile_choose` with null).
4. **Two errors said the wrong thing** (the project limit, a project not found). They now speak of profiles.
5. **The 50-profile limit could be raced, and versions had no limit.** A save now takes a lock per workspace. A workspace keeps 50 profiles in use and 200 with the archived ones; a profile keeps 200 versions, each up to 100 KB.

The copy problems:

- **The grid's "from the office profile" note** now shows only while that profile is the active one.
- **A library over the 80 codes a plan keeps** says how many of them are kept.

Smaller fixes:

- the migration's comment now says which functions are audited;
- `/app/survey/office` is in the responsive and accessibility audits' routes.

## Verified

- **`tests/db/survey-office-profiles.test.ts`** (PGlite, the real migrations):
  - members read and others don't;
  - every version is kept, and a save from an old version is refused;
  - a stranger, another workspace's profile, a blank name and a non-object body are refused;
  - a choice is the surveyor's own, and archiving drops it and keeps the versions;
  - nobody but the server calls the functions or writes the tables.
- **`core/survey/profile.test.ts`:**
  - the body's rules;
  - picking, by files over the last choice, a tie by the last choice, asking when nothing settles it;
  - what a plan takes: the list as checked, line words, sheet and statement, nothing about the land;
  - starting from a plan only takes a checked office list;
  - the summary.
- **`app/survey/generate.test.ts`:**
  - Generate Plan with a profile;
  - an unknown profile refused before anything is saved;
  - saving only a whole profile, including the version-conflict message.
- **In the browser** (dev demo, which can't save):
  - the page at phone width with an instrument row, no sideways scroll, and Save saying why it's off;
  - the start screen's line pointing to office profiles.
- **Checks:** the database, profile, Generate Plan, design and sketch tests (349 + 25); `pnpm typecheck`, lint, and `pnpm build` with a 4 GB heap (see the commit).

## A fault found after the PR opened

Stage 249's run of the database tests found v105 wouldn't load: the review fix for choosing "None" lost one character, so `app_survey_profile_choose` opened its body with `as $` instead of `as $$`. The database tests had passed before that fix and weren't run again after it.

- **Production was never touched:** the apply script runs a migration in one transaction and stops at the first error, and the read-back on 2026-11-24 showed v105 not applied.
- **Fixed:** the dollar quote restored; the SHA-256 of the LF copy is now `96946dae345f5600688a75a53a7f649a7eaaabafcaeadce278da82f272b7c04e` (it was `a7d0a38c…`).
- **Verified:** the whole database suite, 661 tests in 92 files, runs again on the real migrations.
- **The read-back script** (`scripts/vps/check-migrations.ps1`) now checks v104 and v105 too.
- **Lesson:** the database tests run after the last change to a migration, not before the review's fixes.

## Not done, and why

See ADR 0256:

- learning from corrections (suggestions kept apart until approved);
- CAD layer and text styles;
- title-block fields other than the statement;
- plan numbering.
