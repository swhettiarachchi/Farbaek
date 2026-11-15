# Survey Studio validation specification

Every check produces a **finding** ([`qc.ts`](../../src/core/survey/qc.ts)): a code, a severity, a message, what it is about (`target`), an optional detail in figures, the next action in words, and the operations it blocks. Passing every check is not certification and not legal compliance: a plan is final only when its surveyor approves a version, and is certified only by the surveyor's signature on paper.

## Severities

| Severity | Meaning | Badge on the Check step ([`findings.tsx`](../../src/components/survey/findings.tsx)) |
| --- | --- | --- |
| `error` | Something that would make the plan wrong | `blocked`, "Blocked" |
| `professional_review` | A decision only the surveyor can make | `approval`, "For the surveyor" |
| `warning` | Worth a look; may be fine | `attention`, "Needs a look" |
| `information` | For the record | `info`, "Info" |

Findings are sorted in that order (`SEVERITY_ORDER`). Each card shows the badge, the code in mono, the message, the detail, the action and "Stops <the plan, export, approval> until it is resolved." when it blocks something. With no findings the step says "No findings. Checks passing is not certification: the surveyor still reviews and signs the plan."

## What a block does

| Blocks | Enforced by |
| --- | --- |
| `export` | The export route answers 409 for a PDF or DXF while any such finding stands, listing each message and action. The GeoJSON is held back only by the findings that concern the coordinates or the parcel (`blocksData`, below), and the Export step hides its link while there are any. The CSV, which is the points exactly as imported, stays available |
| `approval` | `approveSurveyAction` recomputes the plan and refuses with every blocking message. The approve form is disabled with the first one |
| `plan` | Recorded on the finding and shown in its card. Nothing else reads it yet |

`buildPlan` in [`view.ts`](../../src/core/survey/view.ts) gathers the findings from `checkSurvey` and from the sheet composer, and returns:
- `blocksExport`: every finding that blocks export;
- `blocksData`: the export blockers that concern the coordinates or the parcel itself, not the printed sheet: those whose target isn't `sheet` or `field`, except `BOUNDARY_NOT_SET` (a GeoJSON of the points alone is still useful before a boundary is chosen);
- `blocksApproval`: every finding that blocks approval.

## Project and points (`checkSurvey`)

| Code | Severity | Blocks | When | Message | Action |
| --- | --- | --- | --- | --- | --- |
| `CRS_MISSING` | error | export, approval | The project's CRS id isn't in the registry | "No coordinate system is set for this project." | "Choose and confirm the coordinate system in the project settings." |
| `CRS_NOT_CONFIRMED` | professional_review | approval | Nobody has confirmed the CRS | "<CRS name> hasn't been confirmed by a person." | "Confirm the coordinate system in the project settings." |
| `CRS_LOCAL` | information | nothing | Confirmed local coordinates | "These are local coordinates, not tied to a national grid." | "Bearings are relative to the site grid's north. Say so on the plan if it is submitted." |
| `NO_POINTS` | error | plan, export, approval | No points imported | "No points have been imported yet." | "Import a point file on the Import step." |
| `AXES_LOOK_SWAPPED` | error | export, approval | Projected CRS: every point is outside its range, and every point is inside it with E and N swapped | "Eastings and northings look swapped for this coordinate system." Detail: "All <n> points fall outside <CRS>'s range, and all fall inside it with the two columns swapped." | "Import the file again with the easting and northing columns mapped the other way round." |
| `POINTS_OUT_OF_RANGE` | warning | nothing | Projected CRS: some points outside its range (and not a swap) | "<k> of <n> points are outside the usual range of <CRS name>." | "Check the coordinate system and the units (metres, not feet) of the imported file." |

The ranges are in [GEOMETRY_ENGINE.md](GEOMETRY_ENGINE.md). They only test a claim; several ranges overlap, and a point in range proves nothing.

## Boundary and features

