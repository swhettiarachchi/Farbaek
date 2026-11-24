# ADR 0277: Learning from corrections, as suggestions for the office profile

- **Status:** accepted (stage 270, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0237 (a new plan's defaults from the surveyor's recent plans), ADR 0256 (office profiles, each save a version).
- **Changes:** the office profile's sheet can carry drafting choices, and records suggestions turned down; the office profiles page; a server action. No migration (the profile's body is JSON), no new dependency.

## Context

The owner's brief asks AutoSurvey to learn from the surveyor's corrections, with what it learns kept apart until approved. A surveyor who draws walls' codes small with a tick, or corners without circles, turns that on after every Generate. A surveyor who adds "GT Gate" to every plan's code list adds it every time. Farbaek already starts a plan from the surveyor's last checked code list and sheet (ADR 0237), and from their office profile (ADR 0256). It never learned the drafting choices, and nothing told the surveyor that their profile was behind their own practice.

## Decision

**What a surveyor corrects on plan after plan becomes a suggestion for their office profile, never a change.**

- **Learned only from their own plans:** the newest three plans they created in the workspace, each at its latest version, read through row-level security. Never from a model, a sketch, a page or a colleague's plans. Nothing about a piece of land.
- **Drafting choices:** walls' codes small with a tick, boundaries at the other lines' weight, corners without circles, no lot letters, the deed's extent on the face, crowded legs to the schedule. A choice is suggested when at least two recent plans, and all of the three most recent, make it, and the profile doesn't. Turning one off is suggested the same way. Only for a profile that keeps a sheet.
- **Codes:** a code every recent checked list has (at least two, the surveyor's own lists, not the common or the Survey Department's), with the same meaning and kind, that the profile's list lacks; and a code the profile's list means differently from all of them. Only for a profile that keeps a list.
- **Said, with its source:** each suggestion is a sentence ("Your last three plans all letter walls' codes small, with a tick across the wall. Start new plans from this profile that way.") and the plans it came from.
- **Applied only when pressed:** "Add to the profile" saves a new version with it. The server works the suggestion out again from the plans and the profile as saved; the browser only says which one. A stale version, or a suggestion the plans no longer make, saves nothing and says so.
- **Turned down for good:** "Not for this profile" saves a new version recording it, and it isn't offered again.
- **A profile started from a plan** now takes that plan's drafting choices too.

## Consequences

- A surveyor's profile catches up with their practice in one press, and new plans start the way they draw.
- **Not yet:**
  - learning from corrections to sketch readings (stage 249's one-press fixes), which would change what the AI is told: a separate decision;
  - title-block fields other than the statement;
  - suggestions on the Generate screen itself.

## Verified

- `learning.test.ts` (10 cases): a drafting choice suggested, applied and then no longer suggested; two plans at least, all agreeing, newest three only; turning one off; no sheet, no suggestion; codes missing and meant differently, from checked lists only, never one plan or the common list; turned down for good; made-up or stale keys refused.
- `generate.test.ts`: the action adds a suggestion as a new version and turns one down; a stale version, a suggestion no longer made, or a profile not in the workspace saves nothing.
