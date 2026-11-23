/**
 * Comparing what Farbaek drew from a job's data and sketch with the plan a surveyor drew from the same job (stage 241, ADR 0249): a
 * repeatable check for any job, never tuned to one. The reference names its lot, lines and symbols by point number, as read from the
 * surveyor's plan; nothing from it ever goes into the generation, only into this comparison.
 */
import type { SurveyDocument } from "../document";
import { area, pointSegmentDistance } from "../geometry";
import type { SurveyPoint } from "../parcel";

export interface PlanReference {
  /** The lot's corners in order round it, by point number. */
  lot: string[];
  /** Lines the reference plan draws, each a run of point numbers, with what it is ("wall", "road edge", "internal"). */
  lines: { what: string; points: string[] }[];
  /** Symbols the reference plan draws at points. */
  symbols: { what: string; at: string }[];
  /** The extent the reference plan states, m², when it states one. */
  statedM2: number | null;
}

export interface Evaluation {
  lot: {
    reference: string[];
    generated: string[];
    same: boolean;
    missing: string[];
    extra: string[];
    /** For each of the reference's corners Farbaek didn't take as one, how far it lies off Farbaek's outline, m. */
    missingOff: { point: string; offM: number }[];
    referenceM2: number | null;
    generatedM2: number | null;
    statedM2: number | null;
  };
  /**
   * Each reference line, and how much of it was drawn: "yes" when lines drawn join all of it, "partly" when some of its legs are drawn,
   * "no" otherwise. `by` names the lines drawn along it, `passed` its points a drawn line runs past without a stop (the sketch doesn't
   * number them), `notDrawn` its legs no line draws.
   */
  lines: { what: string; points: string[]; found: "yes" | "partly" | "no"; by: string[]; passed: string[]; notDrawn: string[][] }[];
  /** Lines Farbaek drew that the reference doesn't have. */
  extra: { id: string; points: string[] }[];
  symbols: { what: string; at: string; found: boolean }[];
  /** Symbols Farbaek drew that the reference doesn't have. */
  extraSymbols: string[];
  /** Lines found of the reference's, symbols found, the lot the same: as counts, never a blended score. */
  score: { lines: string; symbols: string; lot: string };
}

/**
 * How much of a reference line the drawn lines cover. From each of its points, the furthest point further along it that one drawn line
 * also runs to, without that line touching the reference line's other points on the way.
 */
function cover(ref: readonly string[], features: readonly { id: string; points: string[] }[]) {
  const by = new Set<string>();
  const passed: string[] = [];
  const notDrawn: string[][] = [];
  // A drawn line runs from the reference's point i to its point j when it holds both (two different places on it), and the reference
  // points it passes on the way come in the reference's own order: never back over a leg, never round a ring the other way.
  const reaches = (f: { points: string[] }, i: number, j: number) => {
    const [x, y] = [f.points.indexOf(ref[i]!), f.points.indexOf(ref[j]!)];
    if (x < 0 || y < 0 || x === y) return false;
    const run = x < y ? f.points.slice(x, y + 1) : f.points.slice(y, x + 1).reverse();
    const at = run.map((p, n) => (n === 0 ? i : n === run.length - 1 ? j : ref.indexOf(p))).filter((k) => k >= 0);
    // A reference point in between that the line visits elsewhere, out of order, isn't passed by: the stretch isn't drawn.
    const between = ref.slice(i + 1, j);
    return at.every((k, n) => n === 0 || k > at[n - 1]!) && between.every((p) => !f.points.includes(p) || run.includes(p));
  };
  for (let i = 0; i < ref.length - 1; ) {
    let hit: { j: number; f: { id: string; points: string[] } } | null = null;
    for (let j = ref.length - 1; j > i && !hit; j--) {
      const f = features.find((x) => reaches(x, i, j));
      if (f) hit = { j, f };
    }
    if (!hit) {
      notDrawn.push([ref[i]!, ref[i + 1]!]);
      i++;
      continue;
    }
    by.add(hit.f.id);
    passed.push(...ref.slice(i + 1, hit.j).filter((p) => !hit.f.points.includes(p)));
    i = hit.j;
  }
  return { by: [...by], passed, notDrawn, found: notDrawn.length === 0 ? ("yes" as const) : by.size > 0 ? ("partly" as const) : ("no" as const) };
}

