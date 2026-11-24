/**
 * An independent check of the plan against the sketch (stage 263, ADR 0271). After the sketch is read and its drawing put on the plan,
 * the photos go to a model once more with a different task: not to read the sketch, but to say, for each line, outline and lot the plan
 * now draws (by its point numbers), whether the sketch draws it so, and which lines the sketch draws that the plan doesn't. Asking about
 * a given line is a narrower question than reading a whole sketch, and catches what the reads agreed on wrongly.
 *
 * The check never changes the plan. Its verdicts are kept with the sketch's record (written only by reading, never from the browser),
 * against the numbers that were checked: a line changed since then has no verdict. A doubt is a warning beside the item, which the
 * surveyor answers by confirming or correcting the item, as for anything the sketch drew; a line the check found missing is a warning
 * until the plan draws it. Point numbers are text, matched as the sketch's are; the check has no place for a position or a length.
 */
import { z } from "zod";
import type { SurveyDocument } from "../document";
import { lotName } from "../document";
import type { SurveyPoint } from "../parcel";
import type { Finding } from "../qc";
import { CHECK_LIMITS, type SketchCheck } from "./check-record";

export { CHECK_LIMITS, sketchCheckSchema, type SketchCheck } from "./check-record";

/** One thing the plan draws, as the check is asked about it. */
export interface CheckItem {
  /** What it is on the plan: feature:…, lot:…, or road:…#a and road:…#b for a road's two edges. */
  key: string;
  kind: "line" | "outline" | "lot";
  /** Point numbers in order; "corner" where a line turns a square corner that wasn't surveyed (ADR 0270). */
  points: string[];
  label: string;
}

/** What the plan draws, by point numbers, for the check: its lots, then its lines and outlines. Items missing a point are left out. */
export function checkItems(doc: SurveyDocument, points: readonly SurveyPoint[]): CheckItem[] {
  const num = new Map(points.map((p) => [p.id, p.pointId]));
  const corners = new Set((doc.constructed ?? []).map((c) => c.id));
  const numbers = (ids: readonly string[]) => {
    const out = ids.map((id) => (corners.has(id) ? "corner" : num.get(id)));
    return out.every((x): x is string => typeof x === "string") ? out : null;
  };
  const items: CheckItem[] = [];
  for (const l of doc.lots) {
    const ns = numbers(l.points);
    if (ns && ns.length >= 3) items.push({ key: `lot:${l.id}`, kind: "lot", points: ns, label: lotName(l) ? `Lot ${lotName(l)}` : "" });
  }
  for (const f of doc.features) {
    const ns = numbers(f.points);
    if (ns && ns.length >= 2) items.push({ key: `feature:${f.id}`, kind: f.closed ? "outline" : "line", points: ns, label: f.code.trim() });
  }
  // A road's two edges: lines the sketch draws, which would otherwise come back as missing.
  for (const r of doc.roads)
    for (const [side, edge] of [["a", r.edgeA], ["b", r.edgeB]] as const) {
      const ns = numbers(edge);
      if (ns && ns.length >= 2) items.push({ key: `road:${r.id}#${side}`, kind: "line", points: ns, label: r.name.trim() });
    }
  return items.slice(0, CHECK_LIMITS.items);
}

/** The check's answer, as the model gives it. */
export const SketchCheckOutput = z.object({
  items: z
    .array(
      z.object({
        item: z.number().describe("The item's number in the plan's list"),
        verdict: z.enum(["drawn", "not_drawn", "unsure"]).describe("drawn: the sketch draws this line through these numbers, every leg; not_drawn: it doesn't join them so; unsure: the photo can't tell"),
        note: z.string().describe("For not_drawn or unsure: which leg, by point numbers, and what the sketch draws instead. Empty for drawn."),
      }),
    )
    .describe("A verdict for every item in the plan's list"),
  missing: z
    .array(
      z.object({
        image: z.number().describe("Which photo, counting from 0"),
        points: z.array(z.string()).describe("The point numbers written along the line, in order, as written"),
        label: z.string().describe("Writing along it, as written, or empty"),
      }),
    )
    .describe("Lines the sketch clearly draws between numbered points that no item in the plan's list covers"),
});
export type SketchCheckAnswer = z.infer<typeof SketchCheckOutput>;

/**
 * The model's answer made safe to keep: a verdict for an item that wasn't asked about, or a second one for the same item, is dropped; a
 * missing line on a photo that wasn't sent, with fewer than two numbers, or with invisible characters, is dropped. Notes and labels are
 * trimmed and cut to their limits. Nothing else is taken from it.
 */
export function acceptCheck(answer: SketchCheckAnswer, items: readonly CheckItem[], files: readonly string[], model: string, at: Date, clean: (s: string, max: number) => string, invisible: (s: string) => boolean): SketchCheck {
  const seen = new Set<number>();
  const verdicts: SketchCheck["items"] = [];
  for (const v of answer.items) {
    if (!Number.isInteger(v.item) || v.item < 0 || v.item >= items.length || seen.has(v.item)) continue;
    seen.add(v.item);
    const it = items[v.item]!;
    const folded = clean(v.note, CHECK_LIMITS.note);
    const note = v.verdict === "drawn" || invisible(folded) ? "" : folded;
    verdicts.push({ key: it.key, points: it.points, verdict: v.verdict, note });
  }
  const missing: SketchCheck["missing"] = [];
  for (const m of answer.missing) {
    if (missing.length >= CHECK_LIMITS.missing || !Number.isInteger(m.image) || m.image < 0 || m.image >= files.length) continue;
    const ps = m.points.map((p) => clean(p, 32)).filter(Boolean);
    const label = clean(m.label, 120);
    if (ps.some(invisible) || invisible(label)) continue;
    if (ps.length < 2 || ps.length > 60) continue;
    missing.push({ file: files[m.image]!, points: ps, label });
  }
  return { model: clean(model, 80), at: at.toISOString(), items: verdicts, missing };
}

