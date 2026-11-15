/**
 * Quality control (survey skill, survey-quality-control). Every finding has a
 * code, a severity, the thing it is about, what was found, what to do next,
 * and what it blocks. Passing every check is not certification or legal
 * compliance: a plan is final only when its surveyor approves a version.
 */
import type { CrsRecord } from "./crs";
import { implausiblePoints, looksSwapped } from "./crs";
import type { SurveyDocument } from "./document";
import { legendIsBriefExamples } from "./document";
import { TOUCH_TOLERANCE_M, distance, orient, type Point } from "./geometry";
import type { ParcelResult, SurveyPoint } from "./parcel";

export type Severity = "error" | "warning" | "information" | "professional_review";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  /** What the finding is about, so the screen can take the person there. */
  target: { kind: "project" | "point" | "boundary" | "leg" | "feature" | "field" | "sheet"; id?: string };
  /** What was found, in figures where there are any. */
  detail?: string;
  /** What to do about it. */
  action: string;
  /** Operations this finding stops until it is resolved. */
  blocks: ("plan" | "export" | "approval")[];
}

export interface QcInput {
  points: readonly SurveyPoint[];
  crs: CrsRecord | null;
  crsConfirmed: boolean;
  document: SurveyDocument;
  parcel: { ok: true; parcel: ParcelResult } | { ok: false; missing: string[] } | null;
  /** Whether the chosen surveyor has a profile in this workspace. */
  surveyorProfile: boolean;
}

export const SEVERITY_ORDER: Severity[] = ["error", "professional_review", "warning", "information"];

/** Whether every point lies within half a millimetre of the line through the two farthest apart. */
function collinear(points: readonly Point[]): boolean {
  const a = points[0]!;
  const b = points.reduce((far, p) => (distance(a, p) > distance(a, far) ? p : far), a);
  const len = distance(a, b);
  if (len <= TOUCH_TOLERANCE_M) return true;
  return points.every((p) => Math.abs(orient(a, b, p)) / len <= TOUCH_TOLERANCE_M);
}

