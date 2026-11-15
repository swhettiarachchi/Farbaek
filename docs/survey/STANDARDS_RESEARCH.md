# Survey Studio standards research: the evidence register

This is the evidence register that rule 8 of the `farbaek-survey-studio` skill asks for.

Every Sri Lankan or other jurisdiction rule Survey Studio encodes must have a row here, with its source and one of four statuses. An unverified rule becomes a setting with a review warning, never a hard-coded guess, and nothing in Farbaek states that a plan complies with a law.

The research behind it: [`reports/Survey Studio standards and tech.md`](<../../reports/Survey Studio standards and tech.md>) and the notes in [`research_notes/Survey Studio standards and tech/`](<../../research_notes/Survey Studio standards and tech>) (`sri_lanka_survey_rules.md`, `crs_and_point_formats.md`, `dxf_and_vector_pdf.md`, `geometry_and_cad_libraries.md`). **Every source was accessed on 15 November 2026.**

## Statuses

| Status | Meaning here |
| --- | --- |
| `verified_official` | Read in the issuing body's own text: a statute, a regulation, a government report, a standards document or an IETF RFC |
| `verified_secondary` | Read in a reputable mirror (epsg.io for the EPSG dataset), a thesis or journal paper, or an official text seen only as a search excerpt |
| `professional_configuration_required` | No official source fixes it. Survey Studio offers it as a setting or a starting value that the responsible surveyor must review |
| `not_verified` | Searched for and not found, or seen only in a snippet, a forum post or a broken link. Never built as a rule |

