/**
 * Two reads of the same sketch photos, merged into one (stage 252, ADR 0260). A model reading a hand-drawn sketch misses a different
 * line or number each time: on the owner's real job, one read had the north wall and another the west, so neither closed the lot. Read
 * twice and merged, what either read saw is kept, and what only one saw is said to be in doubt.
 *
 * - **Lines, by their segments.** The first read's lines stand as read. Every run of segments (between consecutive numbers) the second
 *   read drew and the first didn't is added as a line of its own, with the second read's label and style. A line the second read didn't
 *   draw in full is kept, read with doubt; so is every line only the second read drew.
 * - **Readings, symbols and areas** are kept once: a reading both reads gave (the same writing, kind and ends, near the same place on
 *   the photo) is one reading, certain only if both were sure of it. Where the two reads give the same place different writing of the
 *   same kind (a 6 and a 9), both are kept, each with doubt naming the other. A reading only one read gave stays as that read gave it:
 *   a read that leaves something out hasn't disagreed with it.
 * - Nothing is invented: every number, line and word comes from one of the two reads, as written there.
 */
import { numberKey } from "../sketchintel/corrected";
import type { DrawingAnswer } from "../sketchintel/drawing";
import { DRAWING_LIMITS } from "../sketchintel/drawing";
import type { SketchOutputReading, SketchReadOutput } from "./sketch";

type Line = DrawingAnswer["lines"][number];

/** How near two readings of the same writing are on the photo, in its 0 to 1000 units, to be the same one. */
const SAME_WRITING = 60;

const label = (s: string) => s.trim();
/** A segment between two numbers, either way round, with the numbers as the engine matches them ("07" is 7); null when both ends are one number. */
const edgeKey = (image: number, p: string, q: string): string | null => {
  const [a, b] = [numberKey(p), numberKey(q)].sort();
  return a === b ? null : `${image}|${a}|${b}`;
};

/** A line's segments: each pair of consecutive numbers, and the closing one when it closes (none when its last number is its first). */
function edgesOf(l: Line): string[] {
  const pts = l.points.map(label);
  const out: string[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const e = edgeKey(l.image, pts[k]!, pts[k + 1]!);
    if (e) out.push(e);
  }
  if (l.closes && pts.length > 2) {
    const e = edgeKey(l.image, pts.at(-1)!, pts[0]!);
    if (e) out.push(e);
  }
  return out;
}

/** The lines of two reads, merged by their segments. */
export function mergeLines(first: readonly Line[], second: readonly Line[]): Line[] {
  const seenFirst = new Set(first.flatMap(edgesOf));
  const seenSecond = new Set(second.flatMap(edgesOf));
  // The first read's lines, certain only where the second read drew every segment of them too.
  const out: Line[] = first.map((l) => ({ ...l, certain: l.certain && edgesOf(l).every((e) => seenSecond.has(e)) }));
  const added = new Set<string>();
  for (const l of second) {
    const pts = l.points.map(label);
    // The runs of consecutive numbers along this line whose segments the first read didn't draw.
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 2) out.push({ image: l.image, points: run, label: l.label, style: l.style, closes: false, certain: false });
      run = [];
    };
    for (let k = 0; k + 1 < pts.length; k++) {
      const key = edgeKey(l.image, pts[k]!, pts[k + 1]!);
      if (key === null || seenFirst.has(key) || added.has(key)) {
        flush();
        continue;
      }
      added.add(key);
      if (run.length === 0) run.push(pts[k]!);
      run.push(pts[k + 1]!);
    }
    flush();
    // A closed outline the first read didn't draw at all comes over closed, as drawn.
    if (l.closes && pts.length > 2) {
      const key = edgeKey(l.image, pts.at(-1)!, pts[0]!);
      if (key !== null && !seenFirst.has(key) && !added.has(key)) {
        added.add(key);
        out.push({ image: l.image, points: [pts.at(-1)!, pts[0]!], label: l.label, style: l.style, closes: false, certain: false });
      }
    }
  }
  return out.slice(0, DRAWING_LIMITS.lines);
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const near = (a: SketchOutputReading, b: SketchOutputReading) =>
  a.photoX === undefined || a.photoY === undefined || b.photoX === undefined || b.photoY === undefined || Math.hypot(a.photoX - b.photoX, a.photoY - b.photoY) <= SAME_WRITING;
const sameReading = (a: SketchOutputReading, b: SketchOutputReading) =>
  a.image === b.image && a.kind === b.kind && norm(a.text) === norm(b.text) && label(a.from) === label(b.from) && label(a.to) === label(b.to) && near(a, b);

/** Two readings of the same kind written at the same place, as both reads placed them, that say different things: a 6 and a 9. */
const rival = (a: SketchOutputReading, b: SketchOutputReading) =>
  a.image === b.image && a.kind === b.kind && norm(a.text) !== norm(b.text) && a.photoX !== undefined && a.photoY !== undefined && b.photoX !== undefined && b.photoY !== undefined && Math.hypot(a.photoX - b.photoX, a.photoY - b.photoY) <= SAME_WRITING / 2;

/**
 * The readings of two reads, each kept once; one both reads gave is certain only if both were sure of it. Where the reads give one
 * place different writing of the same kind, both stay, each in doubt naming the other.
 */
export function mergeReadings(first: readonly SketchOutputReading[], second: readonly SketchOutputReading[]): SketchOutputReading[] {
  const out = first.map((r) => ({ ...r }));
  const fromFirst = out.length;
  for (const r of second) {
    const twin = out.find((x) => sameReading(x, r));
    if (!twin) {
      const added = { ...r };
      for (const x of out.slice(0, fromFirst)) {
        if (!rival(x, added)) continue;
        x.certain = false;
        x.doubt = `read once as ${x.text} and once as ${added.text}`;
        added.certain = false;
        added.doubt = `read once as ${added.text} and once as ${x.text}`;
      }
      out.push(added);
      continue;
    }
    if (twin.certain !== false && r.certain === false) {
      twin.certain = false;
      if (!twin.doubt && r.doubt) twin.doubt = r.doubt;
    }
  }
  return out;
}

/** Two reads of the same photos as one. With one read only, that read as it is. */
export function mergeSketchReads(first: SketchReadOutput, second: SketchReadOutput | null): SketchReadOutput {
  if (!second) return first;
  const symbols = [...(first.symbols ?? [])];
  for (const s of second.symbols ?? []) if (!symbols.some((x) => x.image === s.image && x.kind === s.kind && label(x.at) === label(s.at))) symbols.push(s);
  const areas = [...(first.areas ?? [])];
  // An area by its corners; one without numbered corners, by its name.
  const aroundKey = (a: { around: string[]; label: string }) => (a.around.length > 0 ? [...a.around.map(numberKey)].sort().join(",") : `name:${norm(a.label)}`);
  for (const a of second.areas ?? []) if (!areas.some((x) => x.image === a.image && aroundKey(x) === aroundKey(a))) areas.push(a);
  const unreadable = [...first.unreadable];
  for (const u of second.unreadable) if (!unreadable.some((x) => norm(x) === norm(u))) unreadable.push(u);
  return {
    readings: mergeReadings(first.readings, second.readings),
    unreadable,
    lines: mergeLines(first.lines ?? [], second.lines ?? []),
    symbols: symbols.slice(0, DRAWING_LIMITS.symbols),
    areas: areas.slice(0, DRAWING_LIMITS.areas),
  };
}
