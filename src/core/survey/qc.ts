/**
 * Quality control (survey skill, survey-quality-control). Every finding has a
 * code, a severity, the thing it is about, what was found, what to do next,
 * and what it blocks. Passing every check is not certification or legal
 * compliance: a plan is final only when its surveyor approves a version.
 */
import { fitArc } from "./arcs";
import { sketchFindings } from "./autosurvey/sketch";
import { codeOf, codesAreCommonList, codesAreDsrList, lookupCode } from "./codes";
import type { CrsRecord } from "./crs";
import { implausiblePoints, looksSwapped } from "./crs";
import { legIndex, lotName, unreviewed, type SurveyDocument } from "./document";
import { sidedRoadEdge } from "./codehints";
import { autoDoubt, doubtContext } from "./exceptions";
import { codeReport } from "./fieldToFinish";
import { GRAMMAR } from "./grammar";
import { TOUCH_TOLERANCE_M, distance, orient, type Point } from "./geometry";
import { NEAR_LEG_M, nearKey, type PlanLots } from "./lots";
import { ACCESS_NOTE, RESERVED_NOTE, minimumText, remindersFor, ruleSetFrom, shortOf, type RuleSet } from "./rules";
import { readStatedExtent } from "./extent";
import type { SurveyPoint } from "./parcel";
import { fmt, PERCH_M2 } from "./units";

export type Severity = "error" | "warning" | "information" | "professional_review";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  /** What the finding is about, so the screen can take the person there. */
  target: { kind: "project" | "point" | "boundary" | "lot" | "leg" | "feature" | "road" | "field" | "sheet"; id?: string };
  /** What was found, in figures where there are any. */
  detail?: string;
  /** What to do about it. */
  action: string;
  /** Operations this finding stops until it is resolved. */
  blocks: ("plan" | "export" | "approval")[];
  /** For a near miss: the key the surveyor's "keep as surveyed" answer is stored under, and whether it's kept. */
  keep?: { key: string; kept: boolean };
}