The research also uses two labels for technical facts: **verified primary** (a library's or vendor's own documentation, source code or npm registry entry) and **derived** (the researchers' own arithmetic or reasoning from cited inputs, reproducible but not from a source). They appear in the technical register below.

Two access problems shape the statuses. epsg.org refused automated requests (HTTP 403), so every EPSG value comes from epsg.io's mirror of EPSG dataset v13.102 and is at best `verified_secondary`. The Land Survey Council's circulars from 2015 to 2021 are scanned images with no text layer and were not read.

## Main sources

| Short name | Title | Publisher | URL |
| --- | --- | --- | --- |
| Survey Act | Survey Act No. 17 of 2002 (Land Survey Council copy of the Government Printer edition), certified 4 October 2002 | Parliament of Sri Lanka | https://landsurveycouncil.org/pdf/Survey_Act/Survey%20Act%20English.pdf |
| Parliament record | Act details, Act 17/2002 | Parliament of Sri Lanka | https://www.parliament.lk/en/business-of-parliament/act-details/G3065 |
| UDA regulations | Urban Development Authority Planning & Development Regulations (the copy is titled 2020; its signature date is blank) | Urban Development Authority | https://www.uda.gov.lk/attachments/act/mcK3c2YfvS.pdf |
| UDA instructions | Online application instructions | Urban Development Authority | https://www.uda.gov.lk/attachments/help/Instructions%20Webpage-%20PDF.pdf |
| UDA review page | Reviewing and updating the Planning & Development Regulations | Urban Development Authority | https://www.uda.gov.lk/acts-regulations-tree2.html |
| LSC guideline | Handbook of guidelines to Registered Licensed Surveyors (file dated 2016-11-24); says of itself that it is not binding | Land Survey Council | https://landsurveycouncil.org/pdf/guideline_english.pdf |
| LSC pages | Resources; For RS/RL surveyors | Land Survey Council | https://landsurveycouncil.org/resources.php, https://landsurveycouncil.org/for_rs_rl_surveyors.php |
| UN-GGIM 2014 | Sri Lanka Geographical Units (Survey Department presentation) | Survey Department, at UN-GGIM | https://ggim.un.org/meetings/2014-IGSI_Beijing/documents/07_Sri_Lanka_Geographical%20Units.pdf |
| UN RCC-AP 2006 | Survey Department country report, E/CONF.97/5/CRP.13 | Survey Department, at UN RCC-AP | https://unstats.un.org/unsd/geoinfo/rcc/docs/rccap17/crp/17th_UNRCCAP_econf.97_5_CRP13.pdf |
| NIST HB 44 | NIST Handbook 44 (2026), Appendix C, General Tables of Units of Measurement | US National Institute of Standards and Technology | https://www.nist.gov/document/2026-nist-handbook-44-appendix-c |
| epsg.io | EPSG records 5233, 5234, 5235, 5236, 5237, 1053, 1054, 4244 (mirror of EPSG v13.102) | epsg.io (MapTiler), mirroring IOGP's EPSG dataset | https://epsg.io/5235 and the same pattern |
| Karunaratne 2007 | Finding out transformation parameters and evaluation of the new coordinate system in Sri Lanka (thesis) | ITC | https://kartoweb.itc.nl/geometrics/Literature/IFA_Karunaratne.pdf |
| RFC 7946 | The GeoJSON Format | IETF | https://www.rfc-editor.org/rfc/rfc7946.html |
| Prasanna and Gunathilaka 2022 | Article on Sri Lanka's vertical datum (DOI 10.4038/jgs.v2i1.34) | journal article, hosted on reference-global.com | https://reference-global.com/article/10.4038/jgs.v2i1.34 |
| Newton's Bulletin 4 | Report on EGM2008 in Sri Lanka | International Service for the Geoid | https://isgeoid.polimi.it/Newton/Newton_4/newton_4_Report_AAA4_SriLanka.html |

Technical sources used in the technical register:

| Short name | Publisher | URL |
| --- | --- | --- |
| Civil 3D point file formats | Autodesk | https://help.autodesk.com/cloudhelp/2023/ENU/Civil3D-DevGuide/files/GUID-F64DD398-AE33-47A2-90D2-653DBFA23664.htm |
| ezdxf documentation (file structure, handles, units, file encoding) | ezdxf project | https://ezdxf.readthedocs.io/en/stable/dxfinternals/filestructure.html |
| dxf-parser | gdsestimating (GitHub) | https://github.com/gdsestimating/dxf-parser |
| PDFKit documentation | PDFKit project | https://pdfkit.org/docs/getting_started.html |
| fontkit 2.0.4 shaper map | fontkit (via jsDelivr) | https://cdn.jsdelivr.net/npm/fontkit@2.0.4/src/opentype/shapers/index.js |
| pdf-lib 1.17.1 CustomFontEmbedder | pdf-lib (via jsDelivr) | https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/src/core/embedders/CustomFontEmbedder.ts |
| Chromium code review 2272053002 | Chromium | https://codereview.chromium.org/2272053002 |
| proj4js source | proj4js (GitHub) | https://github.com/proj4js/proj4js/tree/master/lib |
| PROJ Helmert transformation | PROJ | https://proj.org/en/stable/operations/transformations/helmert.html |
| Turf area source | Turf (GitHub) | https://raw.githubusercontent.com/Turfjs/turf/master/packages/turf-area/index.ts |
| robust-predicates 3.0.3 README | robust-predicates (via unpkg) | https://unpkg.com/robust-predicates@3.0.3/README.md |
| Ghilani, *Elementary Surveying*, 16th ed. | Pearson | https://www.pearson.com/en-us/subject-catalog/p/elementary-surveying-an-introduction-to-geomatics/P200000003148/9780136822806 |
| npm registry (versions, dates, licences) | npm | https://registry.npmjs.org/ |

## Sri Lankan law and regulation

| # | Rule or fact | Source and section | Requirement | Status | In Survey Studio |
| --- | --- | --- | --- | --- | --- |
| L1 | Who certifies | Survey Act s.13 | No plan or map is receivable in evidence in any Sri Lankan court unless prepared by or for the Surveyor General and certified, or certified by a registered licensed surveyor | verified_official | Approval in Farbaek records a review and is not a certification. The sheet carries the DRAFT line until the surveyor approves a version, and keeps empty Signature and Seal boxes. The approve form and the Export step say the signature on paper certifies the plan |
| L2 | Signing by others is an offence | Survey Act s.64(1)(e)(iv), s.64(2) | A person who is not a registered licensed surveyor must not certify or sign a plan the law requires such a surveyor to certify. Fine up to Rs 10,000, up to three months' imprisonment, or both | verified_official | Farbaek never certifies, signs or stamps. The surveyor's details are what they enter themselves |
| L3 | The draughtsman role | Survey Act s.2(p) | The Surveyor General may certify a draughtsman to prepare a plan from a surveyor's field notes and compute its area, for a registered surveyor | verified_official | Survey Studio takes this drafting role and never the certifying one (ADR 0198) |
| L4 | Field records must be real | Survey Act s.45(1)(d) | Misconduct to record in a field book anything that purports to come from actual observation when it doesn't | verified_official | Imported points are kept exactly as given, with the source file and its SHA-256. A computed value is never stored as an observation |
| L5 | Approval by the Surveyor General is no defence | Survey Act s.45(2) | | verified_official | None beyond L1 |
| L6 | Title cadastral surveys | Survey Act s.10(2), s.10(3) | Need a Survey Department surveyor, or a licensed surveyor with the Surveyor General's Certificate of Accreditation; the plans are examined and approved | verified_official | Not built. The surveyor profile has no accreditation field |
| L7 | Annual licence | Survey Act s.41, s.43 | The Annual Practising Licence is annual; the Council gazettes the licensed list by 31 March each year | verified_official | Not built. The profile has no licence year (the research recommends one) |
| L8 | Plan Issuing Register | LSC pages | A certified copy of the register is needed to renew the licence | verified_official (the requirement); the register's format not_verified (scanned circulars) | Not built |
| L9 | Regulations on plan content and limits of error | Survey Act s.24(2)(b), (c) | The Minister may prescribe the form of plans, the details on them and the limit of error. No such regulation was found | not_verified | No sheet item and no misclosure limit is enforced as law |
| L10 | Old Surveyors Ordinance regulations | Survey Act s.25(2)(b)(i) | Continue where consistent with the Act. Their text was not found | the clause verified_official; the regulations not_verified | Not encoded |
| L11 | Accuracy standards | Survey Act s.2(c) | The Surveyor General specifies accuracy standards. None found | not_verified | `computeTraverse` reports a misclosure; no limit is checked |
| L12 | Deposit of plans | Survey Act s.12 | Specific categories of plans are deposited within 30 days; the categories and manner are "as prescribed". Not found | not_verified | Not built |
| L13 | Digital signatures on plans | Survey Act s.7(2)(b), s.8, s.66 (digital records); Electronic Transactions Act No. 19 of 2006 not checked | Whether a digitally signed plan counts as certified under s.13 is unknown | not_verified | Approval in Farbaek is not a signature |
| L14 | No amending Act | Parliament record | No amending Act listed; 2010 subordinate legislation only | verified_official (as of 15 November 2026) | None |
| L15 | Who is a "Licensed Surveyor" | UDA regulations (definitions) | Defined through the Surveyors Institute of Sri Lanka Act No. 22 of 1982, unlike the Survey Act's LSC-based definition | verified_official (that the conflict exists) | The profile's designation is free text, as the surveyor is entitled to write it |
| L16 | Plan language | Survey Act s.67 (about the Act's own text); LSC and UDA publish in several languages | No rule on the language of a plan was found | not_verified | English only today. A per-plan language setting is planned, with no rule enforced |

## The plan sheet (UDA regulation 9 and conventions)

UDA regulation 9 covers "the Survey Plan for the proposed sub-division, amalgamation, resurvey or any other related development" in UDA-declared areas. It is a checklist for those plans, not a universal rule, so Survey Studio should offer it as a switchable "UDA submission" profile (planned). The commonly cited Extraordinary Gazette No. 2235/54 of 8 July 2021 could not be confirmed (not_verified); a profile built from this copy should name the document it came from.

| # | Sheet item | Source and section | Status | In the template ([PLAN_SHEET_SPECIFICATION.md](PLAN_SHEET_SPECIFICATION.md)) |
| --- | --- | --- | --- | --- |
| S1 | Existing buildings shown to scale | UDA reg. 9(b) | verified_official, UDA plans | Feature layers: Buildings |
| S2 | Scale, north point, assessment numbers of adjoining lots | UDA reg. 9(c) | verified_official, UDA plans | Scale and north point always drawn. No assessment-number field; the boundary descriptions are free text |
| S3 | Access and its width | UDA reg. 9(d) | verified_official, UDA plans | Not built (Roads layer only) |
| S4 | Existing and proposed drains with flow direction | UDA reg. 9(e) | verified_official, UDA plans | Drains layer; no flow arrows |
| S5 | Contours or spot levels where the slope exceeds 10 degrees | UDA reg. 9(g), (h) | verified_official, UDA plans | Not built (topographic, stage 192) |
| S6 | Boundaries in black; previous boundaries superimposed in red with a note | UDA reg. 9(i) | verified_official, UDA plans | Boundary in black in the PDF. Red previous boundaries not built |
| S7 | Previous plans referenced, or a note that none exist and the source used | UDA reg. 9(j) | verified_official, UDA plans | Previous plans field; the `SHEET_PREVIOUS_PLANS` finding cites the regulation |
| S8 | Street lines, building lines, road reservations | UDA reg. 9(k) | verified_official, UDA plans | Not built |
| S9 | Water courses, sewers, manholes, fences, retaining walls, power and telephone lines | UDA reg. 9(l) | verified_official, UDA plans | Feature layers: Walls, Fences, Drains, Utilities |
| S10 | Geo-coordinates of at least four meeting points of main boundaries | UDA reg. 9(n) | verified_official, UDA plans | The overleaf lists grid coordinates of every boundary point. Whether grid coordinates meet "Geo coordinates" is not_verified |
| S11 | A 7½ cm × 5 cm space on the front page for the development permit | UDA reg. 9(p) | verified_official, UDA plans | Optional 75 × 50 mm permit box (`settings.permitBox`) |
| S12 | International A-series metric sheets; the original plus five certified copies | UDA reg. 9(q) | verified_official, UDA plans | A4, A3, A2. Copies are not Farbaek's concern. The UDA's online instructions ask for the original plus four copies, or six hard copies in the Colombo Municipal Council area: the sources conflict |
| S13 | Block-out plan at not less than 1:1000 (1:4000 for very large sites) | UDA reg. 8 | verified_official, UDA subdivisions | The block-out plan from a division (stage 193, ADR 0208), at 1:1000 or larger where it fits on A4 to A2; otherwise at the automatic scale |
| S14 | Plan number, survey date, surveyor's name and registration, lot count, schedule of lots, extent in A-R-P | UDA Form B, items 3.1 to 3.7 | verified_official as application data, not as a sheet rule | Plan number, survey date and the surveyor block are on the sheet. The form's own example extent, "2A 5R 3P", is impossible (four roods make an acre) |
| S15 | Schedule of boundaries ("North by", "East by" and so on) | LSC guideline, ch. 2 | A convention in non-binding guidance; the exact wording not_verified | **professional_configuration_required**: template captions; the surveyor types each side; `SHEET_BOUNDARY_DESCRIPTION` warns when one is empty |
| S16 | Building notation (P) permanent, (Ty) temporary | LSC guideline, ch. 2 | Convention in non-binding guidance | "P Permanent building" is one of the legend's starting examples |
| S17 | Location block: village, GN, DS, district, province | UN-GGIM 2014 (the units exist: 9 provinces, 25 districts, 331 DS divisions, 14,021 GN divisions, 335 local authorities as of 2014) | not_verified as a plan rule | **professional_configuration_required**: optional fields; `SHEET_EMPTY_DISTRICT` is information only |
| S18 | Boundary-mark legend (MW, CP, St, NF and others) | none found; the codes and meanings recur across six practising plans (S21) | not_verified as a rule; observed in practice | **professional_configuration_required**: the code library starts from `COMMON_CODES`, labelled common usage, not official. `LEGEND_UNREVIEWED` blocks approval until the surveyor marks the codes checked or changes them. The Reference lists only the codes the plan uses |
| S19 | Certificate wording, seal or stamp, licence number on the sheet | none found | not_verified | **professional_configuration_required**: no certificate wording; empty Signature and Seal boxes; the registration as the surveyor entered it |
| S20 | Extent also in hectares or m² | none found; all six practising plans give hectares to 5 decimals beside A-R-P (S21) | not_verified as a rule; observed in practice | Classic sheet: "Containing in Extent X Hectares ( a A. r R. pp.pp P. )", both computed. Panel layout: with m² |
| S21 | The classic layout: surveyor block top left, plan number top right, needle north arrow, the Reference bottom left of the drawing, "Scale:-", "PLAN", one composed title sentence, district and province in capitals, bounded as follows, extent, dates, statement, signature, schedule overleaf | Six plans by one practising licensed surveyor in Gampaha District, studied for structure only ([REFERENCE_PLANS_ANALYSIS.md](REFERENCE_PLANS_ANALYSIS.md)) | observed in practice; not an official specification | **professional_configuration_required**: the default `classic` template, every caption template data; the panel layout stays available |
| S22 | Title sentence wording ("of three (03) allotments of land marked lots … called … being resurvey of the existing boundaries & sub division of lot … depicted in Plan No. … situated at … Village in … Pattu of … Korale") | The same six plans (S21) | observed in practice | Composed from fields by `titleSentence`; a missing field leaves a dotted blank, never a guess; "My own wording" replaces the clause after "being" |
| S23 | Road widths written in feet to the half foot ("14.5ft - 15ft wide") | The same six plans (S21) | observed in practice | Computed square across the two surveyed edges (international foot, 0.3048 m); metres or none can be chosen per road |
| S24 | Location by village, pattu and korale rather than GN and DS divisions | The same six plans (S21) | observed in practice | Village, pattu and korale fields in the title sentence; GN and DS stay optional |

## Subdivision rules (for stage 191)

All from the UDA regulations, verified_official, for UDA-declared areas, and due for replacement: the UDA review page schedules "Minister's approval and gazetting" of new regulations for **31 December 2026**. They must be loaded as versioned data citing this document, with a Development Plan override. Stage 193 built the minimums (regs. 9(a), 14(1)) and the reminders for regs. 4(1), 7 and 23 as the set `uda-2020`, with the surveyor's own minimums as the override (`src/core/survey/rules.ts`, ADR 0207). The others are not built yet.

| Rule | Section |
| --- | --- |
| Prior written consent from the UDA and the local authority for subdivision, amalgamation or resurvey | reg. 4(1) |
| A declaration from a Relevant Qualified Person may be required above 1.0 ha or at 8 or more lots | reg. 7 |
| Minimum lot 150 m² (labelled "6 perches"), 6.0 m frontage, 12.0 m depth, unless a Development Plan says otherwise | regs. 9(a), 14(1) |
| Carriageway at least 3.0 m; access width by lots served; a 9.0 m main access may be reduced to 7.0 m; a dead-end lot may have 3.0 m frontage | reg. 18(2), (4), (5), (6) |
| Turning circle at least 9.0 m across on streets under 9.0 m wide and over 30.0 m long; 15.0 m where the access is 9.0 m or wider | reg. 21 |
| Junctions rounded or splayed | reg. 22 |
| At least 10% of land of 1 ha or more, excluding streets, for community, recreation and open space | reg. 23, exceptions in regs. 24 to 26 |
| A Licensed Surveyor's declaration on every perimeter, extraction, subdivision and amalgamation plan | Schedule 3 |
| Access widths 3.0, 4.5, 7.0 and 9.0 m against road length and lots served | Schedule 4: the table's row alignment was lost in extraction, so the pairing is **not_verified** and must not be encoded from this copy |

The often-quoted "20 ft" access figure appeared in no official source (not_verified). Rules outside UDA areas, such as Pradeshiya Sabha by-laws, were not researched.

## Units and rounding

| # | Fact | Source and section | Status | In Survey Studio |
| --- | --- | --- | --- | --- |
| U1 | 1 square rod (perch) = 25.292 852 64 m² exactly; 1 acre = 4 046.856 422 4 m² exactly; 16½ ft = 1 rod; on the 1959 international foot | NIST HB 44 (2026), Appendix C, Units of Area and the conversion tables | verified_official (a US source, not Sri Lankan law) | `PERCH_M2 = 25.29285264`, `ACRE_M2 = 4046.8564224` in [`units.ts`](../../src/core/survey/units.ts) |
| U2 | 1 rood = 40 perches = 1 011.714 105 6 m²; 1 ha = 395.3686 perches = 2 A 1 R 35.3686 P | arithmetic from U1 | derived | `ROOD_M2`; tested |
| U3 | Official Sri Lankan definition of the perch | none found | not_verified | U1 is used, and the overleaf states the constant |
| U4 | UDA texts use rounded labels, such as "150m2 in extent (6 perches)" and "4047m2 (1 acre)" | UDA regulations | verified_official (as labels). Six perches is 151.76 m², so these are not conversion constants | Square metres are stored; A-R-P is derived for display |
| U5 | Rounding of stated extents | none found | not_verified | **professional_configuration_required**: perches rounded once, then carried; `perchDecimals` setting, 2 by default (no control on screen yet) |

## Coordinate systems and transformations

| # | Fact | Source | Status | In Survey Studio |
| --- | --- | --- | --- | --- |
| C1 | SLD99 / Sri Lanka Grid 1999 (EPSG:5235): Transverse Mercator on Everest 1830 (1937 Adjustment), a = 6 377 276.345 m, 1/f = 300.8017; origin 7.00047152777778° N, 80.7717130833333° E; scale 0.9999238418; false easting and northing 500 000 m; easting then northing, metres; E 374 653.87 to 630 460.79, N 373 847.32 to 818 630.19 | epsg.io/5235 (EPSG v13.102); cross-checked with Karunaratne 2007 | verified_secondary | Registry record in [`crs.ts`](../../src/core/survey/crs.ts); plausible range E 370,000 to 635,000, N 370,000 to 830,000 |
| C2 | Kandawala / Sri Lanka Grid (EPSG:5234): same ellipsoid and scale; origin 7.00048027777778° N, 80.7717111111111° E; false origin 200 000 m; E 74 453.86 to 330 260.94, N 73 850.9 to 518 632.65 | epsg.io/5234 | verified_secondary | Registry record; range E 70,000 to 335,000, N 70,000 to 530,000 |
| C3 | The easting ranges of C1 and C2 don't overlap; the northings do. UTM zone 44N eastings overlap SLD99 | C1, C2; UTM by the researchers' rough calculation | verified_secondary; the UTM overlap derived | Ranges only test a claim (`implausiblePoints`, `looksSwapped`); the person confirms the CRS |
| C4 | WGS 84 / UTM zone 44N (EPSG:32644) exists and covers Sri Lanka | epsg.io search listing | verified_secondary for the record's existence | Registry record. Its plausible range (E 160,000 to 840,000, N 0 to 9,400,000) is not from the research: the record's source line says it is Farbaek's own broad box for the zone, used only to question a choice |
| C4a | Local coordinates: a site grid with an arbitrary origin, not tied to any national grid | none needed; the surveyor's choice | professional_configuration_required | `LOCAL_CRS` in the registry; bearings are relative to the site grid's north, and the `CRS_LOCAL` finding asks the surveyor to say so on the plan |
| C5 | SLD99 is mandatory for cadastral or Bim Saviya work | none found | not_verified | SLD99 is listed first; nothing makes it the rule |
| C6 | SLD99 network accuracy 1:790,000 on average | UN RCC-AP 2006 | verified_official | None |
| C7 | EPSG:5236 "SLD99 to WGS 84 (1)": Coordinate Frame rotation, translations −0.293, 766.95, 87.713 m, rotations −0.195704″, −1.695068″, −3.473016″, scale −0.039338 ppm; accuracy 14 m; "Low accuracy applications" | epsg.io/5236 | verified_secondary | No transformation runs |
| C8 | EPSG:1157 "Kandawala to WGS 84 (1)": translations −97, 787, 86 m; accuracy 35 m | epsg.io/5234 | verified_secondary | No transformation runs |
| C9 | No EPSG transformation between Kandawala and SLD99. Seven-parameter fits on 32 common points leave residuals up to 2.388 m E and 2.743 m N | epsg.io/4244, epsg.io/5233; Karunaratne 2007 | verified_secondary | Subtracting 300 000 m does not convert SLD99 to Kandawala. Kandawala data should be re-observed or tied to local control, not transformed silently |
| C10 | Vertical datum SLVD height (EPSG:5237, datum 1054); its definition disputed; no national geoid found; EGM2008 fits with a −1.75 m bias | epsg.io/5237; UN RCC-AP 2006; Prasanna and Gunathilaka 2022; Newton's Bulletin 4 | verified_secondary (UN RCC-AP verified_official) | Not built: elevations are stored and printed as imported, with no vertical datum recorded |

### Warning: the proj4 string for EPSG:5235

**Do not copy the proj4 string epsg.io publishes for EPSG:5235.** It is:

```
+proj=tmerc +lat_0=7.00047152777778 +lon_0=80.7717130833333 +k=0.9999238418 +x_0=500000 +y_0=500000 +ellps=evrst30 +towgs84=-0.293,766.95,87.713,-0.195704,-1.695068,-3.473016,-0.039338 +units=m +no_defs +type=crs
```

- proj4js applies a seven-parameter `+towgs84` in Position Vector form (its `datumUtils.js` and `datum.js`, verified primary).
- PROJ documents that converting between the Position Vector and Coordinate Frame conventions means negating the rotations (PROJ Helmert documentation, verified primary).
- EPSG:5236 is a Coordinate Frame operation. epsg.io normally negates the rotations when it writes `towgs84` (its EPSG:31370 string does), but for EPSG:5235 it publishes the Coordinate Frame signs unchanged (verified_secondary).
- The researchers converted the grid origin, Pidurutalagala, to WGS 84 three ways with their own implementation of the EPSG formulas (derived, not a proj4js run): EPSG:5236 as published gives 7.0008032°, 80.7737357°; Kandawala through EPSG:1157 gives a point about 2.1 m away; the epsg.io string read as proj4js reads it gives 7.0008472°, 80.7719220°, **about 199 m from both**.

The corrected definition changes only the three rotation signs (derived):

```
+towgs84=-0.293,766.95,87.713,0.195704,1.695068,3.473016,-0.039338
```

Before any transformation ships, check it against PROJ (`projinfo` or pyproj, EPSG:5235 to EPSG:4326) and save the results as test vectors. Whether proj4js accepts the `+type=crs` token was not checked, so leave it out. Any transformation must carry its EPSG code and accuracy, and the app must warn or refuse when one would be used for boundary work. Survey Studio runs no transformation today.

## Technical register

| # | Fact | Source | Status | In Survey Studio |
| --- | --- | --- | --- | --- |
| T1 | GeoJSON coordinates are WGS 84 longitude then latitude; the `crs` member "has been removed"; six decimals is about 10 cm | RFC 7946 | verified_official | WGS 84 GeoJSON is refused on import; the export names its grid with the legacy `crs` member and says it isn't RFC 7946 coordinates |
| T2 | Point files declare nothing; Civil 3D ships PNEZD, PENZD, PNEZ, PENZ, PNE, NEZ and ENZ | Autodesk Civil 3D Developer's Guide | verified primary | The column mapper with six presets; units and CRS confirmed by the person |
| T3 | R12 (AC1009) needs only an ENTITIES section and no handles; R13 and later need the full object graph with handles | ezdxf documentation, file structure and handles | verified primary | The DXF writer targets R12 |
| T4 | Write `$INSUNITS = 6` and `$MEASUREMENT = 1` for metres | ezdxf documentation, units (based on BricsCAD experiments) | verified primary | **Not followed**: the writer adds a units note on the TEXT layer instead (see ADR 0200) |
| T5 | `\U+XXXX` escapes work in every DXF version | ezdxf documentation, file encoding | verified primary | Non-ASCII text is escaped |
| T6 | DIMENSION depends on anonymous blocks and a DIMSTYLE; its documentation page returned 404 | ezdxf | not_verified | No DIMENSION entities; bearings and distances are TEXT |
| T7 | Re-saving as R12 fixes failed imports | forum reports | not_verified | Not relied on |
| T8 | dxf-parser 1.1.2 (MIT, released 2021-11-12) reads header, layers, line types, blocks, inserts and text | its repository | verified primary | The independent reader in the tests |
| T9 | PDFKit 0.20.2 (MIT, 2026-08-30) embeds TrueType fonts through fontkit, sets page sizes in points, draws vector paths | PDFKit documentation | verified primary | The PDF writer (ADR 0200) |
| T10 | fontkit sends Sinhala and Tamil to its Indic shaper, and PDFKit writes glyph offsets; pdf-lib drops GPOS offsets | fontkit 2.0.4 source; PDFKit 0.17.2 bundle; pdf-lib 1.17.1 source | verified primary for the code read; the effect on pdf-lib derived; not checked in 0.20.2 | Why PDFKit was chosen. Sinhala and Tamil are not built |
| T11 | PDF user space is 72 units per inch, so 1 mm = 72 / 25.4 pt; A3 is 841.89 × 1190.55 pt | PDFKit and pdf-lib documentation | verified primary | `MM_TO_PT = 72 / 25.4` |
| T12 | `/PrintScaling /None` (PDF 1.6) asks viewers to preselect no scaling; Chromium reads it | Chromium code review 2272053002 (verified primary); ISO 32000-1 seen through ABCpdf documentation (not_verified) | Whether Chrome, Edge and Acrobat honour it: not_verified | Written into the catalog; never described as a guarantee; the 100 mm check line and the print guide |
| T13 | Turf's area, distance and bearing are spherical, for longitude and latitude | Turf source | verified primary | Not used; the engine is planar |
| T14 | Area by coordinates, bearings, misclosure, traverse adjustment | Ghilani, *Elementary Surveying*, 16th ed. (Pearson), sections 7, 10.3 to 10.8, 12.5 | verified official for the table of contents only; the formula text wasn't read | The formulas in [GEOMETRY_ENGINE.md](GEOMETRY_ENGINE.md); no adjustment |
| T15 | DMS formatting rounds in the smallest displayed unit, then carries | no source found | not_verified as a sourced rule | Implemented and pinned by tests |
| T16 | Relative precision is 1 : floor(P / e) | a Scribd copy of a university handout | not_verified | The code reports P / e unrounded |
| T17 | Exact orientation predicates (robust-predicates 3.0.3) avoid wrong answers near zero | Shewchuk; robust-predicates README | verified primary | **Not used**: the code takes float64 orientation signs and treats legs within 0.5 mm of each other as touching |

## What is not verified

In one list, for anyone deciding what Survey Studio may claim:
- any regulation on plan content or limits of error under the Survey Act (L9 to L12);
- digital signatures on plans (L13);
- the plan's language (L16);
- the boundary-mark legend, certificate wording, seal, the location block, the "North by" wording and hectares on the sheet (S15 to S20);
- the official perch and the rounding of extents (U3, U5);
- whether SLD99 is mandatory, the vertical datum, and any official Kandawala to SLD99 transformation (C5, C9, C10);
- the corrected EPSG:5235 parameters, until checked against PROJ;
- the UDA gazette number and a clean Schedule 4 table;
- whether viewers honour `/PrintScaling /None`, and whether CAD programs draw Sinhala or Tamil from `\U+` escapes.

## What is configurable

| Setting | Where | Default |
| --- | --- | --- |
| The CRS, confirmed by a person | project | none (the person chooses) |
| Paper, orientation, scale | drawing settings | A3, landscape, the suggested scale |
| Perch, second and distance decimals | drawing settings (no control on screen yet) | 2, 0, 2 |
| Overleaf schedule | drawing settings | on |
| UDA development permit box | drawing settings | off |
| Legend codes and meanings | sheet fields | the brief's ten examples, flagged until changed |
| Boundary descriptions, location, previous plans, stated extent, remarks | sheet fields | empty |
| The surveyor's name, designation, registration, address and contact | the surveyor's own profile | empty |
| Template captions | template data | fixed in `SRI_LANKA_CADASTRAL_V1`; editing is planned |

## Wording rules that follow

- Never say a plan, a sheet or a check is compliant, certified, approved by an authority or guaranteed to print at scale.
- Say what a sheet item is and where it comes from: for example, that UDA regulation 9 asks for a permit box in UDA-declared areas and the sheet has one as an option.
- "Approved by surveyor" means the responsible surveyor approved a version in Farbaek. It is never "Verified" or "Certified".

## Open questions

| Question | Next step |
| --- | --- |
| A plan-content regulation, surviving Surveyors Ordinance regulations, accuracy limits | Gazette search; ask the Survey Department or the LSC |
| LSC circulars 1/2015 to 1/2021 and Condominium Circular 2/2017 | OCR the scanned PDFs |
| Survey Department specimen plans, certificate wording, seal, boundary-mark legend | Review by a registered licensed surveyor |
| Digital signatures on plans | Read the Electronic Transactions Act No. 19 of 2006; legal advice |
| The UDA gazette number and a clean Schedule 4 | Obtain the gazetted PDF |
| Whether SLD99 is mandatory; the SLVD definition and a geoid | Ask the Survey Department |
| The corrected EPSG:5235 parameters | Test vectors from `projinfo` or pyproj |
| Sinhala and Tamil in PDF and CAD | Fonts with those scripts; compare PDFKit's glyph ids with HarfBuzz for a fixed word list; open sample DXFs in CAD programs |
| Printing at scale in Chrome, Edge and Acrobat | Manual print tests |
