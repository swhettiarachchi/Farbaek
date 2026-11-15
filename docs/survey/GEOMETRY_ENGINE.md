# Survey Studio geometry engine

The calculations live in [`src/core/survey/`](../../src/core/survey). They run on planar grid coordinates in metres: easting `e` and northing `n` in the project's confirmed projected CRS, or a local site grid. Nothing in the engine works on longitude and latitude, and nothing applies a scale factor: every distance and area is a grid figure. Tests: [`engine.test.ts`](../../src/core/survey/engine.test.ts) and [`plan.test.ts`](../../src/core/survey/plan.test.ts) (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md)).

## Precision policy

- Coordinates are stored as Postgres `numeric`, exactly as imported, and computed in float64.
- Nothing is rounded during a calculation. Rounding happens only where a figure is shown or written to a file, under the rules below.
- Tolerances are set per operation, in the units of that operation (skill rule 10), never as one global epsilon.

## Units

[`units.ts`](../../src/core/survey/units.ts). The imperial units come from the international yard of exactly 0.9144 m.

| Constant | Value | How |
| --- | --- | --- |
| `YARD_M` | 0.9144 m | definition |
| `SQUARE_YARD_M2` | 0.83612736 m² | 0.9144² |
| `PERCH_M2` | 25.29285264 m² | 30.25 square yards; NIST Handbook 44 (2026), Appendix C gives the same figure as exact |
| `ROOD_M2` | 1,011.7141056 m² | 40 perches |
| `ACRE_M2` | 4,046.8564224 m² | 4 roods, or 160 perches, or 4,840 square yards |
| `HECTARE_M2` | 10,000 m² | definition |

`PERCHES_PER_ROOD = 40`, `ROODS_PER_ACRE = 4`, `PERCHES_PER_ACRE = 160`.

- `fromSquareMetres(m2, unit)` and `toSquareMetres(value, unit)` convert at full precision for `m2`, `ha`, `acre`, `rood` and `perch`.
- Areas are stored and computed in m². These conversions run only when presenting or exporting.

### Acres, roods and perches (A-R-P)

`toArp(m2, perchDecimals = 2)`:
1. Refuses a negative or non-finite area, and `perchDecimals` outside 0 to 4 (`RangeError`).
2. Converts to perches and rounds **once**, in units of the last kept decimal of a perch, half away from zero (`roundHalfAway`). The result is an integer, so no float residue is split later.
3. Splits that integer into acres (160 perches), roods (40 perches) and the remaining perches.

So 39.999 perches at two decimals becomes `0A 1R 0.00P`, never "40.00P", and a rounded 40.00 P carries into a rood. `formatArp` writes `"<A>A <R>R <P>P"` with the perches to `perchDecimals` places, for example `1A 2R 7.26P`.

`roundHalfAway(value)` nudges the absolute value up by `Number.EPSILON × max(1, |value|) × 4` before rounding, so a value such as 12.499999999 that should be 12.5 rounds up. `roundTo(value, decimals)` applies the same rule at a number of decimals: 2.675 becomes 2.68 and 1.005 becomes 1.01.

The rounding of a stated extent is not set by any official Sri Lankan source found (see [STANDARDS_RESEARCH.md](STANDARDS_RESEARCH.md)). `perchDecimals` is a document setting, 2 by default; the editor has no control for it yet.

## Bearings

[`angles.ts`](../../src/core/survey/angles.ts).

- **Convention.** Whole-circle bearings in degrees, clockwise from the grid north of the confirmed CRS, in [0, 360). `NORTH_REFERENCE = "grid"`. The text `BEARING_CONVENTION` ("Whole-circle bearings, clockwise from grid north of the confirmed coordinate system.") is printed on every sheet and overleaf. For a local CRS the north point reads "Site grid north".
- **From coordinates.** `bearingFromDeltas(dE, dN)` is `atan2(dE, dN)` in degrees, east first, normalised. It returns `null` when both deltas are zero: a leg with no length has no direction.
- **Normalising.** `normaliseDegrees` brings any finite angle into [0, 360); 360 and -0 become 0. It throws on a non-finite angle.
- **Degrees, minutes and seconds.** `toDms(deg, secondDecimals = 0)` rounds once, in units of the last kept decimal of a second (`Math.round` on the normalised, non-negative value), then splits with integer division. A result of 360° wraps to 0. So 10°59′59.6″ at whole seconds is `011°00′00″`, and 359°59′59.6″ is `000°00′00″`; there is never a 60″ or a 360°. The function accepts 0 to 3 second decimals; the document setting allows 0 to 2 (default 0).
- **Formats.** `formatDms` writes `045°30′07″` (three-digit degrees, primes and double primes). `formatQuadrant(deg, secondDecimals)` writes `N 45°30′07″ E` from the same rounded value; the plan editor's selection panel shows it.
- **Typed bearings.** `parseBearing(text)` reads whole-circle DMS (`123°45′12″`, `123 45 12`, `123-45-12`), degrees and minutes, decimal degrees (`123.7533`) and quadrant bearings (`N 45 30 00 E`). It keeps the original text and the notation. It returns `null` for anything it can't read for certain: minutes or seconds of 60 or more, a whole-circle value of 360 or more, or a quadrant angle above 90. It is tested but not yet used by a screen.
- **Back to deltas.** `deltasFromBearing(deg, distance)` gives `dE = d sin θ`, `dN = d cos θ`.

