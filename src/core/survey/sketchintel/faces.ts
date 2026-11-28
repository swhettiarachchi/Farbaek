/**
 * The closed areas a sketch's lines make with each other (stage 254, ADR 0262), worked out from the surveyed points the lines join.
 * A field sketch draws a house as a few walls that meet the boundary: the house is the area those walls and the boundary close round,
 * though no one line goes all the way round it. These are that area and its neighbours, so a label written inside one can say which.
 *
 * - Only surveyed points: a face's corners are the points the lines are drawn through. Nothing is moved or added.
 * - A drawn point lying on another line between two of its numbers (a wall meeting the boundary where no number is written on the
 *   boundary) joins that line there, when the surveyed point lies within `snap` metres of it: the face then runs along the line to it.
 *   A leg drawn twice (the same wall on two photos) is one leg.
 * - Lines that cross where no number is (a misread number) make no faces at all, and nor does a drawing too large to check: a face is
 *   never built from a drawing that can't be flat, so nothing is said that the lines don't settle.
 * - Or, asked for (`crossing: "drop"`, stage 304): both legs of each crossing are left out, and the faces are the rest's. A leg that cuts
 *   through a face crosses its sides, which are then left out too, so a face found is never cut by a leg it doesn't show. A house's room
 *   is found this way, beside two lines read once that cross elsewhere on the sketch.
 */
import { distance, pointSegmentDistance, segmentsIntersect, signedArea } from "../geometry";
import type { SurveyPoint } from "../parcel";

export interface Face {
  /** Its corners in order round it, anticlockwise. */
  points: SurveyPoint[];
  areaM2: number;
}

/** A run of surveyed points as one drawn line: closed when it comes back to its first point. */
export interface Run {
  points: readonly SurveyPoint[];
  closed: boolean;
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The bounded faces the runs make, smallest first, each a simple ring of at least three surveyed points. Empty when the runs cross
 * where no number is, or close round nothing.
 */
export function facesOf(runs: readonly Run[], snap: number, maxWork = 400_000, crossing: "none" | "drop" = "none"): Face[] {
  const byId = new Map<string, SurveyPoint>();
  // Each leg once, however many lines draw it (the same wall on two photos, a side drawn on its own as well as round the lot).
  const legs = new Map<string, [string, string]>();
  for (const run of runs) {
    for (const p of run.points) byId.set(p.id, p);
    const n = run.points.length;
    for (let i = 0; i + 1 < n + (run.closed && n >= 3 ? 1 : 0); i++) {
      const [a, b] = [run.points[i]!, run.points[(i + 1) % n]!];
      if (a.id !== b.id) legs.set(key(a.id, b.id), [a.id, b.id]);
    }
  }
  const legList = [...legs.values()];

  // A drawn point lying on a leg it isn't an end of (a wall drawn onto the boundary between two of its numbers): the leg is split at that
  // point. Each point joins at most one leg, the nearest, and only within the tolerance and between the leg's ends.
  const splits = new Map<number, string[]>();
  let work = 0;
  for (const p of byId.values()) {
    let best = -1;
    let bestD = Infinity;
    for (const [k, [a, b]] of legList.entries()) {
      if (a === p.id || b === p.id) continue;
      const [pa, pb] = [byId.get(a)!, byId.get(b)!];
      if (Math.min(pa.e, pb.e) - snap > p.e || Math.max(pa.e, pb.e) + snap < p.e || Math.min(pa.n, pb.n) - snap > p.n || Math.max(pa.n, pb.n) + snap < p.n) continue;
      if (++work > maxWork) return [];
      const len = distance(pa, pb);
      if (len < 1e-6) continue;
      const t = ((p.e - pa.e) * (pb.e - pa.e) + (p.n - pa.n) * (pb.n - pa.n)) / (len * len);
      const d = pointSegmentDistance(p, pa, pb);
      if (t > 0 && t < 1 && d <= snap && d < bestD) [best, bestD] = [k, d];
    }
    if (best >= 0) splits.set(best, [...(splits.get(best) ?? []), p.id]);
  }

  const edges = new Map<string, Set<string>>();
  const join = (a: string, b: string) => {
    if (a === b) return;
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)!.add(b);
    edges.get(b)!.add(a);
  };
  legList.forEach(([a, b], k) => {
    const pa = byId.get(a)!;
    const pb = byId.get(b)!;
    const along = (id: string) => {
      const p = byId.get(id)!;
      return (p.e - pa.e) * (pb.e - pa.e) + (p.n - pa.n) * (pb.n - pa.n);
    };
    const chain = [a, ...(splits.get(k) ?? []).sort((x, y) => along(x) - along(y)), b];
    for (let i = 0; i + 1 < chain.length; i++) join(chain[i]!, chain[i + 1]!);
  });

