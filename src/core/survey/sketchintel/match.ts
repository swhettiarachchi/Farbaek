/**
 * A point number as written on a sketch, matched to the survey's points (stage 241, ADR 0249). Exactly first; then, said each time,
 * the two readings a surveyor writes differently from the instrument: leading zeros (0101 for 101) and case (a1 for A1). Anything else,
 * or a number two points share, is no match: a sketch never chooses between surveyed points.
 */
import type { SurveyPoint } from "../parcel";

export type MatchHow = "exact" | "leading zeros" | "case" | "none" | "ambiguous";

export interface PointMatch {
  label: string;
  point: SurveyPoint | null;
  how: MatchHow;
}

export type PointIndex = Map<string, SurveyPoint[]>;

export function indexPoints(points: readonly SurveyPoint[]): PointIndex {
  const out: PointIndex = new Map();
  for (const p of points) out.set(p.pointId, [...(out.get(p.pointId) ?? []), p]);
  return out;
}

const one = (index: PointIndex, key: string): SurveyPoint | "many" | null => {
  const hits = index.get(key);
  return !hits || hits.length === 0 ? null : hits.length > 1 ? "many" : hits[0]!;
};

export function matchPoint(label: string, index: PointIndex): PointMatch {
  const written = label.trim().replace(/[.,;:]+$/, "");
  const exact = one(index, written);
  if (exact === "many") return { label, point: null, how: "ambiguous" };
  if (exact) return { label, point: exact, how: "exact" };
  if (/^0+\d+$/.test(written)) {
    const z = one(index, written.replace(/^0+(?=\d)/, ""));
    if (z === "many") return { label, point: null, how: "ambiguous" };
    if (z) return { label, point: z, how: "leading zeros" };
  }
  const folded = [...index.keys()].filter((k) => k.toLowerCase() === written.toLowerCase());
  if (folded.length === 1) {
    const c = one(index, folded[0]!);
    if (c === "many") return { label, point: null, how: "ambiguous" };
    if (c) return { label, point: c, how: "case" };
  }
  return { label, point: null, how: folded.length > 1 ? "ambiguous" : "none" };
}

/** Why a match isn't exact, in a phrase, or null when it is. */
export function matchNote(m: PointMatch): string | null {
  if (m.how === "leading zeros") return `${m.label} read as point ${m.point!.pointId} (leading zeros)`;
  if (m.how === "case") return `${m.label} read as point ${m.point!.pointId} (letter case)`;
  if (m.how === "ambiguous") return `${m.label} is the number of more than one surveyed point`;
  if (m.how === "none") return `${m.label} isn't a point number in the survey`;
  return null;
}