## Planar geometry

[`geometry.ts`](../../src/core/survey/geometry.ts). A ring is a list of vertices without a repeated closing vertex; `openRing` drops a final vertex equal to the first, so callers can pass either form.

| Function | What it computes |
| --- | --- |
| `distance(a, b)` | `Math.hypot(ΔE, ΔN)`, the horizontal grid distance |
| `signedArea(ring)` | The coordinate (shoelace) method, `½ Σ (xᵢ yᵢ₊₁ − xᵢ₊₁ yᵢ)`, with E as x and N as y, **on coordinates moved to the first vertex**. Positive when the ring runs anticlockwise. Fewer than 3 vertices give 0 |
| `area(ring)` | The absolute signed area, in m². Valid only for a simple ring |
| `isClockwise(ring)` | `signedArea < 0` |
| `perimeter(ring)` | The sum of the leg lengths, closing leg included |
| `bounds(points)` | Minimum and maximum E and N, or null for no points |
| `centroid(ring)` | The area-weighted centroid, on shifted coordinates, for placing the lot label. When twice the area is below 1e-12 it falls back to the mean of the vertices |
| `orient(a, b, c)` | The cross product `(b − a) × (c − a)`, in m²: positive when c is left of a→b |
| `pointSegmentDistance(p, a, b)` | The shortest distance from a point to a segment, in metres |
| `segmentDistance(a, b, c, d)` | The shortest distance between two segments, in metres: 0 when they cross properly (strict sign changes of `orient` both ways), otherwise the least of the four point-to-segment distances |
| `TOUCH_TOLERANCE_M` | 0.0005 m: half a millimetre, the distance under which two legs count as touching |
| `segmentsIntersect(a, b, c, d, tolerance = TOUCH_TOLERANCE_M)` | Whether two segments cross or come within the tolerance of each other |
| `selfIntersections(ring)` | Pairs of legs, by the index of each leg's first vertex, that cross or touch. Non-neighbouring legs must stay more than 0.5 mm apart everywhere (the first and last legs count as neighbours). Neighbouring legs count only when one folds back along the other (a spike); zero-length legs are left to `zeroLengthLegs`. Rings of fewer than 3 vertices return none |
| `zeroLengthLegs(ring, tolerance = 0.0005)` | Indexes of legs no longer than 0.5 mm |
| `interiorAngles(ring)` | The interior angle at each vertex, in degrees, for a simple ring of either direction |

**Why the shift.** SLD99 coordinates are around 500,000 m. Products of raw coordinates reach about 10¹¹, and float64 then loses digits that matter at the square-millimetre level. Moving the ring to its first vertex first keeps the products small. The research notes the same safeguard (Ghilani 12.5 for the method).

**The tolerances are distances.** At grid-sized coordinates the rounding noise in an orientation product grows with the legs' lengths, so a tolerance on the product would mean different things on short and long legs. The crossing test therefore works in metres: two legs touch when they come within 0.5 mm, the same tolerance as a zero-length leg. A notch whose corner rests exactly on a one-kilometre leg at SLD99-sized coordinates is found, and the same notch moved a centimetre clear is a simple ring (tested). The research recommends exact predicates (robust-predicates 3.0.3) for orientation; the code uses plain float64 orientation signs and these distance tolerances instead.

## Parcels

`computeParcel(points, boundary)` in [`parcel.ts`](../../src/core/survey/parcel.ts) takes the boundary's point ids in the surveyor's order.

- Ids not in the point list are returned as `{ ok: false, missing }`. Nothing is skipped or reordered.
- Otherwise it returns:
  - `legs`: from each vertex to the next, closing back to the first, each with its bearing (null for a zero-length leg) and distance;
  - `areaM2` for 3 or more vertices, `perimeterM` for 2 or more;
  - `clockwise`, `crossings` (from `selfIntersections`), `zeroLegs` (from `zeroLengthLegs`), `repeatedPoints` (point numbers used more than once) and `interiorAngles`;
  - `labelAt` (the centroid);
  - `method: "coordinate (shoelace) method on grid coordinates"` and `engine: SURVEY_ENGINE_VERSION`.
- `areaM2` is computed even for a ring that crosses itself, but nothing shows or exports it then: the sheet says "Not computed", the GeoJSON leaves the parcel out, and `BOUNDARY_SELF_INTERSECTS` blocks export.
- A ring whose area is no more than its perimeter × 0.5 mm (thinner than about a millimetre on average: its points lie on a line) gives `BOUNDARY_NO_AREA`, which also blocks export, so "0A 0R 0.00P" never reaches a sheet as a lot.