| Code | Severity | Blocks | When | Message | Action |
| --- | --- | --- | --- | --- | --- |
| `BOUNDARY_NOT_SET` | error | plan, export, approval | The document has no boundary | "The boundary hasn't been chosen." | "Choose the boundary points in order on the Boundary step." |
| `BOUNDARY_MISSING_POINTS` | error | plan, export, approval | The boundary names point ids not in the project | "The boundary uses points that no longer exist in this project." Detail: "<n> point references can't be found." | "Choose the boundary again from the current points." |
| `BOUNDARY_TOO_FEW` | error | plan, export, approval | Fewer than three vertices | "A boundary needs at least three points." | "Add the remaining boundary points in order." |
| `BOUNDARY_REPEATS_POINT` | error | export, approval | A point used more than once | "The boundary uses point <numbers> more than once." | "A boundary closes back to its first point by itself; remove the repeat." |
| `BOUNDARY_ZERO_LEG` | error | export, approval | One finding per leg of 0.5 mm or less | "The leg from <a> to <b> has no length." Detail: the length in mm | "Two boundary points sit on the same spot. Remove one, or check the field data." |
| `BOUNDARY_SELF_INTERSECTS` | error | export, approval | Non-neighbouring legs cross or come within 0.5 mm, or a leg runs back along its neighbour | "The boundary crosses itself, so its area can't be computed." Detail: "The leg <a>–<b> meets the leg <c>–<d>", and how many more pairs cross | "Check the order of the boundary points." |
| `BOUNDARY_NO_AREA` | error | export, approval | Three or more points that all lie within 0.5 mm of one line (the line from the first point to the point farthest from it), or a ring that doesn't cross itself with an area of at most its perimeter × 0.5 mm. Points on one line are reported as this even though they also fold back over themselves; a crossing ring, such as a bow tie whose halves cancel out, gets `BOUNDARY_SELF_INTERSECTS` instead | "The boundary encloses no real area: its points lie on a line." Detail: the area in m² to 6 decimals and the perimeter in m to 3 | "Check the order and the coordinates of the boundary points." |
| `FEATURE_MISSING_POINTS` | error | export, approval | A feature names point ids not in the project | "A <layer> feature uses points that no longer exist." | "Remove the feature or choose its points again." |

Points can't be deleted, so the two "missing points" findings guard against a document that doesn't match its project (the save action also refuses unknown points).

## Sheet fields

| Code | Severity | Blocks | When | Message | Action |
| --- | --- | --- | --- | --- | --- |
| `SHEET_MISSING_PLAN_NUMBER` | warning | approval | Empty plan number | "The plan number is empty." | "Fill in the plan number on the Plan step before approval." |
| `SHEET_MISSING_SURVEY_DATE` | warning | approval | Empty survey date | "The survey date is empty." | "Fill in the survey date on the Plan step before approval." |
| `SHEET_EMPTY_LOT` | information | nothing | Empty lot | "The lot is empty." | "Fill it in if this plan should show it." |
| `SHEET_EMPTY_LAND_NAME` | information | nothing | Empty land name | "The land name is empty." | "Fill it in if this plan should show it." |
| `SHEET_EMPTY_DISTRICT` | information | nothing | Empty district | "The district is empty." | "Fill it in if this plan should show it." |
| `SHEET_BOUNDARY_DESCRIPTION` | warning | nothing | Any of North, East, South or West empty | "Some of the boundary descriptions (North, East, South, West) are empty." | "Type what adjoins each side, as you found it. Farbaek never fills these in." |
| `SHEET_PREVIOUS_PLANS` | information | nothing | No previous plans cited | "No previous plans are cited." | "Cite earlier plans, or note that there are none and how the boundaries were found (UDA regulation 9 asks for this in UDA areas)." |
| `LEGEND_UNREVIEWED` | professional_review | approval | The legend is still exactly the brief's examples | "The legend is still the starting examples, which aren't an official list." | "Review the legend: keep, edit or remove each code so it matches this plan." |
| `MARK_CODE_NOT_IN_LEGEND` | information | nothing | Boundary point codes missing from the legend (case-insensitive) | "Boundary point codes not in the legend: <up to 6>…" | "Add them to the legend if they should be explained on the plan." |

