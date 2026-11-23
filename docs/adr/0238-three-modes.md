# ADR 0238: Express, Professional and Manual CAD, three views of one survey project

- **Status:** accepted (stage 227, AutoSurvey part 9, 2026-11-23)
- **Builds on:** ADR 0233 (AutoSurvey's start), ADR 0235 (only real problems need the surveyor), the owner's AutoSurvey brief §21 ("Three modes, one product") and §20 ("The user should only see a few screens")
- **Changes:** which of a project's steps are shown. Every step, page and saved version is unchanged.

## Context

A project showed nine steps: Import, Points, Draft, Lots, Plan, Check, Export, History, Settings. For an ordinary survey started with Generate Plan, the surveyor needs two of them: the plan with what needs them, and approval and print. The brief asks for three working modes sharing one project model:
- Express, the default: upload, generate, review exceptions, approve, print;
- Professional: configuration and diagnostics;
- Manual CAD: editing when automation isn't enough.

It also says never to force an ordinary surveyor into Professional mode.

## Decision

**A mode chooses which steps are shown, nothing else** (`src/core/survey/modes.ts`):

| Mode | Steps |
|---|---|
| **Express** (default) | Draft until the plan is drawn, then Plan and Export |
| **Professional** | Every step |
| **Manual CAD** | Points, Lots, Plan and Export |

- **The step that's open is always shown**, in its place. A link to any step (from the "Needs you" list, History, or a bookmark) never leads nowhere.
- **The choice is the person's**, in a cookie (`fb_survey_mode`, Survey Studio's paths only, a year). It applies to every project they open, the Sample included, and is changed with a three-way switch under the project's title.
- **No mode adds or removes a capability.** The same project, versions, checks and approval sit behind every mode.

## Consequences

- An ordinary survey opens on two steps. Professional is one press away and never required.
- "Manual CAD" means editing what the plan already lets a person edit: points, lots, lines, roads, adjoining lands and the sheet. Geometry editing beyond those is still limited, as the stage 222 map says.