export interface QcInput {
  points: readonly SurveyPoint[];
  crs: CrsRecord | null;
  crsConfirmed: boolean;
  document: SurveyDocument;
  lots: PlanLots;
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

/** How far under a minimum a figure must be to count as under it: the rounding it's shown with (0.01 m², 1 mm). */
const RULE_AREA_TOLERANCE_M2 = 0.005;
const RULE_LENGTH_TOLERANCE_M = 0.0005;

/**
 * A lot's frontage on one road or access lot: how much of its legs lies along the access's segments (a segment counts where both its
 * ends are within NEAR_LEG_M of the leg's line, for the stretch the two overlap), so a road that ends part way along a leg gives that
 * part. Counted in straight runs: a run ends where the boundary turns by more than 45 degrees, so a corner lot on a road that turns
 * the corner takes its longer side, not both.
 */
export function frontageOn(legs: readonly { from: Point; to: Point; distance: number }[], segs: readonly (readonly [Point, Point])[]): number {
  const dirs = legs.map((l) => (l.distance > 0 ? { e: (l.to.e - l.from.e) / l.distance, n: (l.to.n - l.from.n) / l.distance } : { e: 0, n: 0 }));
  const covered = legs.map((l, i) => {
    if (l.distance <= 0) return 0;
    const u = dirs[i]!;
    const off = (p: Point) => Math.abs((p.e - l.from.e) * u.n - (p.n - l.from.n) * u.e);
    const t = (p: Point) => (p.e - l.from.e) * u.e + (p.n - l.from.n) * u.n;
    const spans: [number, number][] = [];
    for (const [a, b] of segs) {
      if (off(a) > NEAR_LEG_M || off(b) > NEAR_LEG_M) continue;
      const lo = Math.max(0, Math.min(t(a), t(b)));
      const hi = Math.min(l.distance, Math.max(t(a), t(b)));
      if (hi > lo) spans.push([lo, hi]);
    }
    spans.sort((x, y) => x[0] - y[0]);
    let total = 0;
    let reach = 0;
    for (const [lo, hi] of spans) {
      const from = Math.max(lo, reach);
      if (hi > from) total += hi - from;
      reach = Math.max(reach, hi);
    }
    return total;
  });
  const n = legs.length;
  const joins = (i: number) => covered[i]! > 0 && covered[(i + 1) % n]! > 0 && dirs[i]!.e * dirs[(i + 1) % n]!.e + dirs[i]!.n * dirs[(i + 1) % n]!.n >= Math.SQRT1_2;
  // Start just after a break, so a run that wraps past the ring's first corner is counted whole.
  const startAt = Array.from({ length: n }, (_, i) => i).find((i) => !joins((i - 1 + n) % n));
  if (startAt === undefined) return covered.reduce((x, y) => x + y, 0);
  let best = 0;
  let run = 0;
  for (let k = 0; k < n; k++) {
    const i = (startAt + k) % n;
    run += covered[i]!;
    best = Math.max(best, run);
    if (!joins(i)) run = 0;
  }
  return best;
}

/**
 * Each building lot against the chosen minimums. Reserved lots ("(Res. for Access, 10ft. wide)") aren't held to them. Frontage is the
 * longest straight run along one road (its edges and its ends) or one reserved access lot (frontageOn); depth is the mean depth, the
 * lot's area over that frontage. Only what was measured is said to be met.
 */
function checkRules(set: RuleSet, input: QcInput, add: (f: Finding) => void): void {
  const { document: doc, points } = input;
  const min = set.minimums;
  const byId = new Map(points.map((p) => [p.id, p]));
  // Each road (both edges, and across its ends) and each reserved access lot, as its own set of segments.
  const accesses: [Point, Point][][] = [];
  const polyline = (into: [Point, Point][], ids: readonly string[], closed: boolean) => {
    const ps = ids.map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    for (let i = 0; i + 1 < ps.length; i++) into.push([ps[i]!, ps[i + 1]!]);
    if (closed && ps.length > 2) into.push([ps[ps.length - 1]!, ps[0]!]);
    return ps;
  };
  for (const r of doc.roads) {
    const segs: [Point, Point][] = [];
    const a = polyline(segs, r.edgeA, false);
    const b = polyline(segs, r.edgeB, false);
    if (a.length > 0 && b.length > 0) segs.push([a[0]!, b[0]!], [a[a.length - 1]!, b[b.length - 1]!]);
    if (segs.length > 0) accesses.push(segs);
  }
  const reserved = (note: string) => RESERVED_NOTE.test(note.trim());
  for (const l of doc.lots) {
    if (!reserved(l.note) || !ACCESS_NOTE.test(l.note)) continue;
    const segs: [Point, Point][] = [];
    polyline(segs, l.points, true);
    if (segs.length > 0) accesses.push(segs);
  }
  const cite = set.id === "own" ? `From the minimums you entered: ${set.source}.` : `${set.title}, ${set.source.replace(/^.*?(regs?\.)/, "$1")}, for ${set.appliesTo}.`;
  const weigh = "Check the lot against the rule that applies here. A Development Plan or an approved exception may allow it; say so in the lot's note or the plan's notes.";
  const wantsFrontage = min.frontageM > 0 || min.depthM > 0;
  let checked = 0;
  let short = 0;
  let reservedCount = 0;
  let broken = 0;
  let unmeasured = 0;
  for (const r of input.lots.lots) {
    if (reserved(r.lot.note)) {
      reservedCount++;
      continue;
    }
    const p = r.parcel;
    if (!p || p.crossings.length > 0 || p.repeatedPoints.length > 0 || p.areaM2 <= 0) {
      broken++;
      continue;
    }
    checked++;
    const name = `Lot ${lotName(r.lot) || "without a label"}`;
    const target = { kind: "lot" as const, id: r.lot.id };
    let ok = true;
    if (p.areaM2 < min.areaM2 - RULE_AREA_TOLERANCE_M2) {
      ok = false;
      add({ code: "LOT_UNDER_MINIMUM_AREA", severity: "warning", message: `${name} is ${shortOf(p.areaM2, min.areaM2)} m², under ${set.label} of ${minimumText(min.areaM2, false)} m².`, target, detail: cite, action: weigh, blocks: [] });
    }
    if (wantsFrontage && accesses.length > 0) {
      const frontage = Math.max(0, ...accesses.map((segs) => frontageOn(p.legs, segs)));
      if (frontage < RULE_LENGTH_TOLERANCE_M) {
        if (min.frontageM > 0) {
          ok = false;
          add({ code: "LOT_NO_ROAD_FRONTAGE", severity: "warning", message: `${name} has no leg along a road or an access strip on this plan.`, target, detail: cite, action: "If it's reached by a right of way not drawn here, say so in its note. A reserved access lot counts when its note starts \"Res.\" and names the access.", blocks: [] });
        } else unmeasured++;
      } else {
        if (frontage < min.frontageM - RULE_LENGTH_TOLERANCE_M) {
          ok = false;
          add({ code: "LOT_UNDER_MINIMUM_FRONTAGE", severity: "warning", message: `${name}'s frontage is ${shortOf(frontage, min.frontageM)} m, under ${set.label} of ${minimumText(min.frontageM, true)} m.`, target, detail: cite, action: weigh, blocks: [] });
        }
        const depth = p.areaM2 / frontage;
        if (depth < min.depthM - RULE_LENGTH_TOLERANCE_M) {
          ok = false;
          add({ code: "LOT_UNDER_MINIMUM_DEPTH", severity: "warning", message: `${name}'s mean depth (its area over its frontage) is ${shortOf(depth, min.depthM)} m, under ${set.label} of ${minimumText(min.depthM, true)} m.`, target, detail: cite, action: weigh, blocks: [] });
        }
      }
    }
    if (!ok) short++;
  }
  const leftOut = [
    reservedCount > 0 ? `${reservedCount} reserved ${reservedCount === 1 ? "lot wasn't" : "lots weren't"} checked.` : "",
    broken > 0 ? `${broken} ${broken === 1 ? "lot wasn't checked because its boundary crosses itself or a corner is missing" : "lots weren't checked because their boundaries cross themselves or corners are missing"}.` : "",
  ].filter(Boolean);
  // What was measured for every lot checked: the area always; frontage and depth only where each lot has one.
  const measuredAll = !wantsFrontage || (accesses.length > 0 && unmeasured === 0);
  const met = [
    min.areaM2 > 0 ? `${minimumText(min.areaM2, false)} m²` : "",
    measuredAll && min.frontageM > 0 ? `${minimumText(min.frontageM, true)} m frontage` : "",
    measuredAll && min.depthM > 0 ? `${minimumText(min.depthM, true)} m depth` : "",
  ].filter(Boolean);
  const listed = met.length <= 1 ? met.join("") : `${met.slice(0, -1).join(", ")} and ${met[met.length - 1]}`;
  if (checked > 0 && short === 0 && met.length > 0) {
    const who = checked === 1 ? "The lot checked meets" : `All ${checked} lots checked meet`;
    add({ code: "RULES_LOTS_MEET", severity: "information", message: `${who} ${measuredAll ? (set.id === "own" ? "your minimums" : "the UDA minimums") : "the minimum area"} (${listed}).`, target: { kind: "lot" }, detail: [cite, ...leftOut].join(" "), action: "Nothing to do.", blocks: [] });
  } else if (leftOut.length > 0) {
    add({ code: "RULES_LOTS_LEFT_OUT", severity: "information", message: leftOut.join(" "), target: { kind: "lot" }, action: "Reserved lots aren't building lots. Fix a lot's boundary to have it checked.", blocks: [] });
  }
  if (checked > 0 && wantsFrontage && accesses.length === 0) add({ code: "RULES_FRONTAGE_UNCHECKED", severity: "information", message: "Frontages and depths weren't checked: the plan has no roads or reserved access lots.", target: { kind: "lot" }, action: "Add the road on the Lots step, or a reserved access lot, to check them.", blocks: [] });
  if (unmeasured > 0) add({ code: "RULES_DEPTH_UNMEASURED", severity: "information", message: `Depth wasn't measured for ${unmeasured} ${unmeasured === 1 ? "lot" : "lots"}: ${unmeasured === 1 ? "it has" : "they have"} no leg along a road or reserved access lot.`, target: { kind: "lot" }, action: "Add the road or access it fronts to measure its depth.", blocks: [] });
  const land = input.lots.outlineAreaM2 ?? input.lots.sumAreaM2;
  for (const text of remindersFor(set, land, doc.lots.length - reservedCount)) add({ code: "RULES_REMINDER", severity: "information", message: text, target: { kind: "project" }, action: "Nothing for Farbaek to check: a reminder from the regulations.", blocks: [] });
}

export function checkSurvey(input: QcInput): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);
  const { points, crs, document: doc } = input;
  const known = new Set(points.map((p) => p.id));

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

  // Each lot on its own.
  if (doc.lots.length === 0) {
    add({ code: "BOUNDARY_NOT_SET", severity: "error", message: "No lot has been set yet.", target: { kind: "boundary" }, action: "Set each lot's corners in order on the Lots step, or draft them from your description on the Draft step.", blocks: ["plan", "export", "approval"] });
  }
  const many = doc.lots.length > 1;
  for (const r of input.lots.lots) {
    const name = `Lot ${lotName(r.lot)}`;
    const said = many ? `${name}: ` : "";
    const target = { kind: "lot" as const, id: r.lot.id };
    if (r.lot.points.length === 0) {
      add({ code: "BOUNDARY_NOT_SET", severity: "error", message: `${name} has no corners yet.`, target, action: "Give the lot's corners in order.", blocks: ["plan", "export", "approval"] });
      continue;
    }
    if (!r.parcel) {
      add({ code: "BOUNDARY_MISSING_POINTS", severity: "error", message: `${said}The boundary uses points that no longer exist in this project.`, target, detail: `${r.missing.length} point references can't be found.`, action: "Choose the corners again from the current points.", blocks: ["plan", "export", "approval"] });
      continue;
    }
    const p = r.parcel;
    if (p.vertices.length < 3) {
      add({ code: "BOUNDARY_TOO_FEW", severity: "error", message: `${said}A boundary needs at least three points.`, target, action: "Add the remaining corners in order.", blocks: ["plan", "export", "approval"] });
    }
    if (p.repeatedPoints.length > 0) {
      add({ code: "BOUNDARY_REPEATS_POINT", severity: "error", message: `${said}The boundary uses point ${p.repeatedPoints.join(", ")} more than once.`, target, action: "A boundary closes back to its first point by itself; remove the repeat.", blocks: ["export", "approval"] });
    }
    for (const i of p.zeroLegs) {
      const leg = p.legs[i];
      if (leg) add({ code: "BOUNDARY_ZERO_LEG", severity: "error", message: `${said}The leg from ${leg.from.pointId} to ${leg.to.pointId} has no length.`, target: { kind: "leg", id: `${r.lot.id}:${i}` }, detail: `${(leg.distance * 1000).toFixed(1)} mm`, action: "Two boundary points sit on the same spot. Remove one, or check the field data.", blocks: ["export", "approval"] });
    }
    // Points on one line (which also fold back over themselves) are diagnosed as that; a crossing ring as crossing;
    // a ring thinner than about a millimetre on average as having no area. "0A 0R 0.00P" is never a lot.
    const onOneLine = p.vertices.length >= 3 && collinear(p.vertices);
    const sliver = !onOneLine && p.crossings.length === 0 && p.vertices.length >= 3 && p.areaM2 <= p.perimeterM * TOUCH_TOLERANCE_M;
    if (onOneLine || sliver) {
      add({ code: "BOUNDARY_NO_AREA", severity: "error", message: `${said}The boundary encloses no real area: its points lie on a line.`, target, detail: `${p.areaM2.toFixed(6)} m² inside a perimeter of ${p.perimeterM.toFixed(3)} m.`, action: "Check the order and the coordinates of the corners.", blocks: ["export", "approval"] });
    } else if (p.crossings.length > 0) {
      const [a, b] = p.crossings[0]!;
      const la = p.legs[a]!;
      const lb = p.legs[b]!;
      add({ code: "BOUNDARY_SELF_INTERSECTS", severity: "error", message: `${said}The boundary crosses itself, so its area can't be computed.`, target, detail: `The leg ${la.from.pointId}–${la.to.pointId} meets the leg ${lb.from.pointId}–${lb.to.pointId}${p.crossings.length > 1 ? `, and ${p.crossings.length - 1} more pairs cross` : ""}.`, action: "Check the order of the corners.", blocks: ["export", "approval"] });
    }
  }

  // How the lots fit together.
  const unlabelled = doc.lots.filter((l) => !l.label.trim()).length;
  if (unlabelled > 0) {
    add({ code: "LOT_LABEL_MISSING", severity: "error", message: unlabelled === 1 ? "A lot has no label." : `${unlabelled} lots have no label.`, target: { kind: "lot" }, action: "Give each lot its letter or number on the Lots step, as it appears in the title.", blocks: ["export", "approval"] });
  }
  const labels = doc.lots.map(lotName).filter(Boolean);
  const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dup.length > 0) {
    add({ code: "LOT_LABEL_DUPLICATE", severity: "error", message: `Two lots have the same label: ${[...new Set(dup)].join(", ")}.`, target: { kind: "lot" }, action: "Give each lot its own label.", blocks: ["export", "approval"] });
  }
  for (const [a, b] of input.lots.overlaps) {
    add({ code: "LOTS_OVERLAP", severity: "error", message: `Lots ${lotName(doc.lots[a]!)} and ${lotName(doc.lots[b]!)} overlap.`, target: { kind: "lot", id: doc.lots[a]!.id }, action: "Check the corners of both lots: lots of one plan share their legs, never their insides.", blocks: ["export", "approval"] });
  }
  if (input.lots.holes > 0) {
    add({ code: "LOTS_GAP", severity: "error", message: `There ${input.lots.holes === 1 ? "is a gap" : `are ${input.lots.holes} gaps`} between the lots that no lot covers.`, target: { kind: "lot" }, action: "Check the shared legs: neighbouring lots must use the same corners along the leg they share.", blocks: ["export", "approval"] });
  }
  // Near misses: each one the surveyor either fixes or answers "keep as surveyed", which is recorded in the version.
  const kept = new Set(doc.kept);
  for (const d of input.lots.nearDuplicates) {
    const key = nearKey.duplicate(d.a.id, d.b.id);
    const mm = fmt(d.distanceM * 1000, 1);
    if (kept.has(key)) add({ code: "POINTS_NEAR_DUPLICATE_KEPT", severity: "information", message: `Corner points ${d.a.pointId} and ${d.b.pointId}, ${mm} mm apart, are kept as surveyed.`, target: { kind: "point", id: d.a.id }, action: "Nothing to do, unless you want to check it again.", blocks: [], keep: { key, kept: true } });
    else add({ code: "POINTS_NEAR_DUPLICATE", severity: "professional_review", message: `Corner points ${d.a.pointId} and ${d.b.pointId} are ${mm} mm apart: ${d.distanceM < 0.01 ? "probably" : "perhaps"} one mark observed twice.`, target: { kind: "point", id: d.a.id }, action: "Use one point number for the mark in every lot that shares it, so their legs meet. If they really are two marks, keep them as surveyed.", blocks: ["approval"], keep: { key, kept: false } });
  }
  for (const nl of input.lots.nearLegs) {
    const key = nearKey.leg(nl.corner.id, nl.from.id, nl.to.id);
    const cm = fmt(nl.distanceM * 100, 1);
    const where = `corner ${nl.corner.pointId} is ${cm} cm off lot ${lotName(nl.lot) || "without a label"}'s leg ${nl.from.pointId} to ${nl.to.pointId}`;
    if (kept.has(key)) add({ code: "CORNER_NEAR_LEG_KEPT", severity: "information", message: `Kept as surveyed: ${where}.`, target: { kind: "point", id: nl.corner.id }, action: "Nothing to do, unless you want to check it again.", blocks: [], keep: { key, kept: true } });
    else add({ code: "CORNER_NEAR_LEG", severity: "professional_review", message: `The lots nearly meet: ${where}.`, target: { kind: "point", id: nl.corner.id }, detail: "It leaves a sliver between the lots, or a slight overlap. Nothing has been moved.", action: `If the lots share that line, add point ${nl.corner.pointId} as a corner of lot ${lotName(nl.lot) || "without a label"} too, or use the same marks. If the marks really are apart, keep it as surveyed.`, blocks: ["approval"], keep: { key, kept: false } });
  }
  // The extent a deed or earlier plan states, beside the land computed from the points (never in place of it).
  const statedText = doc.sheet.statedExtent.trim();
  // The land the plan computes: its outline, or the lots' sum when they form separate pieces without gaps or overlaps.
  const computed = input.lots.outlineAreaM2 ?? (input.lots.overlaps.length === 0 && input.lots.holes === 0 && input.lots.sumAreaM2 > 0 ? input.lots.sumAreaM2 : null);
  if (statedText && computed === null && input.lots.lots.length > 0) {
    add({ code: "STATED_EXTENT_UNREAD", severity: "information", message: "The stated extent isn't compared with the land, because the lots don't fit together yet.", target: { kind: "field", id: "statedExtent" }, action: "Fix the overlaps or gaps between the lots first.", blocks: [] });
  }
  if (statedText && computed !== null && computed > 0) {
    const stated = readStatedExtent(statedText);
    if (!stated) {
      add({ code: "STATED_EXTENT_UNREAD", severity: "information", message: `The stated extent "${statedText.slice(0, 40)}" isn't written in units Farbaek can read, so it isn't compared with the land.`, target: { kind: "field", id: "statedExtent" }, action: "Write it as on the deed, for example 0 A. 2 R. 04.60 P., 0.21398 Hectares, 34.5 perches or 2,267 m².", blocks: [] });
    } else {
      const diff = stated.m2 - computed;
      const pct = (Math.abs(diff) / computed) * 100;
      const words = stated.as === "ha" ? `${fmt(Math.abs(diff) / 10_000, 5)} ha` : stated.as === "m2" ? `${fmt(Math.abs(diff), 2)} m²` : `${fmt(Math.abs(diff) / PERCH_M2, 2)} perches`;
      const detail = `Stated ${fmt(stated.m2, 2)} m², computed ${fmt(computed, 2)} m²: the stated extent is ${words} (${fmt(pct, 1)}%) ${diff >= 0 ? "more" : "less"}.`;
      if (pct <= 1) add({ code: "STATED_EXTENT_AGREES", severity: "information", message: "The stated extent agrees with the land computed from your points, within 1%.", target: { kind: "field", id: "statedExtent" }, detail, action: "Nothing to do.", blocks: [] });
      else add({ code: "STATED_EXTENT_DIFFERS", severity: "warning", message: `The stated extent differs from the land computed from your points by ${fmt(pct, 1)}%.`, target: { kind: "field", id: "statedExtent" }, detail, action: "Deeds are often older than the survey. Check the stated extent is copied right, and mention the difference in the plan's notes if it matters. The plan shows the computed extent.", blocks: [] });
    }
  }
  // The planning rules the surveyor chose for the lots (ADR 0207): warnings to weigh, never a pass or a fail of the plan.
  if (doc.rules) {
    const set = ruleSetFrom(doc.rules);
    if (set) checkRules(set, input, add);
    else add({ code: "RULES_SOURCE_MISSING", severity: "information", message: "Your own minimums aren't checked until you say where they come from.", target: { kind: "sheet" }, action: "Name the Development Plan or other rule beside the minimums in the plan settings.", blocks: [] });
  }
  if (input.lots.pieces > 1) {
    add({ code: "LOTS_APART", severity: "warning", message: `The lots form ${input.lots.pieces} separate pieces of land.`, target: { kind: "lot" }, action: "If this plan really shows separate lands, describe each in the title; otherwise check the shared corners.", blocks: [] });
  }
  if (input.lots.outlineAreaM2 !== null && input.lots.overlaps.length === 0 && input.lots.holes === 0 && Math.abs(input.lots.outlineAreaM2 - input.lots.sumAreaM2) > 0.01) {
    add({ code: "ENTIRE_AREA_MISMATCH", severity: "error", message: "The lots' areas don't add up to the entire land's area.", target: { kind: "lot" }, detail: `Sum of lots ${input.lots.sumAreaM2.toFixed(3)} m², entire land ${input.lots.outlineAreaM2.toFixed(3)} m².`, action: "Check for a corner that lies on a neighbour's leg without being one of its corners.", blocks: ["export", "approval"] });
  }

  const pointAt = new Map(input.points.map((p) => [p.id, p]));
  for (const f of doc.features) {
    const missing = f.points.filter((id) => !known.has(id));
    if (missing.length > 0) {
      add({ code: "FEATURE_MISSING_POINTS", severity: "error", message: `A ${f.layer.toLowerCase()} feature uses points that no longer exist.`, target: { kind: "feature", id: f.id }, action: "Remove the feature or choose its points again.", blocks: ["export", "approval"] });
      continue;
    }
    // A curve whose points no longer make one (ADR 0247) is drawn as straight segments: said, never hidden.
    for (const run of f.arcs ?? []) {
      const fit = run.to < f.points.length && run.to - run.from >= 2 ? fitArc(f.points.slice(run.from, run.to + 1).map((id) => pointAt.get(id)!)) : ({ ok: false, problem: "its points aren't on the line any more" } as const);
      if (!fit.ok) {
        add({ code: "CURVE_DRAWN_STRAIGHT", severity: "warning", message: `A curve on the ${f.code ? `${f.code} line` : "line"} is drawn as straight segments: ${fit.problem}.`, target: { kind: "feature", id: f.id }, action: "Check the points it runs through, or draw the line again from the field codes.", blocks: [] });
      }
    }
  }
  for (const r of doc.roads) {
    if ([...r.edgeA, ...r.edgeB].some((id) => !known.has(id))) {
      add({ code: "ROAD_MISSING_POINTS", severity: "error", message: `The road ${r.name || "without a name"} uses points that no longer exist.`, target: { kind: "road", id: r.id }, action: "Choose its edge points again.", blocks: ["export", "approval"] });
    }
  }
  for (const a of doc.adjoining) {
    const lot = doc.lots.find((l) => l.id === a.lot);
    if (!lot || legIndex(lot, a.from, a.to) < 0) {
      add({ code: "ADJOINING_NO_LEG", severity: "error", message: `The label "${a.text.slice(0, 40)}" is beside a leg ${lot ? `lot ${lotName(lot)} no longer has` : "of a lot that's no longer on the plan"}, so it isn't drawn.`, target: { kind: "field", id: "adjoining" }, action: "Choose its lot and leg again on the Lots step, or remove it.", blocks: ["export", "approval"] });
    }
  }

  const s = doc.sheet;
  if (!s.planNumber.trim()) add({ code: "SHEET_MISSING_PLAN_NUMBER", severity: "warning", message: "The plan number is empty.", target: { kind: "field", id: "planNumber" }, action: "Fill in the plan number before approval.", blocks: ["approval"] });
  if (!s.surveyDate.trim()) add({ code: "SHEET_MISSING_SURVEY_DATE", severity: "warning", message: "The survey date is empty.", target: { kind: "field", id: "surveyDate" }, action: "Fill in the survey date before approval.", blocks: ["approval"] });
  const conventional: [keyof typeof s, string][] = [
    ["landName", "land name"],
    ["village", "village"],
    ["district", "district"],
    ["province", "province"],
  ];
  for (const [key, label] of conventional) {
    if (!String(s[key]).trim()) add({ code: `SHEET_EMPTY_${String(key).replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`, severity: "information", message: `The ${label} is empty.`, target: { kind: "field", id: key }, action: "Fill it in if this plan should show it. The sheet leaves a dotted blank.", blocks: [] });
  }
  const b = s.boundaries;
  if (!b.north.trim() || !b.east.trim() || !b.south.trim() || !b.west.trim()) {
    add({ code: "SHEET_BOUNDARY_DESCRIPTION", severity: "warning", message: "Some of the boundary descriptions (North, East, South, West) are empty.", target: { kind: "field", id: "boundaries" }, action: "Type what adjoins each side, as you found it, or let the draft read it from your description. Farbaek never makes these up.", blocks: [] });
  }
  if (!s.previousPlan.number.trim() && !s.previousPlans.trim() && s.operation !== "custom") {
    add({ code: "SHEET_PREVIOUS_PLANS", severity: "information", message: "No previous plan is cited.", target: { kind: "field", id: "previousPlan" }, action: "Cite the earlier plan, or note that there is none and how the boundaries were found (UDA regulation 9 asks for this in UDA areas).", blocks: [] });
  }
  if ((s.operation === "subdivision" || s.operation === "amalgamation") && !s.parentLots.trim()) {
    add({ code: "SHEET_PARENT_LOTS", severity: "warning", message: s.operation === "subdivision" ? "The lot being subdivided isn't named." : "The lots being amalgamated aren't named.", target: { kind: "field", id: "parentLots" }, action: "Name them as the earlier plan does, for the title sentence.", blocks: [] });
  }
  if (s.extractOf && !doc.lots.some((l) => l.id === s.extractOf)) {
    add({ code: "SHEET_EXTRACT_LOT", severity: "error", message: "The lot this extract shows no longer exists.", target: { kind: "field", id: "extractOf" }, action: "Choose the lot again, or turn the extract off.", blocks: ["export"] });
  }

  // The code library and the codes the plan uses.
  // A list put in place for the surveyor (the common list, or the Survey Department's on a swap) waits for their check. A swap records
  // the list as unchecked, so adding a code to it afterwards doesn't lift the check.
  const codesMark = doc.provenance["codes"];
  const listUnchecked = codesMark ? !codesMark.reviewed : codesAreCommonList(doc.codes) || codesAreDsrList(doc.codes);
  if (listUnchecked) {
    const dsr = codesAreDsrList(doc.codes) || doc.codes.some((c) => c.code === "MW" && /wall/i.test(c.meaning) && /mark/i.test(c.meaning));
    add({
      code: "LEGEND_UNREVIEWED",
      severity: "professional_review",
      message: dsr ? "The code library is the Survey Department's list, not yet checked for this plan." : codesAreCommonList(doc.codes) ? "The code library is still the common list, which isn't an official one." : "The code library hasn't been checked for this plan since its list was put in place.",
      target: { kind: "field", id: "codes" },
      action: dsr ? "Check the codes and meanings this plan uses (the station codes' meanings come from an unclear copy of the annex), then mark the list as checked." : "Check the codes and meanings this plan uses, then mark the list as checked.",
      blocks: ["approval"],
    });
  }
  const usedCodes = new Set<string>();
  for (const r of input.lots.lots) for (const v of r.parcel?.vertices ?? []) if (codeOf(v.code)) usedCodes.add(codeOf(v.code));
  const unknown = [...usedCodes].filter((c) => !lookupCode(doc.codes, c));
  if (unknown.length > 0) {
    add({ code: "MARK_CODE_NOT_IN_LEGEND", severity: "information", message: `Corner codes not in the code library: ${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? "…" : ""}.`, target: { kind: "field", id: "codes" }, action: "Add them to the code library so the Reference explains them.", blocks: [] });
  }

  // The code report (ADR 0243): every other code the points carry that the library doesn't know, and what reading the line words found.
  const grammar = GRAMMAR[doc.grammar ?? "farbaek"];
  const report = codeReport(input.points, doc.codes, grammar);
  // A line of one point the plan already draws there (by hand, or from another string) isn't missing.
  const lineProblems = report.problems.filter((p) => !(p.id && p.code && doc.features.some((f) => f.code === p.code && f.points.includes(p.id!))));
  // Road edges with a side (RD1, RD2) draw the road: they're never library codes, so they aren't strangers. One with no side (RD) is.
  const strangers = report.counts.filter((c) => c.kind === null && !usedCodes.has(c.code) && !sidedRoadEdge(c.code));
  if (strangers.length > 0) {
    const pts = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;
    add({
      code: "CODES_NOT_IN_LIBRARY",
      severity: "information",
      message: `${strangers.length === 1 ? "A code the points carry isn't" : `${strangers.length} codes the points carry aren't`} in the code library, so the plan can't say what ${strangers.length === 1 ? "it is" : "they are"} or draw ${strangers.length === 1 ? "it" : "them"} as a line or symbol: ${strangers.slice(0, 8).map((c) => `${c.code} (${pts(c.count)})`).join(", ")}${strangers.length > 8 ? ", and more" : ""}.`,
      target: { kind: "field", id: "codes" },
      action: "Add each to the code library with what it is: the plan editor's Codes tab suggests what each might be. Or correct the points' codes.",
      blocks: [],
    });
  }
  if (lineProblems.length > 0) {
    add({
      code: "CODE_LINES_TO_CHECK",
      severity: "information",
      message: `Reading the line words with ${grammar.name} found ${lineProblems.length === 1 ? "one thing" : `${lineProblems.length} things`} to check.`,
      target: { kind: "field", id: "codes" },
      detail: lineProblems.slice(0, 4).map((p) => p.message).join(" ") + (lineProblems.length > 4 ? ` And ${lineProblems.length - 4} more.` : ""),
      action: "Check the codes on those points, or choose how your crew writes line words on the Codes step.",
      blocks: [],
    });
  }

  // What the AI filled in, until the surveyor has looked at each item.
  const pending = unreviewed(doc);
  const open = pending.filter((k) => doc.provenance[k]?.source !== "auto");
  const drawn = pending.filter((k) => doc.provenance[k]?.source === "auto");
  if (open.length > 0) {
    add({ code: "AI_ITEMS_UNREVIEWED", severity: "professional_review", message: `${open.length} ${open.length === 1 ? "item" : "items"} filled in from your description or a photo ${open.length === 1 ? "hasn't" : "haven't"} been checked yet.`, target: { kind: "field", id: "review" }, detail: open.slice(0, 6).join(", ") + (open.length > 6 ? ", and more" : ""), action: "Mark each one as right, or change it: on the Lots step for lots, roads and adjoining lands, on the Plan step for the title and notes.", blocks: ["approval"] });
  }
  // What the automatic draft made is confirmed by the surveyor's approval of the sheet, unless tested code doubts an item (ADR 0235):
  // a lot that turns inward, a road whose edges aren't a steady width apart. Only those wait for a confirmation of their own.
  const context = doubtContext(out);
  const doubts = drawn.flatMap((k) => {
    const d = autoDoubt(doc, input.points, k, context);
    return d ? [d] : [];
  });
  if (doubts.length > 0) {
    add({ code: "AUTO_ITEMS_UNREVIEWED", severity: "professional_review", message: `${doubts.length} ${doubts.length === 1 ? "item" : "items"} drawn from the field data ${doubts.length === 1 ? "needs" : "need"} your confirmation.`, target: { kind: "field", id: "review" }, detail: doubts.slice(0, 4).join(" "), action: "Confirm each one if the drawing is right, or correct it on the Lots step. Everything else drawn from the field data is confirmed when you approve the plan.", blocks: ["approval"] });
  }

  if (!doc.surveyorUserId) {
    add({ code: "NO_SURVEYOR", severity: "professional_review", message: "No surveyor is responsible for this plan yet.", target: { kind: "field", id: "surveyor" }, action: "Choose the licensed surveyor responsible for the plan. They fill in their own details.", blocks: ["approval"] });
  } else if (!input.surveyorProfile) {
    add({ code: "SURVEYOR_NO_PROFILE", severity: "professional_review", message: "The chosen surveyor hasn't entered their details yet.", target: { kind: "field", id: "surveyor" }, action: "The surveyor enters their name, designation and registration under Surveyor details.", blocks: ["approval"] });
  }

  // The field sketches' readings, checked against the coordinates (ADR 0234). Only against a confirmed coordinate system.
  out.push(...sketchFindings(doc.sketch, points, input.crsConfirmed ? crs : null, new Set(doc.kept)));

  return out.sort((x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity));
}

/** Whether any finding stops the given operation. */
export function blocked(findings: readonly Finding[], op: "plan" | "export" | "approval"): Finding[] {
  return findings.filter((f) => f.blocks.includes(op));
}