The two `SHEET_MISSING_*` and three `SHEET_EMPTY_*` codes are built from the field name (`planNumber` becomes `PLAN_NUMBER`).

## Lots, roads, adjoining lands and drafting (stages 191 and 192)

Each per-lot boundary check above runs for every lot, its message starting "Lot B1:". These come from how the lots fit together ([`lots.ts`](../../src/core/survey/lots.ts)), the drawing's other items and the drafting assistant.

| Code | Severity | Blocks | When |
| --- | --- | --- | --- |
| `LOT_LABEL_MISSING` | error | export, approval | A lot has no label (the engine never invents one) |
| `LOT_LABEL_DUPLICATE` | error | export, approval | Two lots have the same label and raised part |
| `LOTS_OVERLAP` | error | export, approval | Two lots overlap: a leg crosses, a corner or leg midpoint lies inside the other, or a point inside one lies inside the other (a lot entered twice) |
| `LOTS_GAP` | error | export, approval | Land between the lots that no lot covers, including a gap pinched against the outline at one corner |
| `ENTIRE_AREA_MISMATCH` | error | export, approval | The outline's area differs from the sum of the lots by more than 0.01 m² |
| `LOTS_APART` | warning | none | The lots form separate pieces of land |
| `POINTS_NEAR_DUPLICATE` | professional_review | approval | Corner numbers of different lots within 5 cm: perhaps one mark observed twice ("probably" under 1 cm). Every pair is found, through a 5 cm grid. Can be kept as surveyed |
| `CORNER_NEAR_LEG` | professional_review | approval | A corner between 0.5 mm and 5 cm off another lot's leg, more than 5 cm from its ends (nearer its ends it's a corner near a corner, above); one finding per corner and leg. Can be kept as surveyed |
| `POINTS_NEAR_DUPLICATE_KEPT`, `CORNER_NEAR_LEG_KEPT` | information | none | The surveyor kept that near miss as surveyed, in this version |
| `ROAD_MISSING_POINTS` | error | export, approval | A road uses points that no longer exist |
| `ADJOINING_NO_LEG` | error | export, approval | An adjoining land's leg (its two corners) is no longer a leg of its lot; the label isn't drawn |
| `STATED_EXTENT_AGREES` | information | none | The stated extent is within 1% of the land computed from the points |
| `STATED_EXTENT_DIFFERS` | warning | none | It differs by more than 1%; the detail gives both in m² and the difference in the stated units |
| `STATED_EXTENT_UNREAD` | information | none | The stated extent isn't written in a way Farbaek reads for sure ([`extent.ts`](../../src/core/survey/extent.ts): every number must pair with a unit; anything ambiguous is unread), or the lots don't fit together yet |
| `SHEET_PARENT_LOTS`, `SHEET_EXTRACT_LOT` | warning | none | A sub division or amalgamation names no parent lot; an extract names a lot the plan doesn't have |
| `AI_ITEMS_UNREVIEWED` | professional_review | approval | Items the drafting assistant filled, still on the plan, not yet marked right or changed ([AI_DRAFTING.md](AI_DRAFTING.md)) |
| `LOT_UNDER_MINIMUM_AREA`, `LOT_UNDER_MINIMUM_FRONTAGE`, `LOT_UNDER_MINIMUM_DEPTH` | warning | none | Stage 193, only when the plan names planning rules (ADR 0207). A building lot under the set's minimum area, frontage, or mean depth (its area over its frontage). The detail cites the set, or the surveyor's own source |
| `LOT_NO_ROAD_FRONTAGE` | warning | none | A building lot with no leg along a road or a reserved access lot, when the set asks for a frontage |
| `RULES_LOTS_MEET` | information | none | Every building lot checked meets the set's minimums; the detail says how many reserved lots were left out |
| `RULES_FRONTAGE_UNCHECKED` | information | none | The plan has no roads or reserved access lots, so frontages and depths weren't checked |
| `RULES_DEPTH_UNMEASURED` | information | none | Lots without a leg along a road or reserved access lot, whose depth couldn't be measured (when no frontage minimum is set) |
| `RULES_LOTS_LEFT_OUT` | information | none | Reserved lots, and lots whose boundary crosses itself or misses a corner, that weren't checked (said in `RULES_LOTS_MEET`'s detail when that one is shown) |
| `RULES_SOURCE_MISSING` | information | none | The surveyor's own minimums don't yet say where they come from, so they aren't checked |
| `RULES_REMINDER` | information | none | One of the set's reminders that applies to this land (consent, the RQP declaration, open space), with its section |

