# ADR 0208: The block-out plan is worked out again on the server and drawn with drawing-only corners

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 193
- **Builds on:**
  - ADR 0203 (the classic sheet);
  - ADR 0206 (dividing a lot into shares);
  - ADR 0207 (planning rules as data).

## Context

UDA regulation 8 asks for a block-out plan of a sub division at not less than 1:1000 (1:4000 for very large sites). The divide panel on the Lots step already works out where the lines fall, and offers the setting-out table as CSV, but no sheet. The surveyor drew the block-out by hand.

The divide panel runs in the browser on the saved version. Its new corners are not survey points (ADR 0206): they join a plan only once pegged, observed and imported.

## Decision

**The server works the division out again.**
- **Input.** The panel sends only the surveyor's choices to `/export/blockout`:
  - lot, leg, lines, corner, end, area or width;
  - the shares in metres and square metres;
  - the rules.

  These are read with a strict schema (`divisionSchema`, `src/core/survey/blockout.ts`). The server recomputes the division from the saved version's lot and points with the same engine.
- **Refusals.** A division that can't be made as asked gets no sheet: a share in pieces, an area its lines can't give, or a minimum it misses. The refusal lists the reasons.
- **Prerequisites.** Like the GeoJSON and the lot schedule, it waits for the plan's checks on the coordinates and the lots.

**Drawing-only corners.** The new corners become points that exist only for the drawing:
- **Ids:** a fixed id pattern (`b10c0000-…`) that no imported point has.
- **Names:** P1, P2… as the division names them.
- **Kept out of the project:** never saved, never imported, never in the point list.
- **On the sheet:** a note names them as "worked out from the surveyed corners and not yet pegged".

**The sheet is the classic one, marked as what it is.**
- **Title and heading:** headed BLOCK OUT PLAN. The title sentence is composed as a sub division of the divided lot.
- **Not-surveyed marks:**
  - a red "NOT YET SURVEYED" notice in place of the draft notice;
  - no plan number and no survey dates;
  - the plot stamp reads "block-out plan from version N, a planned division worked out by partition/1.1.0, not a survey".
- **Lot labels:** the shares are labelled B¹, B², B³ for lot B, or 1, 2, 3 for a lot that already has a raised part.
- **Setting out:** point numbers and leg dimensions are on the face.
- **What it shows:** only the divided lot, the roads, and the features inside it; adjoining labels are left out.
- **Scale:** when the automatic scale is smaller than 1:1000, the sheet is tried again at 1:1000 on the paper that holds it.

**Recorded like every export.** It is recorded as a PDF with its SHA-256 and `options.content = "blockout"`, together with the lot, scale, paper, engine and the division. A division too long for the 4 KB options column keeps only its SHA-256. History calls it "Block-out plan".

**Buildings.** The panel says when a dividing line runs through a building outline on the plan. It's a warning to weigh: nothing moves, and it doesn't stop the sheet.

## Consequences

- **Drawing hygiene.** Every sheet with dimensions on the face now labels a leg two lots share once, not twice. A label that would overlap one already placed moves to the leg's other side.
- **Not a plan version.** The block-out isn't saved as a drawing version. It's an export of one, reproducible from the version and the recorded choices.
- **Not yet:** a whole land laid out at once with its access road (roadmap).
