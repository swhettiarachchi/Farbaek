# ADR 0277: Learning from corrections, as suggestions for the office profile

- **Status:** accepted (stage 270, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0237 (a new plan's defaults from the surveyor's recent plans), ADR 0256 (office profiles, each save a version).
- **Changes:** the office profile's sheet can carry drafting choices, and records suggestions turned down; the office profiles page; a server action. No migration (the profile's body is JSON), no new dependency.

## Context

The owner's brief asks AutoSurvey to learn from the surveyor's corrections, with what it learns kept apart until approved. A surveyor who draws walls' codes small with a tick, or corners without circles, turns that on after every Generate. A surveyor who adds "GT Gate" to every plan's code list adds it every time. Farbaek already starts a plan from the surveyor's last checked code list and sheet (ADR 0237), and from their office profile (ADR 0256). It never learned the drafting choices, and nothing told the surveyor that their profile was behind their own practice.

## Decision

**What a surveyor corrects on plan after plan becomes a suggestion for their office profile, never a change.**

- **Learned only from their own plans started from that profile:** a plan now records the profile and version it started from (`fromProfile`, absent for one started without a profile, so earlier plans and approvals are unchanged). The newest three such plans they created in the workspace, each at its latest version, read through row-level security. Never from a model, a sketch, a page, a colleague's plans, or plans from another profile or none, which say nothing about this one. Nothing about a piece of land. Plans made before this stage don't record their profile, so learning starts with plans generated from now on.
- **Drafting choices:** walls' codes small with a tick, boundaries at the other lines' weight, corners without circles, no lot letters, the deed's extent on the face, crowded legs to the schedule. A choice is suggested when at least two recent plans from the profile, and all of the three most recent, end with it, and the profile doesn't start with it. Stopping one is suggested the same way, said as what's true ("your last two plans from it don't"), never as what the surveyor did. Only for a profile that keeps a sheet. The profile form shows and changes these choices beside the sheet's others, and the profile's summary counts them.
- **Codes, one at a time:** a code every recent checked list from the profile has (at least two, the surveyor's own lists, not the common or the Survey Department's), with the same meaning and kind, that the profile's list lacks; and a code the profile's list means differently from all of them. Each code is its own suggestion, so turning one down never holds back another. Keys carry codes and meanings encoded, so a code with a "|" or "=" in it is never mistaken for another. None is suggested to a list at its 500 codes. Only for a profile that keeps a list.
- **Said, with its source:** each suggestion is a sentence ("Your last three plans all letter walls' codes small, with a tick across the wall. Start new plans from this profile that way.") and the plans it came from.
- **Applied only when pressed:** "Add to the profile" saves a new version with it. The server works the suggestion out again from the plans and the profile as saved; the browser only says which one. A stale version, or a suggestion the plans no longer make, saves nothing and says so.
- **Turned down for good:** "Not for this profile" saves a new version recording it, and it isn't offered again; the profile form keeps that record whatever else it saves. A profile is the workspace's, so a suggestion turned down is turned down for everyone who uses it.
- **The form never saves an older version over a newer one:** a new version remounts it with what that version holds.
- **A profile started from a plan** now takes that plan's drafting choices too.

## Consequences

- A surveyor's profile catches up with their practice in one press, and new plans start the way they draw.
- **Not yet:**
  - learning from corrections to sketch readings (stage 249's one-press fixes), which would change what the AI is told: a separate decision;
  - title-block fields other than the statement;
  - suggestions on the Generate screen itself.

## Verified

- `learning.test.ts` (11 cases): a drafting choice suggested, applied, counted in the summary and then no longer suggested; nothing from plans of another profile or none; two plans at least, all agreeing, newest three only; stopping one, said truthfully; no sheet, no suggestion; codes one at a time, one turned down without the others; codes with "|" or "=" kept whole; none at 500 codes, nor from unchecked or common lists; turned down for good; made-up or stale keys refused.
- **A fresh review found eight faults, all fixed:** the form dropped turned-down suggestions; the form kept an older version's values after an Add and saved them back; codes with "|" or "=" were mis-keyed; codes were offered as one bundle, so one turned down came back with new ones; suggestions came from plans of any profile or none, so "you turned it off" could be false; at 500 codes an Add saved nothing but said it had; drafting choices couldn't be seen or changed on the profile; the docs miscounted the tests.
- `generate.test.ts`: the action adds a suggestion as a new version and turns one down; a stale version, a suggestion no longer made, or a profile not in the workspace saves nothing.
