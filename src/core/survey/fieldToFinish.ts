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
 */
import { codeOf, lookupCode, type CodeEntry } from "./codes";
import type { DrawingFeature } from "./document";
import type { SurveyPoint } from "./parcel";

export interface SuggestedFeature extends Omit<DrawingFeature, "id"> {
  /** Point numbers, for the review list. */
  pointNumbers: string[];
  meaning: string;
}

const LAYER_BY_CODE: Record<string, DrawingFeature["layer"]> = { MW: "WALLS", RW: "WALLS", BFDn: "WALLS", LF: "FENCES", NF: "FENCES", EDn: "DRAINS", MDn: "DRAINS", B: "WALLS", U: "WALLS" };

/** "MW2 CLO" is code "MW", string "2", control "CLO". */
function split(raw: string | null): { base: string; string: string; control: string } {
  const first = codeOf(raw);
  const m = /^([A-Za-z]+)(\d*)$/.exec(first);
  const control = (raw ?? "").trim().split(/\s+/).slice(1).find((w) => /^(END|CLO)$/i.test(w))?.toUpperCase() ?? "";
  return m ? { base: m[1]!, string: m[2]!, control } : { base: first, string: "", control };
}

export function suggestFeatures(points: readonly SurveyPoint[], codes: readonly CodeEntry[]): SuggestedFeature[] {
  const out: SuggestedFeature[] = [];
  let run: { entry: CodeEntry; tag: string; pts: SurveyPoint[]; closed: boolean } | null = null;
  const flush = () => {
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
    run = null;
  };
  for (const p of points) {
    const { base, string, control } = split(p.code);
    const entry = lookupCode(codes, base);
    const joins = entry && (entry.kind === "line" || entry.kind === "outline");
    const tag = joins ? `${entry.code}#${string}` : "";
    if (!joins) {
      flush();
      continue;
    }
    if (!run || run.tag !== tag) {
      flush();
      run = { entry, tag, pts: [], closed: false };
    }
    run.pts.push(p);
    if (control === "CLO") {
      run.closed = true;
      flush();
    } else if (control === "END") flush();
  }
  flush();
  return out;
}
