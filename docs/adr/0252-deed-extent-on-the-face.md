# ADR 0252: A classic plan can give the deed's extent on its face, as the surveyor chooses

- **Status:** accepted (stage 244, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0251 (a stated extent of whole perches said to be most likely the deed's);
  - the classic Sri Lankan layout (ADR 0200);
  - the survey skill's rule that a computed area and a stated or recorded extent are different numbers, kept apart.
- **Changes:**
  - one optional sheet setting (`deedExtentOnFace`), absent unless chosen;
  - how the classic layout writes its extent line;
  - a note in the boundaries schedule;
  - one check, `EXTENT_FROM_DEED`.

  No migration, no new dependency.

## Context

A licensed surveyor's resurvey plan, in a real job the owner supplied, states "Containing in Extent 0.01265 Hectares (0 A. 0 R. 05.00 P.)": the extent in the deed, as the surveyor confirmed. The existing walls he resurveyed enclose 5.24 P. Many Sri Lankan resurvey plans write the deed's extent this way. Farbaek's classic sheet always wrote the computed extent there, so it couldn't produce such a plan as the surveyor draws it.

## Decision

**A setting on the Sheet tab, offered only on the classic layout when a stated extent is written:** "Extent line gives the deed's extent (the stated extent); the computed one goes in the schedule".
- **Off by default,** and absent from the document unless chosen. Turning it off removes it, so every earlier document and approval stands.
- **One rule decides it** (`deed-extent.ts`, `deedExtentFace`), for the front page, the schedule overleaf, the checks and the Sheet tab alike. The face gives the deed's extent only when the setting is on, the layout is classic, the sheet isn't an extract of a lot still on the plan, the stated extent can be read, and the plan has its own computed extent to keep beside it.
- **When on:**
  - the front page's extent line gives the stated extent, in the same words and units as a computed one, with the perches to at least as many decimals as the deed writes them;
  - the boundaries schedule overleaf keeps the extent computed from the survey and says "The front of the plan gives the extent in the deed; the extent above is computed from this survey";
  - the stated-extent check still flags any difference.
- **Never hidden:**
  - `EXTENT_FROM_DEED` says which extent the face gives and where the computed one is, as information;
  - it becomes a warning when the schedule is off, since the computed extent is then on no page;
  - it is also a warning when there is no stated extent it can read, and the face then falls back to the computed extent.
- **An extract of one lot** always gives that lot's computed extent.
- **Nothing is computed from the deed.** The stated extent is printed as given, never used for an area, a lot or a check's result.

## Consequences

On the owner's real job, the face reads as the surveyor's plan does: 0.01265 Hectares (0 A. 0 R. 05.00 P.). The schedule gives 0.01327 Hectares (5.25 P), and the checks flag the 4.7% difference.

It is the surveyor's statement on a legal document. Farbaek offers it, says what it does every time, and keeps the survey's own figure on the plan.
