/**
 * Label placement (stage 233, ADR 0242): every movable label offers its candidate positions in order of preference, and the sheet's
 * labels are placed together rather than first come, first served.
 *
 * - **First pass:** the sheet is drawn as before. Each label takes the first candidate that covers nothing drawn or placed so far
 *   (`Placer.choose`), and its candidates are recorded.
 * - **Solve:** every candidate is scored. Its rank in the label's own order counts for up to 1. Crossing a line counts 6, covering a
 *   point, a symbol or a fixed label 15, covering another movable label 30 (two labels on each other can't be read; a label over a
 *   line still can), and leaving the drawing's bounds 40. Starting from the first pass, a label in conflict moves to its cheapest
 *   candidate, then labels that still meet are tried in pairs, until nothing improves. Only a lower total is ever accepted, so the
 *   result is never worse than the first pass by that measure.
 * - **Second pass:** the sheet is drawn again with each label at its solved candidate.
 *
 * Geometry never moves (survey skill, rule 7): only text does, among positions its own drawing code offered. A label the surveyor
 * moved by hand keeps the place the first pass gave it. Whatever still overlaps is reported by `overlappingLabels`.
 */

export type Quad = [number, number][];

/** What a candidate costs, beyond its rank among its label's own candidates (0 to 1). */
export const LABEL_COST = { label: 30, thing: 15, line: 6, outside: 40 } as const;
/** How many rounds the search runs at most: a sheet settles in two or three. */
const MAX_ROUNDS = 12;
/** How many of each label's cheapest candidates a pair of labels tries together. */
const PAIR_CANDIDATES = 12;

/** Separating axis test for two convex shapes (a segment counts as a two-corner shape). */
export function quadsOverlap(a: Quad, b: Quad): boolean {
  for (const q of [a, b]) {
    for (let i = 0; i < q.length; i++) {
      const [x1, y1] = q[i]!;
      const [x2, y2] = q[(i + 1) % q.length]!;
      const ax = -(y2 - y1);
      const ay = x2 - x1;
      if (ax === 0 && ay === 0) continue;
      const pa = a.map(([x, y]) => x * ax + y * ay);
      const pb = b.map(([x, y]) => x * ax + y * ay);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  // Two segments (or a segment and a box) can pass every edge-normal test yet be apart along the segment's own direction.
  for (const q of [a, b]) {
    if (q.length !== 2) continue;
    const [[x1, y1], [x2, y2]] = q as [[number, number], [number, number]];
    const ax = x2 - x1;
    const ay = y2 - y1;
    const pa = a.map(([x, y]) => x * ax + y * ay);
    const pb = b.map(([x, y]) => x * ax + y * ay);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}

/** A label's candidates, as its drawing code offered them: each candidate is one or more shapes (a block, or the lines of a text). */
export interface LabelRequest {
  key: string;
  candidates: Quad[][];
  admissible: boolean[];
  /** The candidate the first pass chose. */
  chosen: number;
  /** Kept where the first pass put it: moved by hand, or with only one place to go. */
  pinned: boolean;
}

/** One label's solved candidate, matched to its request by order and key. */
export interface PlanEntry {
  key: string;
  index: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const boxOf = (q: Quad): Box => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of q) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
};
const meet = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** Shapes filed by the 8 mm squares of the page they cover, so a check looks only at what's near. */
class Grid<T> {
  private readonly cells = new Map<number, T[]>();
  private static readonly SIZE = 8;
  private keys(b: Box): number[] {
    const s = Grid.SIZE;
    const out: number[] = [];
    for (let cx = Math.floor(b.x0 / s); cx <= Math.floor(b.x1 / s); cx++) for (let cy = Math.floor(b.y0 / s); cy <= Math.floor(b.y1 / s); cy++) out.push(cx * 1_000_003 + cy);
    return out;
  }
  insert(b: Box, v: T): void {
    for (const k of this.keys(b)) {
      const c = this.cells.get(k);
      if (c) c.push(v);
      else this.cells.set(k, [v]);
    }
  }
  /** Each value filed near the box, once. */
  near(b: Box): T[] {
    const seen = new Set<T>();
    for (const k of this.keys(b)) for (const v of this.cells.get(k) ?? []) seen.add(v);
    return [...seen];
  }
}

interface Shape {
  q: Quad;
  b: Box;
}

/** Everything already on the page that a label must not cover, and the labels placed so far. */
export class Placer {
  private readonly obstacles: Quad[] = [];
  private readonly filed = new Grid<Shape>();
  readonly requests: LabelRequest[] = [];

  constructor(
    private readonly plan: readonly PlanEntry[] | null = null,
    readonly bounds: [number, number, number, number] | null = null,
  ) {}

  /** Something fixed on the page: a symbol, a fixed label, a reserved area. */
  add(q: Quad): void {
    this.obstacles.push(q);
    this.filed.insert(boxOf(q), { q, b: boxOf(q) });
  }

  /** A line drawn on the page. */
  segment(a: [number, number], b: [number, number]): void {
    this.add([a, b]);
  }

  /** Whether a shape covers nothing drawn or placed so far. */
  free(q: Quad): boolean {
    const b = boxOf(q);
    return !this.filed.near(b).some((o) => meet(b, o.b) && quadsOverlap(q, o.q));
  }

  /** The fixed shapes, for the solver. */
  get fixed(): readonly Quad[] {
    return this.obstacles;
  }

  /**
   * Which of a label's candidates to draw. On the second pass, the solved one. On the first, the first admissible candidate that
   * covers nothing; when none is free, `fallback`, or else the first admissible one.
   */
  choose(key: string, candidates: Quad[][], opts: { admissible?: readonly boolean[]; pinned?: boolean; fallback?: number; slot?: number | null; shift?: (q: Quad, k: number) => Quad } = {}): number {
    const admissible = candidates.map((_, i) => opts.admissible?.[i] ?? true);
    const planned = this.plan?.[this.requests.length];
    const slot = opts.slot ?? -1;
    let i: number;
    if (planned && planned.key === key && planned.index >= 0 && planned.index < candidates.length) i = planned.index;
    // A label the surveyor dragged stays at the place the drag was measured from.
    else if (slot >= 0 && slot < candidates.length && admissible[slot]) i = slot;
    else {
      i = candidates.findIndex((c, k) => admissible[k] && c.every((q) => this.free(q)));
      if (i < 0) i = opts.fallback ?? admissible.indexOf(true);
      if (i < 0) i = 0;
    }
    // Where the text is drawn, with the surveyor's offsets: what other labels must avoid. The place itself is chosen without them, so a
    // drag never changes which place it's measured from.
    const shapes = opts.shift ? candidates.map((c) => c.map((q, k) => opts.shift!(q, k))) : candidates;
    this.requests.push({ key, candidates: shapes, admissible, chosen: i, pinned: Boolean(opts.pinned) || candidates.length < 2 });
    // A placed label is something the next one must not cover; the solver tells placed labels from fixed things by the requests.
    for (const q of shapes[i]!) this.filed.insert(boxOf(q), { q, b: boxOf(q) });
    return i;
  }
}

const union = (bs: readonly Box[]): Box => bs.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });

/** What a placement costs: its total and how many label pairs still meet (for the record and the tests). */
export interface Solved {
  plan: PlanEntry[];
  before: number;
  after: number;
  /** Label pairs that meet, before and after. */
  meetingBefore: number;
  meetingAfter: number;
}

/**
 * Places a sheet's labels together (see the module's note). Null when the first pass has no conflict to solve, or nothing improves:
 * then the first pass stands and nothing is drawn twice.
 */
export function solveLabels(p: Placer): Solved | null {
  const R = p.requests;
  if (R.length === 0) return null;
  const obstacles = new Grid<Shape>();
  for (const q of p.fixed) obstacles.insert(boxOf(q), { q, b: boxOf(q) });
  const cands: Shape[][][] = R.map((r) => r.candidates.map((c) => c.map((q) => ({ q, b: boxOf(q) }))));
  // How far each label's places reach: only the ones it can take, so a lot label isn't compared with labels outside its lot.
  const reach = cands.map((cs, ri) => union(cs.flatMap((c, i) => (R[ri]!.admissible[i] ? c.map((x) => x.b) : []))));
  const bounds = p.bounds;
  const outside = (b: Box) => Boolean(bounds) && (b.x0 < bounds![0] || b.y0 < bounds![1] || b.x1 > bounds![2] || b.y1 > bounds![3]);

  // Each candidate's own cost: its rank, what fixed it covers, and whether it leaves the bounds. Inadmissible ones can't be chosen.
  const own: number[][] = R.map((r, ri) =>
    cands[ri]!.map((c, i) => {
      if (!r.admissible[i]) return Infinity;
      let cost = r.candidates.length > 1 ? i / (r.candidates.length - 1) : 0;
      for (const s of c) {
        for (const o of obstacles.near(s.b)) if (meet(s.b, o.b) && quadsOverlap(s.q, o.q)) cost += o.q.length === 2 ? LABEL_COST.line : LABEL_COST.thing;
        if (outside(s.b)) cost += LABEL_COST.outside;
      }
      return cost;
    }),
  );
  // Labels whose candidates could meet at all: only these are compared.
  const reaches = new Grid<number>();
  reach.forEach((b, ri) => reaches.insert(b, ri));
  const near: number[][] = R.map((_, ri) => reaches.near(reach[ri]!).filter((rj) => rj !== ri && meet(reach[ri]!, reach[rj]!)).sort((a, b) => a - b));
  // Whether two labels' candidates meet, worked out once per pair of candidates.
  const offset: number[] = [];
  let total0 = 0;
  for (const r of R) {
    offset.push(total0);
    total0 += r.candidates.length;
  }
  const memo = new Map<number, boolean>();
  const hits = (ri: number, i: number, rj: number, j: number): boolean => {
    const [a, b] = [offset[ri]! + i, offset[rj]! + j];
    const key = a < b ? a * total0 + b : b * total0 + a;
    let v = memo.get(key);
    if (v === undefined) {
      v = cands[ri]![i]!.some((x) => cands[rj]![j]!.some((y) => meet(x.b, y.b) && quadsOverlap(x.q, y.q)));
      memo.set(key, v);
    }
    return v;
  };

  const assign = R.map((r) => r.chosen);
  // A label's cost at candidate i with everyone else where they are, leaving `skip` out of the count.
  const cost = (ri: number, i: number, skip = -1): number => {
    let c = own[ri]![i]!;
    if (!Number.isFinite(c)) return c;
    for (const rj of near[ri]!) if (rj !== skip && hits(ri, i, rj, assign[rj]!)) c += LABEL_COST.label;
    return c;
  };
  const rank = (ri: number, i: number) => (R[ri]!.candidates.length > 1 ? i / (R[ri]!.candidates.length - 1) : 0);
  const meeting = () => {
    let n = 0;
    for (let ri = 0; ri < R.length; ri++) for (const rj of near[ri]!) if (rj > ri && hits(ri, assign[ri]!, rj, assign[rj]!)) n++;
    return n;
  };
  const total = () => {
    let t = 0;
    for (let ri = 0; ri < R.length; ri++) t += own[ri]![assign[ri]!]!;
    return t + meeting() * LABEL_COST.label;
  };

  const before = total();
  const meetingBefore = meeting();
  // Nothing in conflict: every label already sits clear, at its rank's cost alone.
  if (R.every((_, ri) => cost(ri, assign[ri]!) === rank(ri, assign[ri]!))) return null;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let changed = false;
    // One label at a time: a label in conflict moves to its cheapest candidate.
    for (let ri = 0; ri < R.length; ri++) {
      if (R[ri]!.pinned) continue;
      const now = cost(ri, assign[ri]!);
      if (now === rank(ri, assign[ri]!)) continue;
      let best = assign[ri]!;
      let bestCost = now;
      for (let i = 0; i < R[ri]!.candidates.length; i++) {
        const c = cost(ri, i);
        if (c < bestCost - 1e-9) [best, bestCost] = [i, c];
      }
      if (best !== assign[ri]) {
        assign[ri] = best;
        changed = true;
      }
    }
    // Two labels that still meet, tried together over each one's cheapest candidates. Each label's candidates are scored once, and
    // again only after it or a label near it moves.
    const scored = new Map<number, number[]>();
    const full = (rk: number) => {
      let v = scored.get(rk);
      if (!v) {
        v = R[rk]!.candidates.map((_, i) => cost(rk, i));
        scored.set(rk, v);
      }
      return v;
    };
    const without = (rk: number, i: number, other: number) => full(rk)[i]! - (Number.isFinite(full(rk)[i]!) && hits(rk, i, other, assign[other]!) ? LABEL_COST.label : 0);
    for (let ri = 0; ri < R.length; ri++) {
      if (R[ri]!.pinned) continue;
      for (const rj of near[ri]!) {
        if (rj < ri || R[rj]!.pinned || !hits(ri, assign[ri]!, rj, assign[rj]!)) continue;
        const now = without(ri, assign[ri]!, rj) + without(rj, assign[rj]!, ri) + LABEL_COST.label;
        const top = (rk: number, other: number) =>
          R[rk]!.candidates
            .map((_, i) => ({ i, c: without(rk, i, other) }))
            .filter((x) => Number.isFinite(x.c))
            .sort((a, b) => a.c - b.c || a.i - b.i)
            .slice(0, PAIR_CANDIDATES);
        let best: [number, number] | null = null;
        let bestCost = now;
        for (const a of top(ri, rj)) {
          for (const b of top(rj, ri)) {
            const c = a.c + b.c + (hits(ri, a.i, rj, b.i) ? LABEL_COST.label : 0);
            if (c < bestCost - 1e-9) [best, bestCost] = [[a.i, b.i], c];
          }
        }
        if (best) {
          [assign[ri], assign[rj]] = best;
          changed = true;
          for (const rk of [ri, rj]) {
            scored.delete(rk);
            for (const rn of near[rk]!) scored.delete(rn);
          }
        }
      }
    }
    if (!changed) break;
  }

  const after = total();
  if (!(after < before - 1e-9)) return null;
  return { plan: R.map((r, ri) => ({ key: r.key, index: assign[ri]! })), before, after, meetingBefore, meetingAfter: meeting() };
}

/**
 * The placers of one composition, in the order the sheet asks for them: recording on the first pass, replaying solved plans on the
 * second.
 */
export class LabelSession {
  readonly placers: Placer[] = [];
  constructor(private readonly plans: readonly (readonly PlanEntry[] | null)[] | null = null) {}
  placer(bounds: [number, number, number, number] | null): Placer {
    const p = new Placer(this.plans?.[this.placers.length] ?? null, bounds);
    this.placers.push(p);
    return p;
  }
}
