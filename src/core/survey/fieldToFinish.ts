/**
 * Field-to-finish (ADR 0204): suggested linework from the codes a total
 * station recorded with each point, as survey CAD tools do. Suggestions only:
 * the surveyor accepts them, and nothing is drawn until they do.
 *
 * The rules, deliberately few and documented (docs/survey/CAD_ENGINE.md):
 * - Points are taken in the order they were imported (the order they were
 *   observed in the field).
 * - Consecutive points whose code is a line or outline code in the library
 *   join into one line. A number on the code keeps separate strings apart:
 *   "MW1" and "MW2" are two walls, "MW" one.
 * - A different code, or the same code with another number, ends the line.
 *   The word "END" after the code ends it after that point; "CLO" closes it.
 * - Outline codes (buildings) always close.
 * - Mark codes stay marks; they're written beside their points.
 * - A point can carry several codes ("CP MW": a post that also ends a wall),
 *   each with its own END or CLO; it joins every line its codes name.
 * - Anything after a slash is the crew's note ("St / found"), never a code.
 */
import { codeText, lookupCode, type CodeEntry } from "./codes";
import type { DrawingFeature } from "./document";
import type { SurveyPoint } from "./parcel";

export interface SuggestedFeature extends Omit<DrawingFeature, "id"> {
  /** Point numbers, for the review list. */
  pointNumbers: string[];
  meaning: string;
}

const LAYER_BY_CODE: Record<string, DrawingFeature["layer"]> = { MW: "WALLS", RW: "WALLS", BFDn: "WALLS", LF: "FENCES", NF: "FENCES", EDn: "DRAINS", MDn: "DRAINS", B: "WALLS", U: "WALLS" };

/**
 * "CP MW2 CLO" is code "CP", then code "MW" in string "2" with control "CLO".
 * The first word is the point's code, as always. A later word is a second
 * code only when it is a line or outline code of the library written exactly
 * (same letters, same case), so a description ("MW t junction") never turns
 * into codes. END and CLO go with the last line code before them.
 */
function codesIn(raw: string | null, codes: readonly CodeEntry[]): { base: string; string: string; control: string }[] {
  const out: { base: string; string: string; control: string; line: boolean }[] = [];
  const words = codeText(raw).split(/\s+/).filter(Boolean);
  words.forEach((w, i) => {
    if (/^(END|CLO)$/i.test(w)) {
      const last = [...out].reverse().find((c) => c.line);
      if (last) last.control = w.toUpperCase();
      return;
    }
    const m = /^([A-Za-z]+)(\d*)$/.exec(w);
    const base = m ? m[1]! : w;
    const entry = i === 0 ? lookupCode(codes, base) : codes.find((c) => c.code === base);
    if (i > 0 && !(entry && (entry.kind === "line" || entry.kind === "outline"))) return;
    out.push({ base, string: m ? m[2]! : "", control: "", line: Boolean(entry && (entry.kind === "line" || entry.kind === "outline")) });
  });
  return out;
}

type Run = { entry: CodeEntry; tag: string; pts: SurveyPoint[]; closed: boolean };

export function suggestFeatures(points: readonly SurveyPoint[], codes: readonly CodeEntry[]): SuggestedFeature[] {
  const out: SuggestedFeature[] = [];
  // Lines being collected, by code and string: a point with two line codes adds to two lines.
  const runs = new Map<string, Run>();
  const flush = (tag: string) => {
    const run = runs.get(tag);
    runs.delete(tag);
    if (run && run.pts.length >= 2) {
      const closed = run.entry.kind === "outline" || (run.closed && run.pts.length >= 3);
      out.push({
        layer: run.entry.kind === "outline" ? "BUILDINGS" : (LAYER_BY_CODE[run.entry.code] ?? "WALLS"),
        code: run.entry.code,
        closed,
        points: run.pts.map((p) => p.id),
        pointNumbers: run.pts.map((p) => p.pointId),
        meaning: run.entry.meaning,
      });
    }
  };
  for (const p of points) {
    const here = codesIn(p.code, codes).flatMap((c) => {
      const entry = lookupCode(codes, c.base);
      return entry && (entry.kind === "line" || entry.kind === "outline") ? [{ entry, tag: `${entry.code}#${c.string}`, control: c.control }] : [];
    });
    // A line this point doesn't carry ends before it.
    for (const tag of [...runs.keys()]) if (!here.some((h) => h.tag === tag)) flush(tag);
    for (const h of here) {
      const run = runs.get(h.tag) ?? { entry: h.entry, tag: h.tag, pts: [], closed: false };
      runs.set(h.tag, run);
      run.pts.push(p);
      if (h.control === "CLO") {
        run.closed = true;
        flush(h.tag);
      } else if (h.control === "END") flush(h.tag);
    }
  }
  for (const tag of [...runs.keys()]) flush(tag);
  return out;
}