## Traverse

`computeTraverse(start, legs, closeOn?)` in [`traverse.ts`](../../src/core/survey/traverse.ts):
- Each leg is a whole-circle bearing and a horizontal distance. A non-finite bearing or distance, or a distance of zero or less, throws a `RangeError` naming the leg.
- It returns the computed stations (the start, then one per leg), unadjusted, and the total length.
- With a closing point it adds the misclosure: `dE` and `dN` (last computed point minus the closing point), `linear = √(dE² + dN²)`, and `precision = length ÷ linear`, the N of 1:N, not rounded; null when the misclosure is zero.

There is no adjustment. Bowditch (compass) and transit adjustments need the surveyor's authorisation and an explicitly chosen method (skill rule 7), and are not built. No screen uses `computeTraverse` yet; it is tested.

## Coordinate systems

[`crs.ts`](../../src/core/survey/crs.ts) holds the registry a project can be confirmed in. Every record stores easting first (`axisOrder: "E,N"`), metres, and where its definition came from with a status.

| Id | Name | Plausible range used by the check | Status in the code |
| --- | --- | --- | --- |
| `EPSG:5235` | SLD99 / Sri Lanka Grid 1999 | E 370,000 to 635,000; N 370,000 to 830,000 | `verified_secondary` (EPSG v13.102 via epsg.io) |
| `EPSG:5234` | Kandawala / Sri Lanka Grid | E 70,000 to 335,000; N 70,000 to 530,000 | `verified_secondary` |
| `EPSG:32644` | WGS 84 / UTM zone 44N | E 160,000 to 840,000; N 0 to 9,400,000 (Farbaek's own broad box for the zone, as its source line says) | `verified_secondary` |
| `LOCAL` | Local coordinates (not georeferenced) | none | `professional_configuration_required` |

`CrsRecord.status` takes the register's four statuses: `verified_official`, `verified_secondary`, `professional_configuration_required` and `not_verified`.

- `crsById(id)` returns the record, or null for an unknown id.
- `implausiblePoints(points, crs)` counts points outside the range. Zero proves nothing; the ranges overlap.
- `looksSwapped(points, crs)` is true only when every point is outside the range and every point is inside it with E and N swapped. Near the middle of SLD99 both orders are in range, so a swap there can't be detected.
- No transformation between systems runs. The research's warnings about transformations are in [STANDARDS_RESEARCH.md](STANDARDS_RESEARCH.md).

## Figures as shown

| Figure | Where | Decimals |
| --- | --- | --- |
| Leg distance | sheet labels, Boundary step, overleaf, DXF | `distanceDecimals`, 2 by default (2 to 4) |
| Bearing | sheet labels, Boundary step, overleaf, DXF | `secondDecimals`, 0 by default (0 to 2); the selection panel shows 1 |
| Extent | sheet, Boundary step | A-R-P to `perchDecimals`; hectares to 4; m² to 2 |
| Overleaf area | overleaf | m² to 3, hectares to 6, A-R-P to `perchDecimals`, perimeter to 3 |
| Coordinates | Points step, overleaf | 3 |
| Coordinates | DXF | 4 (0.1 mm), fixed notation |
| Coordinates | CSV, GeoJSON | full stored precision |

`fmt(n, decimals)` in [`compose.ts`](../../src/core/survey/sheet/compose.ts) formats numbers the same way everywhere: rounded half away from zero with `roundTo` (so 1.005 m is "1.01", where `toFixed` alone gives "1.00"), thousands separated by commas, fixed decimals, and a minus sign only when the rounded value isn't zero. The DXF writes leg distances with `toFixed` and coordinates with `toFixed(4)`, not `fmt`.

## Known answers

All synthetic. The full list is in [TESTING_STRATEGY.md](TESTING_STRATEGY.md).

| Case | Expected |
| --- | --- |
| 1 ha | `2A 1R 35.3686P` at 4 perch decimals, `2A 1R 35.37P` at 2 |
| Bearings (ΔE, ΔN) of (10, 10), (10, −10), (−10, −10), (−10, 10) | 45°, 135°, 225°, 315° |
| 30 m × 20 m rectangle at E 500,000, N 600,000 | 600 m², perimeter 100 m |
| Concave L of six vertices | 600 m², interior angles summing to 720° |
| The Sample parcel | 1,311.118096 m², from an exact integer computation in millimetres |
| The Sample's first leg, point 1 to 2 | `083°21′41″`, 31.78 m |
| A closed square traverse with a 99.98 m last leg | misclosure 0.02 m, precision 399.98 ÷ 0.02 |
| A notch whose corner rests on a 1 km leg at SLD99-sized coordinates | a self-intersection; moved 1 cm clear, none |
| A leg that runs back along the one before it | a self-intersection (a spike) |