/** Whether `inner` appears in `outer` in order (or reversed), points in between allowed. */
const follows = (outer: readonly string[], inner: readonly string[]) => {
  const fwd = (o: readonly string[]) => {
    let k = 0;
    for (const x of o) if (x === inner[k]) k++;
    return k === inner.length;
  };
  return fwd(outer) || fwd([...outer].reverse());
};

/** The same ring of corners, from any start, either way round. */
export const sameRing = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length || a.length === 0) return false;
  // Bounded on both sides, so "1" never matches inside "101".
  const twice = `|${[...a, ...a].join("|")}|`;
  return twice.includes(`|${b.join("|")}|`) || twice.includes(`|${[...b].reverse().join("|")}|`);
};

export function evaluatePlan(doc: SurveyDocument, points: readonly SurveyPoint[], reference: PlanReference): Evaluation {
  const byId = new Map(points.map((p) => [p.id, p]));
  const byNumber = new Map(points.map((p) => [p.pointId, p]));
  const numbers = (ids: readonly string[]) => ids.map((id) => byId.get(id)?.pointId ?? "?");
  const ringArea = (nums: readonly string[]) => {
    const ring = nums.map((n) => byNumber.get(n));
    return ring.every((p): p is SurveyPoint => Boolean(p)) && ring.length >= 3 ? area(ring) : null;
  };
  const generatedLot = doc.lots[0] ? numbers(doc.lots[0].points) : [];
  const features = doc.features.map((f) => ({ id: f.id, points: numbers(f.points) }));
  const lines = reference.lines.map((r) => ({ what: r.what, points: r.points, ...cover(r.points, features) }));
  // A line is extra unless it draws a reference line, lies within one, or runs along the reference lot's sides.
  const lotPairs = new Set(reference.lot.map((p, i) => [p, reference.lot[(i + 1) % reference.lot.length]!].sort().join("|")));
  const alongLot = (pts: readonly string[]) => pts.length >= 2 && pts.slice(1).every((p, i) => lotPairs.has([pts[i]!, p].sort().join("|")));
  const extra = features.filter((f) => !(lines.some((l) => l.by.includes(f.id)) || reference.lines.some((r) => follows(r.points, f.points)) || alongLot(f.points)));
  const drawnSymbols = (doc.symbols ?? []).map((s) => byId.get(s.point)?.pointId ?? "?");
  const symbols = reference.symbols.map((s) => ({ ...s, found: drawnSymbols.includes(s.at) }));
  const same = sameRing(generatedLot, reference.lot);
  const outline = generatedLot.map((n) => byNumber.get(n)).filter((p): p is SurveyPoint => Boolean(p));
  const missing = reference.lot.filter((p) => !generatedLot.includes(p));
  const missingOff = missing.flatMap((n) => {
    const p = byNumber.get(n);
    return p && outline.length >= 3 ? [{ point: n, offM: Math.min(...outline.map((c, i) => pointSegmentDistance(p, c, outline[(i + 1) % outline.length]!))) }] : [];
  });
  const found = (k: string) => lines.filter((l) => l.found === k).length;
  return {
    lot: {
      reference: reference.lot,
      generated: generatedLot,
      same,
      missing,
      extra: generatedLot.filter((p) => !reference.lot.includes(p)),
      missingOff,
      referenceM2: ringArea(reference.lot),
      generatedM2: ringArea(generatedLot),
      statedM2: reference.statedM2,
    },
    lines,
    extra,
    symbols,
    extraSymbols: drawnSymbols.filter((n) => !reference.symbols.some((s) => s.at === n)),
    score: {
      lines: `${found("yes")} of ${lines.length} reference lines drawn in full, ${found("partly")} in part, ${extra.length} extra`,
      symbols: `${symbols.filter((s) => s.found).length} of ${symbols.length} symbols found`,
      lot: same ? "the same corners" : `different: missing ${reference.lot.filter((p) => !generatedLot.includes(p)).join(", ") || "none"}, extra ${generatedLot.filter((p) => !reference.lot.includes(p)).join(", ") || "none"}`,
    },
  };
}
