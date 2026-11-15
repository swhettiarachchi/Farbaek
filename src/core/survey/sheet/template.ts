/**
 * Plan sheet templates are versioned data, not hard-coded layout (survey
 * skill, plan-sheet-composer). This one follows the sections the owner's
 * brief lists for a Sri Lankan land survey plan. Its captions are settings:
 * where a wording isn't confirmed by an official source (the "North by …"
 * descriptions, the legend codes), the standards research says so, and a
 * surveyor can change it.
 */

export interface SheetTemplate {
  id: string;
  version: number;
  name: string;
  /** Margins from the paper edge to the frame, mm, by paper size. */
  margin: { A4: number; A3: number; A2: number };
  /** Font sizes, mm. */
  text: { title: number; heading: number; body: number; small: number; label: number; tableBody: number };
  /** Line weights, mm. */
  lines: { frame: number; boundary: number; feature: number; panel: number; thin: number };
  /** The side panel's width (landscape) or the bottom band's height (portrait), as a share of the page, with limits in mm. */
  panel: { landscapeShare: number; landscapeMin: number; landscapeMax: number; portraitShare: number; portraitMin: number; portraitMax: number };
  captions: {
    planNumber: string;
    lot: string;
    planOf: string;
    situatedAt: string;
    extent: string;
    computedArea: string;
    statedExtent: string;
    boundaries: string;
    north: string;
    east: string;
    south: string;
    west: string;
    legend: string;
    survey: string;
    surveyedOn: string;
    planDate: string;
    previousPlans: string;
    remarks: string;
    surveyor: string;
    signature: string;
    seal: string;
    permit: string;
    grid: string;
    overleaf: string;
    coordinates: string;
    legs: string;
    areaComputation: string;
  };
}

export const SRI_LANKA_CADASTRAL_V1: SheetTemplate = {
  id: "lk-cadastral",
  version: 1,
  name: "Sri Lankan land survey plan",
  margin: { A4: 8, A3: 10, A2: 12 },
  text: { title: 5, heading: 2.6, body: 2.4, small: 1.9, label: 2.2, tableBody: 2.2 },
  lines: { frame: 0.6, boundary: 0.5, feature: 0.3, panel: 0.25, thin: 0.18 },
  panel: { landscapeShare: 0.3, landscapeMin: 96, landscapeMax: 140, portraitShare: 0.34, portraitMin: 92, portraitMax: 170 },
  captions: {
    planNumber: "PLAN No.",
    lot: "Lot",
    planOf: "Plan of the land called",
    situatedAt: "Situated at",
    extent: "Extent",
    computedArea: "Computed from coordinates",
    statedExtent: "Stated extent",
    boundaries: "Boundaries",
    north: "North by",
    east: "East by",
    south: "South by",
    west: "West by",
    legend: "References",
    survey: "Survey",
    surveyedOn: "Surveyed on",
    planDate: "Plan date",
    previousPlans: "Previous plans",
    remarks: "Remarks",
    surveyor: "Licensed surveyor",
    signature: "Signature",
    seal: "Seal",
    permit: "For the development permit",
    grid: "Grid",
    overleaf: "Overleaf schedule",
    coordinates: "Coordinates of boundary points",
    legs: "Bearings and distances",
    areaComputation: "Area",
  },
};

export const TEMPLATES: readonly SheetTemplate[] = [SRI_LANKA_CADASTRAL_V1];

/**
 * The classic Sri Lankan sheet (stage 191): portrait, the layout and wording
 * seen on practising surveyors' plans (docs/survey/REFERENCE_PLANS_ANALYSIS.md).
 * Observed in practice, not an official specification. Sizes are shares of
 * the frame's height, so the sheet keeps its proportions on A4, A3 and A2.
 */
export const SRI_LANKA_CLASSIC_V1 = {
  id: "lk-classic",
  version: 1,
  name: "Sri Lankan plan (classic)",
  margin: { A4: 8, A3: 10, A2: 12 },
  /** Text heights as shares of the frame height. */
  text: { region: 0.02, heading: 0.018, planNumber: 0.015, lotLabel: 0.013, description: 0.0095, body: 0.0088, label: 0.0075, small: 0.0068 },
  /** Line weights, mm. */
  lines: { frame: 0.35, boundary: 0.45, feature: 0.25, thin: 0.18 },
  /** Lean of the lettering, degrees, when slanted lettering is on. */
  slant: 15,
  captions: {
    planNumber: "PLAN No.",
    extractOf: "Extract of Lot",
    reference: "Reference",
    note: "Note:-",
    scale: "Scale:-",
    heading: "PLAN",
    blockOutHeading: "BLOCK OUT PLAN",
    blockOutNotice: "NOT YET SURVEYED. The new corners are worked out from the surveyed ones and are not yet pegged.",
    entireBounded: "Entire land bounded as follows",
    lotBounded: "Lot {lot} bounded as follows",
    north: "North by",
    east: "East by",
    south: "South by",
    west: "West by",
    by: ":-",
    extent: "Containing in Extent",
    hectares: "Hectares",
    surveyedAndPartitioned: "Surveyed & partitioned on",
    surveyedOn: "Surveyed on",
    partitionedOn: "Partitioned on",
    overleaf: "For boundaries schedule see overleaf",
  },
} as const;