**Planning minimums** (stage 193, ADR 0207):
- **Which lots.** Lots whose note starts "Res." (as in "(Res. for Access, 10ft. wide)") are reservations, not building lots, and aren't checked.
- **Frontage.** It's how much of a lot's legs lies along one road or one reserved access lot whose note names the access.
  - A road counts by its edges and across its two ends.
  - A segment counts where both its ends are within 5 cm of the leg's line, for the stretch the two overlap, so a road that ends part way along a leg gives that part.
  - Frontage is counted in straight runs that end where the boundary turns by more than 45°, so a corner lot takes its longer side, on one road or two.
- **Depth.** It's the mean depth: the lot's area over that frontage.
- **Tolerance.** A figure at a minimum, to the rounding it's shown with (0.01 m², 1 mm), meets it.
- **What "meets" says.** The `RULES_LOTS_MEET` line names only what was measured for every lot checked.
- **Weight.** These are warnings to weigh: a Development Plan or an approved exception may allow a smaller lot, so none blocks anything.

"Keep as surveyed" (ADR 0205) saves a new version with the near miss's key in the document's `kept` list, so the approval covers the answer and History shows it. Every save trims `kept` to near misses the plan has, so no answer outlives its near miss or arrives from outside. A document with an empty `kept` hashes as one saved before the field existed, so earlier approvals still stand. Nothing moves.

## The responsible surveyor

| Code | Severity | Blocks | When | Message | Action |
| --- | --- | --- | --- | --- | --- |
| `NO_SURVEYOR` | professional_review | approval | No surveyor chosen | "No surveyor is responsible for this plan yet." | "Choose the licensed surveyor responsible for the plan. They fill in their own details." |
| `SURVEYOR_NO_PROFILE` | professional_review | approval | The chosen surveyor has no profile in the workspace | "The chosen surveyor hasn't entered their details yet." | "The surveyor enters their name, designation and registration under Surveyor details." |

## The sheet (`composeSheet`)

From [`compose.ts`](../../src/core/survey/sheet/compose.ts). See [PLAN_SHEET_SPECIFICATION.md](PLAN_SHEET_SPECIFICATION.md) for how each is measured.