  // Spurs (a line that ends without meeting another) bound nothing: pruned, end by end.
  const prune = () => {
    for (let pruned = true; pruned; ) {
      pruned = false;
      for (const [id, ns] of edges) {
        if (ns.size <= 1) {
          for (const o of ns) edges.get(o)?.delete(id);
          edges.delete(id);
          pruned = true;
        }
      }
    }
  };
  prune();

  // Two legs that cross where no number is: the drawing can't be flat, so no face is trusted. Legs whose boxes are apart are skipped, and
  // the work is capped: a drawing too large to check makes no faces, so nothing is drawn from it that wasn't checked.
  const all = [...new Set([...edges].flatMap(([a, ns]) => [...ns].map((b) => key(a, b))))].map((k) => {
    const [a, b] = k.split("|") as [string, string];
    const [pa, pb] = [byId.get(a)!, byId.get(b)!];
    return { a, b, pa, pb, box: [Math.min(pa.e, pb.e), Math.min(pa.n, pb.n), Math.max(pa.e, pb.e), Math.max(pa.n, pb.n)] as const };
  });
  const crossed: typeof all = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const [x, y] = [all[i]!, all[j]!];
      if (x.a === y.a || x.a === y.b || x.b === y.a || x.b === y.b) continue;
      if (x.box[2] < y.box[0] || y.box[2] < x.box[0] || x.box[3] < y.box[1] || y.box[3] < x.box[1]) continue;
      if (++work > maxWork) return [];
      if (!segmentsIntersect(x.pa, x.pb, y.pa, y.pb)) continue;
      if (crossing === "none") return [];
      crossed.push(x, y);
    }
  for (const { a, b } of crossed) {
    edges.get(a)?.delete(b);
    edges.get(b)?.delete(a);
  }
  if (crossed.length > 0) prune();

  // Each point's neighbours by direction, anticlockwise from east.
  const around = new Map<string, string[]>();
  for (const [id, ns] of edges) {
    const p = byId.get(id)!;
    around.set(
      id,
      [...ns].sort((x, y) => {
        const [qx, qy] = [byId.get(x)!, byId.get(y)!];
        return Math.atan2(qx.n - p.n, qx.e - p.e) - Math.atan2(qy.n - p.n, qy.e - p.e);
      }),
    );
  }

  // Walking each side of each leg, always taking the next leg clockwise at a point, goes once round each face: anticlockwise round a
  // bounded one (positive area), clockwise round the outside.
  const walked = new Set<string>();
  const faces: Face[] = [];
  for (const [a, ns] of edges)
    for (const b of ns) {
      if (walked.has(`${a}>${b}`)) continue;
      const ring: string[] = [];
      let [u, v] = [a, b];
      let steps = 0;
      while (!walked.has(`${u}>${v}`) && steps++ < 10_000) {
        walked.add(`${u}>${v}`);
        ring.push(u);
        const list = around.get(v)!;
        const w = list[(list.indexOf(u) - 1 + list.length) % list.length]!;
        [u, v] = [v, w];
      }
      if (ring.length < 3 || new Set(ring).size !== ring.length) continue;
      const pts = ring.map((id) => byId.get(id)!);
      const s = signedArea(pts);
      if (s > 0.01) faces.push({ points: pts, areaM2: s });
    }
  return faces.sort((x, y) => x.areaM2 - y.areaM2);
}

/** Whether a place lies inside a ring of places (crossing count): the ring in any units, so on a photo as well as on the ground. */
export function within(p: { x: number; y: number }, ring: readonly { x: number; y: number }[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = [ring[i]!, ring[j]!];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
