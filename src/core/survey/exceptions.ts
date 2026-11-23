/**
 * Only what needs the surveyor (stage 224, ADR 0235). The automatic draft's items are confirmed by the surveyor's approval of the
 * whole sheet, unless tested code finds a reason to doubt one: then it waits for a confirmation of its own. Everything the checks find
 * is sorted into what must be fixed, what needs the surveyor's confirmation before approval, and what is only for information, each
 * with what happened, what it holds back, the item it's about, the evidence and the next step.
 */
import { inwardCorners } from "./autodraft";
import { lookupCode } from "./codes";
import { itemLabel } from "./compare";
import { lotName, provenanceLive, unreviewed, type SurveyDocument } from "./document";
import type { SurveyPoint } from "./parcel";
import type { Finding } from "./qc";
import { roadWidth } from "./roads";
import { interpretDocument, sketchEvidence } from "./sketchintel/findings";

/** A road whose surveyed edges are further apart in one place than another by more than this may have an edge point on the wrong side. */
export const ROAD_WIDTH_DOUBT_M = 0.5;

/** The project's steps an exception can send the surveyor to. */
export type ExceptionStep = "import" | "points" | "draft" | "boundary" | "plan" | "settings";

const listed = (ids: readonly string[]) => (ids.length <= 6 ? ids.join(", ") : `${ids.slice(0, 5).join(", ")} and ${ids.length - 5} more`);

/** What an item a provenance key names is called, and the step that edits it. */
export function itemOf(doc: SurveyDocument, key: string): { label: string; step: "boundary" | "plan" } {
  const at = key.indexOf(":");
  const [kind, id] = at < 0 ? [key, ""] : [key.slice(0, at), key.slice(at + 1)];
  if (kind === "lot") {
    const lot = doc.lots.find((l) => l.id === id);
    return { label: `Lot ${lot ? lotName(lot) || "without a label" : ""}`.trim(), step: "boundary" };
  }
  if (kind === "road") {
    const name = doc.roads.find((r) => r.id === id)?.name;
    return { label: name ? `The road (${name})` : "The road", step: "boundary" };
  }
  if (kind === "adjoining") return { label: `Adjoining land: ${doc.adjoining.find((a) => a.id === id)?.text ?? ""}`, step: "boundary" };
  if (kind === "feature") {
    const f = doc.features.find((x) => x.id === id);
    const meaning = f ? lookupCode(doc.codes, f.code)?.meaning : undefined;
    // Read from the sketch's drawing (ADR 0249), or joined from the field codes.
    const how = id.startsWith("sk-") ? "read from the sketch" : "joined from the field codes";
    const what = meaning ? meaning.toLowerCase() : f && f.layer !== "BUILDINGS" ? LAYER_WORDS[f.layer] : "";
    return { label: what ? `A ${what} line ${how}` : `A line ${how}`, step: "boundary" };
  }
  if (kind === "symbol") {
    const s = (doc.symbols ?? []).find((x) => x.id === id);
    const meaning = s ? lookupCode(doc.codes, s.code)?.meaning : undefined;
    return { label: `${meaning ? `A ${meaning.toLowerCase()}` : "A symbol"} ${id.startsWith("sk-") ? "read from the sketch" : "on the plan"}`, step: "plan" };
  }
  if (key === "notes") return { label: "The notes", step: "plan" };
  if (key === "codes") return { label: "The code list", step: "plan" };
  if (key.startsWith("sheet.")) return { label: itemLabel(key) ?? "A title field", step: "plan" };
  return { label: key, step: "plan" };
}

/** A leg of a line joined from the codes longer than this many times the line's middle leg, and over 10 m, may join two lines. */
export const LINE_JUMP = { ratio: 3, minM: 10 } as const;

/** What the checks found that bears on a drawn item: a stated extent that differs from the land the points make. */
export interface DoubtContext {
  extentDiffers?: boolean;
}

/** What the checks found that bears on the doubts, read from their findings. */
export const doubtContext = (findings: readonly Finding[]): DoubtContext => ({ extentDiffers: findings.some((f) => f.code === "STATED_EXTENT_DIFFERS") });

/**
 * Why an item the automatic draft made can't simply be confirmed by approving the plan, or null when nothing casts doubt on it. Worked
 * out from the current points every time, so it never goes stale:
 * - a lot that turns inward: each such corner is a corner of the land or a mark inside it, which only the surveyor can say;
 * - the plan's only lot, drawn, when the stated extent differs from it: a mark outside the land may have been taken as a corner;
 * - a road whose edges aren't a steady distance apart: an edge point may be coded to the wrong side;
 * - a line joined from the codes with one leg far longer than the rest: two lines under one code may have been joined.
 * A survey date the file states carries no doubt.
 */