| Code | Severity | Blocks | When | Message | Action |
| --- | --- | --- | --- | --- | --- |
| `SCALE_TOO_LARGE_AREA` | error | export | No standard scale fits and none is chosen | "The drawing is too large for any standard scale on this sheet." | "Choose a larger sheet." |
| `DRAWING_OFF_SHEET` | error | export | At the chosen scale the drawing is wider or taller than the drawing area | "At 1:<scale> the drawing doesn't fit the sheet." Detail: "It needs <w> × <h> mm; the drawing area is <w> × <h> mm." | "Use 1:<suggested>, or a larger sheet." (or "Use a larger sheet." when nothing fits) |
| `LABELS_OVERLAP` | warning | nothing | Drawing labels cover each other or a boundary point | "A label overlaps another label or a point at 1:<scale>." (or "<n> labels overlap …") Detail: up to six pairs, quoted, then "and more" | "Drag one of them clear in the editor, or choose a larger scale. Nothing is moved for you." |
| `LABEL_LONGER_THAN_LEG` | information | nothing | One per leg whose label is longer than 1.05 × the leg on paper | "The label for <a>–<b> is longer than the leg at this scale." | "Move the label in the editor, or use a larger scale. The geometry is never changed to make room." |
| `TEXT_OVERFLOW` | error | export | A panel's text doesn't fit its column, or one word (a plan number with no spaces) is wider than the column | "The sheet's text doesn't all fit in its panel." | "Choose a larger sheet or landscape, or shorten the longest fields." |
| `TEXT_SCRIPT_NOT_SUPPORTED` | error | export | Any text on any page has a character from U+0900 to U+0DFF (the Indic blocks, Tamil and Sinhala included) | "Sinhala and Tamil text can't be printed on the sheet yet: it would come out as empty boxes." Detail: the first such text, up to 40 characters | "Write the sheet's fields in English for now. Sinhala and Tamil on the sheet come in a later stage." |

Text widths for `TEXT_OVERFLOW` and `LABELS_OVERLAP` come from `textWidth` in [`scene.ts`](../../src/core/survey/sheet/scene.ts), which uses Geist's measured advance widths (see [PLAN_SHEET_SPECIFICATION.md](PLAN_SHEET_SPECIFICATION.md)).

### Added in stages 191 and 192

| Code | Severity | Blocks | When |
| --- | --- | --- | --- |
| `TEXT_OFF_SHEET` | error | export | Text on the front page runs past the frame (the plot stamp, under the frame on purpose, is exempt) |
| `LABELS_ON_TITLE` | warning | none | A label in the drawing covers the Reference, the notes or the title block (classic layout) |
| `LOT_LABEL_CRAMPED` | warning | none | A lot's label is bigger than the lot at this scale; it's written at the lot's deepest point, never outside it |

## Checks outside the findings

These stop an action before any finding is computed.

| Where | Check |
| --- | --- |
| Import (browser and server) | Every row read by the tested readers; any error-severity issue refuses the whole file. Codes in [IMPORT_EXPORT_SPECIFICATION.md](IMPORT_EXPORT_SPECIFICATION.md) |
| Import (server and database) | `CRS_CHANGED` when the project's CRS isn't the one the person confirmed the units in; `POINT_CONFLICT` when a stored point number would get a different E, N, Z or code; GeoJSON naming a grid other than the project's is refused |
| Boundary step | Unknown point numbers are listed and stop the save. The panel shows a crossing ring, a repeated point, two points on one spot and fewer than three points as you type |
| Save | The document must match `surveyDocumentSchema`; every point id it names must be in the project; a chosen surveyor must have a profile; the base version must be the latest |
| New project and settings | Name of 1 to 120 characters; a CRS from the registry; for a new project, the confirmation tick |
| Approval | The confirmation tick; the latest version; no finding that blocks approval; in SQL, the CRS unchanged since the server read it (`CRS_CHANGED`), the actor the named surveyor with a profile, and no standing approval of the version |
| Showing an approval | An approval counts only while it isn't withdrawn and its hash equals the plan's hash computed now; otherwise the plan shows as a draft and the Export step says why (the CRS changed, or the plan no longer matches what was approved). The History step marks each version "Approved", "Approval withdrawn", or, for the version shown, "Approval no longer applies"; the dashboard card says "Version N approved" |

## Adding a check

Give it a new code in upper snake case, a severity, a message that says what was found, an action that says what to do, and the operations it blocks. Never let a check move, snap or round a coordinate, or move a label: report, and let a person act (skill rule 7). Add a known-answer test and a row here.
