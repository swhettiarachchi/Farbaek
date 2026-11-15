# What AutoCAD and ZWCAD suggest for Survey Studio

A study of the AutoCAD and ZWCAD product sites and their help pages, made on 15 November 2026 for stage 191. It records what each capability does for a surveyor and whether Survey Studio adopts it now, later or never. Vendor statements are the vendors' own claims from their pages that day; none of the software was tested. The full report with every source is kept outside the repository; the main sources are linked below.

## What the sites show

- **Neither vendor sells cadastral plan production in its core product.** The AutoCAD overview and product pages don't mention surveying, parcels or DXF. Coordinate geometry sits in the Map 3D toolset; parcels and traverse adjustment in Civil 3D, which only the AEC Collection includes ([AutoCAD](https://www.autodesk.com/products/autocad/overview), [Map 3D](https://www.autodesk.com/products/autocad/included-toolsets/autocad-map-3d), [Civil 3D](https://www.autodesk.com/products/civil-3d/product-details)). ZWCAD leaves surveying to third-party add-ons ([ZWCAD](https://www.zwsoft.com/product/zwcad), [applications](https://www.zwsoft.com/product/application)).
- **The likely receiving desktops are AutoCAD LT and ZWCAD Standard**, neither of which handles coordinate systems ([AutoCAD comparison](https://www.autodesk.com/products/autocad/product-details#product-comparison), [ZWCAD pricing](https://www.zwsoft.com/product/zwcad/pricing)). This is an inference: no data on what Sri Lankan surveyors run was found. Survey Studio's real competitors are the add-ons (code-driven symbols, label de-overlap, paper-fitted title blocks).
- **Every documented CAD AI feature stops at a suggestion.** Autodesk Assistant checks a drawing against a standards file the user supplies, selects, counts and navigates; no help page describes it editing geometry, and its transparency note says it isn't for safety-critical use ([Assistant](https://help.autodesk.com/cloudhelp/2027/ENU/AutoCAD-WhatsNew/files/GUID-99E2D8F7-D4D9-4B3A-9E57-7B73D6BB12AD.htm)). Markup Import shows recognised markups for the user to choose ([Markup Import](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Platform/files/GUID-0CD6B2CE-EAF0-478B-B39B-F4821F9DC91D.htm)). ZWCAD names no AI feature. Neither documents an AI that drafts a plan.
- **Their most useful tools for a surveyor are review tools**: DWG Compare and File Compare, Geometry Cleanup's "keep as designed", CAD Standards checks against a named file, plot stamps, fields that show a visible blank, and schedules extracted from the drawing ([DWG Compare](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-2D69E78D-5C82-464F-B864-CD29D5720EB9.htm), [Geometry Cleanup](https://help.autodesk.com/cloudhelp/2027/ENU/AutoCAD-Core/files/GUID-F8EC70C3-5873-4970-AADD-70F6B600A556.htm), [CAD Standards](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-D64F8076-4978-44B7-B056-D921C77FEA88.htm), [Plot dialog](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-264D3513-0D22-4461-82D6-14F391BC5CDE.htm)).
- **Two vendor facts set rules.** Model-space plotting defaults to fit to paper, so an issued plan never offers it. PDF stores single-precision coordinates, so a PDF is never a coordinate source ([PDF files](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-1202CC8A-364F-4E93-8E86-6F476CD83C72.htm)). ZWCAD's area tool closes an open polyline to report its area ([ZWCAD measuring](https://www.zwsoft.com/user-guide/zwcad-calculation-and-measurement-tools)): Survey Studio refuses such a lot instead.

## Decisions

| Capability | Vendor example | Survey Studio | Decision |
| --- | --- | --- | --- |
| AI output as suggestions a person accepts | Markup Assist, Smart Blocks | Each AI item marked, checked one by one, blocking approval until checked | **Done** (stage 191), enforced on the server rather than as a disclaimer |
| Read text shown for correction | Raster Design text recognition | Photo-read title fields marked "Read from a photo, check" | **Done** (stage 191) |
| Symbols and lines from field codes | Civil 3D and Carlson field-to-finish, TopoLT | Suggestions from the code library, accepted per line | **Done** (stage 191, ADR 0204) |
| Labels placed clear of each other | TopoLT label arrangement | Greedy placement; overlaps reported | **Done** (stage 191) |
| Paper matched to the drawing | ZWCAD Smart Plot | Automatic paper and scale | **Done** (stage 191) |
| Leaders to adjoining land | AutoCAD leaders | Adjoining labels with arrows | **Done** (stage 191) |
| Compare two versions | DWG Compare, File Compare | A list of changes in words on History | **Done** in words (stage 191); the coloured geometry overlay comes with the CAD tools |
| Visible blank for a missing value | AutoCAD fields | Dotted blank and a finding | **Kept** (stage 190) |
| Schedules that can't go stale | AutoCAD data extraction | Overleaf composed from the lots every time | **Kept** |
| Problems reported, not repaired | Map 3D cleanup markers | Overlaps, gaps and area mismatch reported | **Kept** |
| Photo capture advice | Markup Import | "Photograph the title and the boundaries close up" | **Done**; flat, even light could be added |
| Plot stamp | AutoCAD plot stamp | DRAFT notice; engine version only in PDF metadata | **Later, soon**: drawing version, approval state, engine version, date in the margin |
| Lot schedule CSV with a total | ZWCAD Area Table, data extraction | Points CSV only | **Later, soon** |
| Near-miss findings and "keep as surveyed" | Geometry Cleanup tolerances | 0.5 mm T-junctions; other gaps reported without a cause | **Later, soon**; the answer stored in the hashed version, never a moved point |
| Plan-standard profile | CAD Standards Checker | Checks fixed in `qc.ts` | **Later**: versioned rules, each citing its source |
| Description-to-plan reconciliation | Count, unit-aware reports | Not yet | **Later** (stage 194): stated counts, widths and extents checked against computed ones |
| Questions answered by the engine | Assistant select, query, navigate | Not yet | **Later** (stage 194) |
| Inverse between any two points | Map 3D COGO inverse | Lot legs only | **Later** |
| Multi-code points, note separators, curves | Carlson | Single codes, END, CLO | **Later** |
| Office code library and standards | Connected Support Files | Per drawing | **Later** (schema change) |
| Red-pen markup into changes | Markup Import | None | **Later**, after stage 194 |
| Review links, overlays, revision clouds | Shared views, Trace, revision clouds | None | **Later**; plans carry owners' names, so access rules first |
| Georeferenced old-plan underlay | Raster Design rubbersheeting | None | **Later**; never a coordinate source |
| Captured basemap | Esri basemaps (can't plot live) | None | **Later**, after transformations; labelled context only |
| Traverse and least-squares adjustment | Civil 3D | Misclosure reported only | **Later**, with the surveyor's authority |
| DXF opened in ZWCAD and AutoCAD LT | Both read DXF | R12 writer, checked in other readers | **Later, before a release**: a manual check in both |
| AI-generated statutory symbols | Block Generate with AI | Fixed library | **Never** |
| AI with no way to work without it | Assistant "Always On" | Every AI item has a manual path | **Never** |
| Silent repair (auto-close, snapping, cleanup) | ZWCAD area auto-close, angle fixes | Refuses and reports | **Never** |
| Writing DWG; dynamic blocks | TrustedDWG alerts | DXF R12, plain blocks | **Never** |
| 3D, BIM, point clouds, plug-in APIs | AutoCAD 3D, ObjectARX | Not applicable | **Never** for cadastral plans |

## What to re-check

The vendor pages changed between their 2026 and 2027 help folders, several links were dead, and ZWCAD's version years were inferred from page order. Each "later" item should be checked against the current help page when its stage starts.