export function autoDoubt(doc: SurveyDocument, points: readonly SurveyPoint[], key: string, context: DoubtContext = {}): string | null {
  if (doc.provenance[key]?.source !== "auto" || !provenanceLive(doc, key)) return null;
  const byId = new Map(points.map((p) => [p.id, p] as const));
  const at = (ids: readonly string[]) => ids.map((id) => byId.get(id)).filter((p): p is SurveyPoint => p !== undefined);
  if (key.startsWith("lot:")) {
    const lot = doc.lots.find((l) => `lot:${l.id}` === key);
    if (!lot) return null;
    const ring = at(lot.points);
    // A corner missing from the points is already an error of its own.
    if (ring.length !== lot.points.length) return null;
    const name = `Lot ${lotName(lot) || "without a label"}`;
    const inward = inwardCorners(ring);
    if (inward.length > 0) return `${name} turns inward at ${inward.length === 1 ? "point" : "points"} ${listed(inward)}: ${inward.length === 1 ? "a corner of the land, or a mark inside it?" : "corners of the land, or marks inside it?"}`;
    if (context.extentDiffers && doc.lots.length === 1) return `${name}'s area differs from the stated extent: check every boundary mark it runs through is a corner of this land.`;
    return null;
  }
  if (key.startsWith("feature:")) {
    const f = doc.features.find((x) => `feature:${x.id}` === key);
    if (!f) return null;
    const line = at(f.points);
    if (line.length !== f.points.length || line.length < 4) return null;
    const legs = line.slice(1).map((p, i) => Math.hypot(p.e - line[i]!.e, p.n - line[i]!.n));
    const middle = [...legs].sort((a, b) => a - b)[Math.floor(legs.length / 2)]!;
    const longest = legs.reduce((best, d, i) => (d > legs[best]! ? i : best), 0);
    const jump = legs[longest]!;
    if (jump <= LINE_JUMP.minM || jump <= LINE_JUMP.ratio * middle) return null;
    const meaning = lookupCode(doc.codes, f.code)?.meaning?.toLowerCase() ?? f.code;
    return `The ${meaning} line jumps ${jump.toFixed(1)} m from point ${line[longest]!.pointId} to point ${line[longest + 1]!.pointId}: one line, or two under the same code?`;
  }
  if (key.startsWith("road:")) {
    const road = doc.roads.find((r) => `road:${r.id}` === key);
    if (!road) return null;
    const [a, b] = [at(road.edgeA), at(road.edgeB)];
    if (a.length !== road.edgeA.length || b.length !== road.edgeB.length) return null;
    const w = roadWidth(a, b);
    if (!w) return "The road's two surveyed edges don't run alongside each other: check the road-edge codes.";
    if (w.maxM - w.minM > ROAD_WIDTH_DOUBT_M) return `The road is ${w.minM.toFixed(2)} to ${w.maxM.toFixed(2)} m wide between its surveyed edges: check each edge point is coded to the right side.`;
    return null;
  }
  return null;
}

/** The items the automatic draft made that are still waiting and carry no doubt: what approving the plan confirms, in a list. */
export function drawnWithoutDoubt(doc: SurveyDocument, points: readonly SurveyPoint[], findings: readonly Finding[] = []): string[] {
  const context = doubtContext(findings);
  const keys = unreviewed(doc).filter((k) => doc.provenance[k]?.source === "auto" && autoDoubt(doc, points, k, context) === null);
  const lines = keys.filter((k) => k.startsWith("feature:")).length;
  return [
    ...keys.filter((k) => !k.startsWith("feature:")).map((k) => (k === "sheet.surveyDate" ? "the survey date" : itemOf(doc, k).label.replace(/^The /, "the "))),
    ...(lines > 0 ? [`${lines} ${lines === 1 ? "line" : "lines"} joined from the field codes`] : []),
  ];
}

export type ExceptionGroup = "fix" | "confirm" | "note";

export interface SurveyException {
  /** Stable within a version, for keys and links. */
  id: string;
  code: string;
  group: ExceptionGroup;
  severity: Finding["severity"];
  /** What happened. */
  title: string;
  /** What it holds back, or null when it holds nothing. */
  holds: string | null;
  /** The item it's about, when there is one. */
  item: string | null;
  /** What was found, in figures or source, when there is anything to show. */
  evidence: string | null;
  /** What to do next. */
  next: string;
  /** Where it's corrected. */
  step: ExceptionStep | null;
  /** A provenance key confirmed with one press (an item drawn or filled in for the surveyor, or the code list). */
  confirm: string | null;
  /** A near miss or sketch difference the surveyor can keep as surveyed. */
  keep: { key: string; kept: boolean } | null;
}

const BLOCK_WORDS: Record<Finding["blocks"][number], string> = { plan: "the plan", export: "export", approval: "approval" };
const holdsText = (blocks: Finding["blocks"]) => (blocks.length > 0 ? `Holds ${blocks.map((b) => BLOCK_WORDS[b]).join(" and ")} until it's resolved.` : null);

function stepFor(f: Finding): ExceptionStep | null {
  if (f.code.startsWith("CRS_") || f.code === "AXES_LOOK_SWAPPED") return "settings";
  if (f.code === "NO_POINTS") return "import";
  // A sketch's reading is seen beside its photo on the Draft step (ADR 0240).
  if (f.code.startsWith("SKETCH_")) return "draft";
  if (f.target.kind === "point" || f.code.startsWith("POINTS_")) return "points";
  if (f.target.kind === "lot" || f.target.kind === "boundary" || f.target.kind === "leg" || f.target.kind === "feature" || f.target.kind === "road") return "boundary";
  if (f.target.kind === "field" || f.target.kind === "sheet") return "plan";
  return null;
}

