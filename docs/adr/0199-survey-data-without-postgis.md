# ADR 0199: Survey data in plain Postgres, without PostGIS for now

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 190
- **Builds on:**
  - ADR 0005 (auth and database; database tests on PGlite);
  - ADR 0036 (the database on the VPS);
  - ADR 0198 (Survey Studio as a module).

## Context

Survey Studio stores survey points and computes parcels, bearings and areas from them. PostGIS is the usual spatial extension for Postgres, and the survey skill names it as a likely store for spatial data. Three facts weigh against it in this stage:

- **Tests.** The database tests apply every migration to a plain `new PGlite()` (PGlite 0.5.8, `tests/db/harness.ts`), which has no PostGIS. A `create extension postgis` migration would break every database test, not only Survey Studio's. Fixing that needs a PGlite PostGIS package (a new dependency) or a separate test path.
- **The maths.** A cadastral plan in stage 190 is planar grid maths on projected coordinates in metres: shoelace areas, `atan2` bearings, segment intersection. The tested TypeScript engine in `src/core/survey/` does it, and the same code runs in the browser for the live preview. Moving it into SQL would split one calculation across two languages.
- **Queries.** Nothing in this stage asks the database a spatial question. Points are read per project, in full, and every figure is computed from them.

Whether the self-hosted production database has PostGIS available was not checked.

## Decision

**Plain Postgres columns.** Coordinates are `numeric` columns on `survey_points` (`e`, `n`, `z`), stored exactly as imported, in the project's confirmed CRS. The CRS is a text id on the project (`EPSG:<code>` or `LOCAL`). The drawing document refers to points by id and holds no coordinates. No geometry columns, no spatial indexes, no SRIDs. The database's only coordinate operation is the exact `numeric` comparison that refuses a re-import changing a stored point.

**All geometry in the engine.** The server reads the points through row level security and the engine computes everything, recomputing on every view and export (`buildPlan`). Nothing computed is stored as truth.

## Consequences

- The database tests keep running on PGlite with every migration.
- Calculations run in float64 after the reader converts `numeric` to JavaScript numbers. The engine moves coordinates to a local origin before taking products, and is tested at SLD99-sized coordinates.
- No spatial query is possible in SQL: no "points within this parcel", no nearest-neighbour search, no cross-project search by location.
- **Revisit** when one of these arrives:
  - spatial queries across projects or large datasets (search by location, a map of all projects);
  - subdivision at a scale where SQL overlays or spatial indexes beat loading points into the engine;
  - terrain data large enough that reading every point per request is too slow;
  - serving vector tiles (PMTiles, MapLibre) from the database;
  - transformations that should run next to the data.
- Before enabling PostGIS: confirm the production database has it, choose a test path (a PGlite PostGIS package needs the owner's approval as a new dependency), write the migration and an ADR.
