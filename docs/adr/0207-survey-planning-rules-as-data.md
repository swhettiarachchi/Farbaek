# ADR 0207: Planning rules for dividing land are versioned data that cite their source

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 193
- **Builds on:**
  - ADR 0206 (dividing a lot into shares);
  - the survey skill's rule 8 (jurisdiction rules need evidence, a status and a source).

## Context

Stage 192 checked shares against the UDA minimums (150 m², 6.0 m frontage, 12.0 m depth) from three constants in `partition.ts`. That raised three problems:
- **No source on screen.** The figures didn't say where they came from.
- **No expiry.** The UDA's review page schedules new regulations for 31 December 2026, so the figures may soon be out of date.
- **No local override.** The UDA rules apply in UDA-declared areas "unless a Development Plan says otherwise", and many lands are under a Development Plan or a local authority's by-laws instead.

`docs/survey/STANDARDS_RESEARCH.md` already asked for these rules "as versioned data citing this document, with a Development Plan override".

## Decision

**A rule set is data** (`src/core/survey/rules.ts`). Each set has:
- a stable, versioned id (`uda-2020` for the copy titled 2020);
- the document and sections it was read from;
- its verification status;
- where it applies;
- the date it's due for review;
- its minimums;
- cited reminders.

A new copy of the regulations becomes a new set with a new id, never an edit to an old one.

**The surveyor chooses the set for each check.**
- **The choices:** no minimums, the UDA set, or "minimums I enter".
- **No default:** nothing is assumed.
- **The UDA set on screen:** it shows its document, its sections, where it applies and its review date. After that date, it says the regulations were due to be replaced and should be checked.

**The surveyor's own minimums are theirs.**
- They type the three figures and where they come from (a Development Plan and its zone, for example).
- The set is marked `professional_configuration_required`.
- The screen says Farbaek hasn't checked the figures against that source.
- A frontage minimum of 0 means frontage isn't checked.

**Reminders are information, not a pass or a fail.** The UDA set reminds the surveyor of:
- prior written consent (reg. 4(1)), always;
- the Relevant Qualified Person's declaration (reg. 7), at 1 ha or more, or 8 lots or more;
- the 10% open space (reg. 23), under the same condition.

Each reminder carries its section. None is checked against the drawing: the engine can't know whether consent was given or which land counts as streets.

**Not encoded:** the Schedule 4 access widths, because the copy's table lost its row alignment (`not_verified`).

## Consequences

- **New regulations:** when the new UDA regulations are gazetted, they are added as a new set. The 2020 set stays for plans checked under it.
- **Messages name their source.** A share's problems say "under the UDA minimum of 150 m²" or "under the minimum you entered of 250 m²", never a bare number.
- **Applied to the plan too.** The drawing's `rules` field names the set its lots are checked against. It is null by default and left out of the approval hash while null (ADR 0205's rule), so earlier approvals stand.
  - **Building lots:** each is checked for area, frontage along a road or a reserved access lot, and mean depth.
  - **Reserved lots** ("Res. …") aren't checked.
  - **Findings:** every shortfall is a warning that cites the set and blocks nothing.
  - **Starting point:** the divide panel starts from the plan's choice.