const groupOf = (f: Finding): ExceptionGroup => (f.blocks.includes("export") || f.blocks.includes("plan") || f.severity === "error" ? "fix" : f.blocks.includes("approval") ? "confirm" : "note");

const SOURCE_WORDS: Record<string, string> = { ai_brief: "from your description", ai_photo: "from a photo", ai_assist: "by the assistant" };

/** What a line on a layer is, in words, when its code doesn't say. */
const LAYER_WORDS: Record<string, string> = { WALLS: "wall", FENCES: "fence", DRAINS: "drain", ROADS: "road edge", UTILITIES: "utility" };

/**
 * The checks' findings as the surveyor's list: the two "items to check" findings are opened up into one entry per item that needs a
 * confirmation, each with its own Confirm; the rest keep their words and gain what they hold back and where they're corrected.
 */
export function exceptionsFor(doc: SurveyDocument, points: readonly SurveyPoint[], findings: readonly Finding[]): Record<ExceptionGroup, SurveyException[]> {
  const out: Record<ExceptionGroup, SurveyException[]> = { fix: [], confirm: [], note: [] };
  const pending = unreviewed(doc);
  const context = doubtContext(findings);
  for (const [n, f] of findings.entries()) {
    if (f.code === "AI_ITEMS_UNREVIEWED") {
      // Items read from the sketch's drawing show the evidence they rest on (ADR 0249): the lines, the matches, the coordinates' fit.
      const sketch = interpretDocument(doc, points);
      for (const key of pending.filter((k) => doc.provenance[k]?.source !== "auto")) {
        const it = itemOf(doc, key);
        const ev = sketchEvidence(sketch, key);
        // What the sketch shows for it, then any open question confirming it answers.
        const shown = ev ? [...ev.evidence, ...(ev.questions.length > 0 ? ["Open:", ...ev.questions] : [])].join(" ") : "";
        out.confirm.push({
          id: `confirm:${key}`,
          code: f.code,
          group: "confirm",
          severity: f.severity,
          title: ev ? `${it.label}, not confirmed yet.` : `${it.label}: filled in ${SOURCE_WORDS[doc.provenance[key]!.source] ?? "for you"}, not confirmed yet.`,
          holds: holdsText(f.blocks),
          // The title already names it.
          item: null,
          evidence: ev ? `${ev.level === "strong" ? "The sketch and the survey agree" : "Check this one"}: ${shown}` : null,
          // A symbol has no editor of its own: its card removes it.
          next: key.startsWith("symbol:") ? "Confirm it if it's right, or remove it." : `Confirm it if it's right, or correct it on the ${it.step === "boundary" ? "Lots" : "Plan"} step.`,
          step: it.step,
          confirm: key,
          keep: null,
        });
      }
      continue;
    }
    if (f.code === "AUTO_ITEMS_UNREVIEWED") {
      for (const key of pending) {
        const doubt = autoDoubt(doc, points, key, context);
        if (!doubt) continue;
        const it = itemOf(doc, key);
        out.confirm.push({
          id: `confirm:${key}`,
          code: f.code,
          group: "confirm",
          severity: f.severity,
          title: doubt,
          holds: holdsText(f.blocks),
          // The title already names it.
          item: null,
          evidence: "Drawn from the field data by Farbaek's automatic draft.",
          next: `Confirm it if the drawing is right, or correct it on the ${it.step === "boundary" ? "Lots" : "Plan"} step.`,
          step: it.step,
          confirm: key,
          keep: null,
        });
      }
      continue;
    }
    const group = groupOf(f);
    out[group].push({
      // The finding number keeps two findings of one code on one item apart.
      id: `${f.code}:${f.target.id ?? ""}:${n}`,
      code: f.code,
      group,
      severity: f.severity,
      title: f.message,
      holds: holdsText(f.blocks),
      item: null,
      evidence: f.detail ?? null,
      next: f.action,
      step: stepFor(f),
      confirm: f.code === "LEGEND_UNREVIEWED" ? "codes" : null,
      keep: f.keep ?? null,
    });
  }
  return out;
}

export type PlanStatus = "not_drawn" | "needs_correction" | "needs_confirmation" | "ready" | "approved" | "exported";

/** Where the plan stands, in one word for its header: from what's drawn, what the checks hold back, the approval and the exports. */
export function planStatus(input: { drawn: boolean; findings: readonly Finding[]; approved: boolean; exported: boolean }): PlanStatus {
  if (input.approved) return input.exported ? "exported" : "approved";
  if (!input.drawn) return "not_drawn";
  if (input.findings.some((f) => groupOf(f) === "fix")) return "needs_correction";
  if (input.findings.some((f) => f.blocks.includes("approval"))) return "needs_confirmation";
  return "ready";
}
