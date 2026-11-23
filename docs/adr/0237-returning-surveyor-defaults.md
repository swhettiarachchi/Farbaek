# ADR 0237: A new plan starts from the surveyor's own decisions, and from their office code library

- **Status:** accepted (stage 226, AutoSurvey part 3, 2026-11-23)
- **Builds on:** ADR 0233 (AutoSurvey's start: the coordinate system confirmed last time), ADR 0235 (only real problems need the surveyor), the owner's AutoSurvey brief §6 ("configure their environment once and reuse it") and §10 (a reusable field-code library)
- **Changes:** what a new plan's document starts with. No migration.

## Context

Every new plan started from the common code list and default sheet settings. A returning surveyor therefore re-checked the same code list and re-chose the same paper and layout on every job. The brief asks for a profile set up once. It also says:
- learn repeatable presentation preferences, never legal truth;
- keep learned suggestions separate until approved;
- import a firm's code library.

The research found Carlson's `.fcl`, plain CSV with a published minimum header, to be the most portable library format.

A profile table would need a migration. Everything this part needs is already in the surveyor's own plans, so this part reads it from there.

## Decision

**A new plan starts from this surveyor's own recent plans in the workspace** (`loadStartingDefaults`: their five most recent projects that they created, newest first, read through row-level security with their own client):

- **The code library:** from their newest plan whose list was checked, carried over unchanged. Nothing is carried when that newest checked list is the common or Survey Department list: the newest decision stands, and a new plan starts from those lists anyway. The carried list **waits for one press** on the new plan. The check mark records no reviewer, and a list can change after its check, so a carried list is never taken as checked. Changing a checked list now undoes its check.
- **The sheet's presentation:** template, paper, orientation, decimals, overleaf, permit box, lettering and face dimensions from their latest plan. The scale isn't carried: it belongs to each land.
- **Never carried:** anything about the land itself (title, lots, owners, extents, dates). A past plan is never a source of legal truth.

**An office code library uploaded with the files** (`.fcl`, or a CSV with a Code column and a Description, Layer or Linework one, and no coordinates) becomes the plan's code library (`src/core/survey/codelib.ts`):
- Linework naming a line or polyline joins points; otherwise a code is a mark.
- A dashed Linetype is dashed.
- The meaning is the Description, else the Layer, else the code.
- A library over the plan's 80 codes contributes the codes the files use first, read the way the plan reads a point's code, and the start screen says how many were left out. A code over 12 characters is refused by name, never cut short; only an exact repeat is a repeat.
- A CSV whose columns the points reader would take for coordinates ("Easting (m)", "NORTHING_M", "X") is never taken for a library.
- It waits for the surveyor's check once, because how its columns map to kinds is Farbaek's reading.
- It wins over a carried list.
- The server reads it again and never takes the browser's reading.

**The Survey Department's code list replaces only the common list** when the files use its codes, never an office library or the surveyor's own checked list.

**The start screen says what carries over** before Generate Plan: "Codes: the list you checked on Lot 7 (18 codes)", "Sheet: laid out as on Lot 9 (A3, landscape)", or the office library's name.

## What it doesn't do

- **No separate profile page or table.** Equipment, export formats and title-block preferences per profile need a migration and come with a profile table later.
- **The rest of Carlson's code grammar** isn't read: BEG/END, PC/PT, CLO, JPN, offsets.
- **No defaults are learned from edits.** Defaults come only from choices the surveyor made and kept.

## Consequences

- A second job by the same surveyor starts with their list and sheet layout. The list asks for one press ("Confirm" in the Needs you list), not a rebuild.
- A firm with its own library uploads it once per job, with the data, and checks the reading once.