export function checkSurvey(input: QcInput): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);
  const { points, crs, document: doc } = input;

  if (!crs) {
    add({ code: "CRS_MISSING", severity: "error", message: "No coordinate system is set for this project.", target: { kind: "project" }, action: "Choose and confirm the coordinate system in the project settings.", blocks: ["export", "approval"] });
  } else if (!input.crsConfirmed) {
    add({ code: "CRS_NOT_CONFIRMED", severity: "professional_review", message: `${crs.name} hasn't been confirmed by a person.`, target: { kind: "project" }, action: "Confirm the coordinate system in the project settings.", blocks: ["approval"] });
  } else if (crs.kind === "local") {
    add({ code: "CRS_LOCAL", severity: "information", message: "These are local coordinates, not tied to a national grid.", target: { kind: "project" }, action: "Bearings are relative to the site grid's north. Say so on the plan if it is submitted.", blocks: [] });
  }

  if (points.length === 0) {
    add({ code: "NO_POINTS", severity: "error", message: "No points have been imported yet.", target: { kind: "project" }, action: "Import a point file on the Import step.", blocks: ["plan", "export", "approval"] });
  } else if (crs && crs.kind === "projected") {
    const outside = implausiblePoints(points, crs);
    if (looksSwapped(points, crs)) {
      add({ code: "AXES_LOOK_SWAPPED", severity: "error", message: "Eastings and northings look swapped for this coordinate system.", target: { kind: "project" }, detail: `All ${points.length} points fall outside ${crs.name}'s range, and all fall inside it with the two columns swapped.`, action: "Import the file again with the easting and northing columns mapped the other way round.", blocks: ["export", "approval"] });
    } else if (outside > 0) {
      add({ code: "POINTS_OUT_OF_RANGE", severity: "warning", message: `${outside} of ${points.length} points are outside the usual range of ${crs.name}.`, target: { kind: "project" }, action: "Check the coordinate system and the units (metres, not feet) of the imported file.", blocks: [] });
    }
  }

  const boundary = doc.boundary;
  if (boundary.length === 0) {
    add({ code: "BOUNDARY_NOT_SET", severity: "error", message: "The boundary hasn't been chosen.", target: { kind: "boundary" }, action: "Choose the boundary points in order on the Boundary step.", blocks: ["plan", "export", "approval"] });
  } else if (input.parcel && !input.parcel.ok) {
    add({ code: "BOUNDARY_MISSING_POINTS", severity: "error", message: "The boundary uses points that no longer exist in this project.", target: { kind: "boundary" }, detail: `${input.parcel.missing.length} point references can't be found.`, action: "Choose the boundary again from the current points.", blocks: ["plan", "export", "approval"] });
  } else if (input.parcel && input.parcel.ok) {
    const p = input.parcel.parcel;
    if (p.vertices.length < 3) {
      add({ code: "BOUNDARY_TOO_FEW", severity: "error", message: "A boundary needs at least three points.", target: { kind: "boundary" }, action: "Add the remaining boundary points in order.", blocks: ["plan", "export", "approval"] });
    }
    if (p.repeatedPoints.length > 0) {
      add({ code: "BOUNDARY_REPEATS_POINT", severity: "error", message: `The boundary uses point ${p.repeatedPoints.join(", ")} more than once.`, target: { kind: "boundary" }, action: "A boundary closes back to its first point by itself; remove the repeat.", blocks: ["export", "approval"] });
    }
    for (const i of p.zeroLegs) {
      const leg = p.legs[i];
      if (leg) add({ code: "BOUNDARY_ZERO_LEG", severity: "error", message: `The leg from ${leg.from.pointId} to ${leg.to.pointId} has no length.`, target: { kind: "leg", id: String(i) }, detail: `${(leg.distance * 1000).toFixed(1)} mm`, action: "Two boundary points sit on the same spot. Remove one, or check the field data.", blocks: ["export", "approval"] });
    }
    // Points on one line (which also fold back over themselves) are diagnosed as that; a crossing ring as crossing;
    // a ring thinner than about a millimetre on average as having no area. "0A 0R 0.00P" is never a lot.
    const onOneLine = p.vertices.length >= 3 && collinear(p.vertices);
    const sliver = !onOneLine && p.crossings.length === 0 && p.vertices.length >= 3 && p.areaM2 <= p.perimeterM * TOUCH_TOLERANCE_M;
    if (onOneLine || sliver) {
      add({ code: "BOUNDARY_NO_AREA", severity: "error", message: "The boundary encloses no real area: its points lie on a line.", target: { kind: "boundary" }, detail: `${p.areaM2.toFixed(6)} m² inside a perimeter of ${p.perimeterM.toFixed(3)} m.`, action: "Check the order and the coordinates of the boundary points.", blocks: ["export", "approval"] });
    } else if (p.crossings.length > 0) {
      const [a, b] = p.crossings[0]!;
      const la = p.legs[a]!, lb = p.legs[b]!;
      add({ code: "BOUNDARY_SELF_INTERSECTS", severity: "error", message: "The boundary crosses itself, so its area can't be computed.", target: { kind: "boundary" }, detail: `The leg ${la.from.pointId}–${la.to.pointId} meets the leg ${lb.from.pointId}–${lb.to.pointId}${p.crossings.length > 1 ? `, and ${p.crossings.length - 1} more pairs cross` : ""}.`, action: "Check the order of the boundary points.", blocks: ["export", "approval"] });
    }
  }

  for (const f of doc.features) {
    const missing = f.points.filter((id) => !points.some((p) => p.id === id));
    if (missing.length > 0) {
      add({ code: "FEATURE_MISSING_POINTS", severity: "error", message: `A ${f.layer.toLowerCase()} feature uses points that no longer exist.`, target: { kind: "feature", id: f.id }, action: "Remove the feature or choose its points again.", blocks: ["export", "approval"] });
    }
  }

  const s = doc.sheet;
  const required: [keyof typeof s, string][] = [
    ["planNumber", "plan number"],
    ["surveyDate", "survey date"],
  ];
  for (const [key, label] of required) {
    if (!String(s[key]).trim()) add({ code: `SHEET_MISSING_${String(key).replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`, severity: "warning", message: `The ${label} is empty.`, target: { kind: "field", id: key }, action: `Fill in the ${label} on the Plan step before approval.`, blocks: ["approval"] });
  }
  const conventional: [keyof typeof s, string][] = [
    ["lot", "lot"],
    ["landName", "land name"],
    ["district", "district"],
  ];
  for (const [key, label] of conventional) {
    if (!String(s[key]).trim()) add({ code: `SHEET_EMPTY_${String(key).replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`, severity: "information", message: `The ${label} is empty.`, target: { kind: "field", id: key }, action: `Fill it in if this plan should show it.`, blocks: [] });
  }
  const b = s.boundaries;
  if (!b.north.trim() || !b.east.trim() || !b.south.trim() || !b.west.trim()) {
    add({ code: "SHEET_BOUNDARY_DESCRIPTION", severity: "warning", message: "Some of the boundary descriptions (North, East, South, West) are empty.", target: { kind: "field", id: "boundaries" }, action: "Type what adjoins each side, as you found it. Farbaek never fills these in.", blocks: [] });
  }
  if (!s.previousPlans.trim()) {
    add({ code: "SHEET_PREVIOUS_PLANS", severity: "information", message: "No previous plans are cited.", target: { kind: "field", id: "previousPlans" }, action: "Cite earlier plans, or note that there are none and how the boundaries were found (UDA regulation 9 asks for this in UDA areas).", blocks: [] });
  }
  if (legendIsBriefExamples(s.legend)) {
    add({ code: "LEGEND_UNREVIEWED", severity: "professional_review", message: "The legend is still the starting examples, which aren't an official list.", target: { kind: "field", id: "legend" }, action: "Review the legend: keep, edit or remove each code so it matches this plan.", blocks: ["approval"] });
  }
  const legendCodes = new Set(s.legend.map((e) => e.code.toUpperCase()));
  if (input.parcel && input.parcel.ok) {
    const unknown = [...new Set(input.parcel.parcel.vertices.map((v) => v.code).filter((c): c is string => Boolean(c && c.trim())).filter((c) => !legendCodes.has(c.trim().toUpperCase())))];
    if (unknown.length > 0) {
      add({ code: "MARK_CODE_NOT_IN_LEGEND", severity: "information", message: `Boundary point codes not in the legend: ${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? "…" : ""}.`, target: { kind: "field", id: "legend" }, action: "Add them to the legend if they should be explained on the plan.", blocks: [] });
    }
  }

  if (!doc.surveyorUserId) {
    add({ code: "NO_SURVEYOR", severity: "professional_review", message: "No surveyor is responsible for this plan yet.", target: { kind: "field", id: "surveyor" }, action: "Choose the licensed surveyor responsible for the plan. They fill in their own details.", blocks: ["approval"] });
  } else if (!input.surveyorProfile) {
    add({ code: "SURVEYOR_NO_PROFILE", severity: "professional_review", message: "The chosen surveyor hasn't entered their details yet.", target: { kind: "field", id: "surveyor" }, action: "The surveyor enters their name, designation and registration under Surveyor details.", blocks: ["approval"] });
  }

  return out.sort((x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity));
}

/** Whether any finding stops the given operation. */
export function blocked(findings: readonly Finding[], op: "plan" | "export" | "approval"): Finding[] {
  return findings.filter((f) => f.blocks.includes(op));
}