/** Whether a line through these numbers, in order, is on the plan: as one of its items' runs of consecutive numbers, either way round. */
function onPlan(numbers: readonly string[], items: readonly CheckItem[]): boolean {
  const legs = (ps: readonly string[], closed: boolean) => {
    const out = new Set<string>();
    const real = ps.filter((p) => p !== "corner");
    for (let i = 0; i + 1 < real.length; i++) out.add([real[i], real[i + 1]].sort().join("|"));
    if (closed && real.length > 2) out.add([real.at(-1), real[0]].sort().join("|"));
    return out;
  };
  const have = new Set(items.flatMap((it) => [...legs(it.points, it.kind !== "line")]));
  return [...legs(numbers, false)].every((k) => have.has(k));
}

/**
 * The check's findings, from what the plan draws now: a doubt beside each item it doubted whose numbers haven't changed since and that
 * the surveyor hasn't confirmed; each line it found missing that the plan still doesn't draw; and one line saying the check was made.
 * None holds anything back: a doubted item drawn from the sketch already waits for the surveyor's confirmation.
 */
export function sketchCheckFindings(doc: SurveyDocument, points: readonly SurveyPoint[]): Finding[] {
  const check = (doc.sketch as { check?: SketchCheck } | null)?.check;
  if (!check) return [];
  const items = checkItems(doc, points);
  const now = new Map(items.map((i) => [i.key, i]));
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const out: Finding[] = [];
  const live = check.items.filter((v) => {
    const it = now.get(v.key);
    return it !== undefined && same(it.points, v.points);
  });
  const named = (v: SketchCheck["items"][number]) => {
    const it = now.get(v.key)!;
    const what = it.key.startsWith("road:") ? (it.label ? `The road ${it.label}'s edge` : "A road's edge") : it.kind === "lot" ? it.label || "The lot" : it.label ? `The ${it.label} ${it.kind}` : `The ${it.kind}`;
    return `${what} through ${v.points.join(", ")}`;
  };
  const target = (key: string): Finding["target"] => (key.startsWith("lot:") ? { kind: "lot", id: key.slice(4) } : key.startsWith("road:") ? { kind: "road", id: key.slice(5).replace(/#[ab]$/, "") } : { kind: "feature", id: key.slice(8) });
  // Each doubt is answered by looking: keeping the plan as drawn, or correcting the item (which takes the doubt with it, its numbers
  // having changed). Whoever drew the item, a doubt about it holds approval until then, as a sketch's differing measurement does.
  // Its key is its place in the check, which a new check replaces with its own answers.
  const kept = new Set(doc.kept);
  check.items.forEach((v, i) => {
    if (v.verdict === "drawn" || !live.includes(v)) return;
    const key = `check:i${i}`;
    const said = `${named(v)}: an independent check of the sketch ${v.verdict === "not_drawn" ? "doesn't find it drawn so" : "couldn't tell from the photo"}.`;
    if (kept.has(key)) out.push({ code: "SKETCH_CHECK_KEPT", severity: "information", message: `Kept as drawn: ${said}`, target: target(v.key), action: "Nothing to do, unless you want to look again.", blocks: [], keep: { key, kept: true } });
    else
      out.push({
        code: "SKETCH_CHECK_DOUBT",
        severity: "professional_review",
        message: said,
        target: target(v.key),
        ...(v.note ? { detail: `The check says: ${v.note}` } : {}),
        action: "Look at the sketch beside the plan. If the plan is right, keep it as drawn; if not, correct the item.",
        blocks: ["approval"],
        keep: { key, kept: false },
      });
  });
  // A line the check found that the plan doesn't draw, between surveyed points only (a number that isn't surveyed can't be drawn).
  const surveyed = new Set(points.map((p) => p.pointId));
  check.missing.forEach((m, i) => {
    if (onPlan(m.points, items) || !m.points.every((p) => p === "corner" || surveyed.has(p))) return;
    const key = `check:m${i}`;
    const said = `An independent check of the sketch found a line the plan doesn't draw: ${m.points.join(" to ")}${m.label ? ` (${m.label})` : ""}.`;
    if (kept.has(key)) out.push({ code: "SKETCH_CHECK_KEPT", severity: "information", message: `Kept as drawn: ${said}`, target: { kind: "project" }, action: "Nothing to do, unless you want to look again.", blocks: [], keep: { key, kept: true } });
    else
      out.push({
        code: "SKETCH_CHECK_MISSING",
        severity: "professional_review",
        message: said,
        target: { kind: "project" },
        detail: `On ${m.file}.`,
        action: "Draw it on the Plan step if the sketch shows it, from its surveyed points; if it isn't a line of the plan, keep the plan as drawn.",
        blocks: ["approval"],
        keep: { key, kept: false },
      });
  });
  const confirmed = live.filter((v) => v.verdict === "drawn").length;
  out.push({
    code: "SKETCH_CHECKED",
    severity: "information",
    message: `The plan was checked against the sketch: ${confirmed} of ${live.length} ${live.length === 1 ? "item" : "items"} the check was asked about ${confirmed === 1 ? "is" : "are"} drawn so there.`,
    target: { kind: "project" },
    detail: `Checked with ${check.model} at ${check.at}. Items changed since aren't counted.`,
    action: "Nothing to do for the items it found.",
    blocks: [],
  });
  return out;
}
