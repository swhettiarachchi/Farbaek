# ADR 0251: Sketches are read as surveyors write them, and a road is measured between its two surveyed sides

- **Status:** accepted (stage 243, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0249 (the Sketch Intelligence Engine);
  - ADR 0203 (roads from their two surveyed edges, the width computed);
  - the owner's request to understand a real job "as a surveyor" from all its files.
- **Changes:**
  - the sketch reader's instructions;
  - a gate kind of line;
  - roads named in a sketch's area;
  - a road between two surveyed sides;
  - a hint when a stated extent is whole perches.

  No migration, no new dependency.

## Context

Reading a real job with every file side by side (instrument data, field sketch, finished plan) showed what a surveyor sees and stage 241 didn't:
- **The field book was turned while drawing.** Numbers were upside down: 28 to 31 along the road looked like Sinhala letters, and were missed.
- **A note at the top was the job's title,** not the road's label. The road's name was written in Sinhala above it.
- **The lot's frontage was a gate,** written ගේට්ටුව.
- **Both sides of the road were surveyed:** the walls across it as one line, and the lot's frontage with the neighbours' walls carrying it on as the other. Its width on the ground (3.25 to 3.63 m) differed from the 15 ft the plan states, which is its reserved width.
- **The stated extent was exactly 5.00 perches,** the deed's round figure, while the walls enclosed 5.24 P.
- **A taped 1.65 ran from the well to a point,** between two arrowheads.

## Decision

- **The reader's instructions** say how surveyors write sketches:
  - writing in any direction, with upside-down numbers read as numbers, and 6/9 kinds of doubt reported rather than chosen;
  - a title at the top of the page is a note;
  - a road's name is a road reading and an area without corners;
  - a gate is a line labelled as one;
  - a distance between arrowheads runs between the two things they point to.

  Real job names never appear in the instructions.
- **A gate** (gate, ගේට්ටුව) is its own kind of line: part of the boundary, drawn on the fences layer, never a road and never asked about.
- **A road's name written in an area** (Temple Road, පාර, මාවත, පටු මඟ) makes the area a road.
- **A road between two surveyed sides** is proposed when the sketch names a road:
  - **The far side:** a drawn line that touches neither the lot nor its inside, at least 3 m long. It must lie outside one of the lot's sides and run alongside it (within 20°), 2 to 20 m off, past that side's middle.
  - **The near side:** that lot side, carried on by drawn lines leaving its ends alongside the far side (the neighbours' walls).
  - **Its width** is measured between the two sides (`roadWidth`), in metres and feet. A written width that differs by more than 0.3 m is asked about, as perhaps the reserved width; one that agrees is said.
  - **On the plan:** it is added as a road waiting for one press, its width written in feet.
  - **Its name:** when the sheet can't print it yet (Sinhala, Tamil), the road goes on without its name, and the name is asked for, so nothing blocks the export.
- **A stated extent of whole perches,** beside a computed one that isn't, is said to be most likely the deed's extent. This shows in the sketch's lot evidence and in the plan's extent check for every plan. It is said, never assumed.
- **A symbol's label that names its kind** (well, ළිඳ) settles it as strongly as a code.

## Consequences

On the owner's real job, from its SDR and its sketch read this way:
- all 8 of the plan's lines are drawn in full, with the road's far side complete;
- the road is measured at 3.25 to 3.63 m between its sides;
- the gate is read, the well is strong, and the 5-perch extent is pointed out.

The lot still differs from the plan by one corner: 2, where the southern neighbours change. The sketch doesn't name the neighbours, so nothing in it says 2 is a corner.

**Not built:**
- corners from neighbours' names;
- the road's direction texts;
- a drain beside a road;
- label placement around roads, where a few labels still overlap.
