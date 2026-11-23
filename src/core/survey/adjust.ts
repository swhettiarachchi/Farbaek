/**
 * Traverse adjustment (stage 231, ADR 0241): a traverse's linear misclosure spread over its stations by the rule the surveyor
 * chooses, and never by default (survey skill, rule 7). Tested arithmetic only; the unadjusted observations stay in the source file.
 *
 * - **Compass rule (Bowditch):** each station moves by the misclosure times its distance along the traverse over the whole length.
 *   It suits a traverse whose angles and distances were measured with similar care.
 * - **Transit rule:** each station's easting moves by the easting misclosure times the sum of the eastings run so far over their
 *   whole sum (as sizes, without signs), and its northing the same way with the northings. It suits angles measured with more care
 *   than distances.
 *
 * Only the linear misclosure is spread: angles aren't balanced first, because the angular misclosure isn't worked out here, and
 * heights aren't adjusted. The closing point keeps its known coordinates; the start station doesn't move.
 */

export const ADJUST_ENGINE = "adjust/1.0.0";
export const ADJUST_METHODS = ["compass", "transit"] as const;
export type AdjustMethod = (typeof ADJUST_METHODS)[number];

/** As the surveyor reads them: the rule's name in a sentence. */
export const ADJUST_NAMES: Record<AdjustMethod, string> = { compass: "the compass rule (Bowditch)", transit: "the transit rule" };

/** One leg of a run: the station or point it ends at, and its easting and northing from the one before. */
export interface RunLeg {
  to: string;
  dE: number;
  dN: number;
}

export interface Correction {
  station: string;
  dE: number;
  dN: number;
}

export type Adjustment = { ok: true; corrections: Correction[]; largest: number } | { ok: false; problem: string };

/**
 * The corrections for each station of a run, in order: every leg's end but the last, which is the closing point and keeps its known
 * coordinates. `misclosure` is where the run's computed end falls from the closing point (computed minus known), so applying the
 * whole rule to the last leg would move it by exactly minus the misclosure.
 */
export function adjustRun(legs: readonly RunLeg[], misclosure: { dE: number; dN: number }, method: AdjustMethod): Adjustment {
  if (legs.length < 2) return { ok: false, problem: "A traverse needs at least one station between its start and the point it closes on." };
  if (!legs.every((l) => Number.isFinite(l.dE) && Number.isFinite(l.dN)) || !Number.isFinite(misclosure.dE) || !Number.isFinite(misclosure.dN)) {
    return { ok: false, problem: "The traverse's legs don't all work out to finite numbers, so it can't be adjusted." };
  }
  const corrections: Correction[] = [];
  if (method === "compass") {
    const length = legs.reduce((s, l) => s + Math.hypot(l.dE, l.dN), 0);
    if (!(length > 0)) return { ok: false, problem: "The traverse has no length to spread its misclosure over." };
    let run = 0;
    for (const leg of legs.slice(0, -1)) {
      run += Math.hypot(leg.dE, leg.dN);
      corrections.push({ station: leg.to, dE: (-misclosure.dE * run) / length, dN: (-misclosure.dN * run) / length });
    }
  } else {
    const sumE = legs.reduce((s, l) => s + Math.abs(l.dE), 0);
    const sumN = legs.reduce((s, l) => s + Math.abs(l.dN), 0);
    // A misclosure in a direction no leg runs in can't be spread in proportion to the legs: the rule doesn't apply.
    if (sumE === 0 && misclosure.dE !== 0) return { ok: false, problem: "Every leg runs due north or south, so the transit rule has no eastings to spread the easting misclosure over. Choose the compass rule, or keep the points as shot." };
    if (sumN === 0 && misclosure.dN !== 0) return { ok: false, problem: "Every leg runs due east or west, so the transit rule has no northings to spread the northing misclosure over. Choose the compass rule, or keep the points as shot." };
    let runE = 0;
    let runN = 0;
    for (const leg of legs.slice(0, -1)) {
      runE += Math.abs(leg.dE);
      runN += Math.abs(leg.dN);
      corrections.push({ station: leg.to, dE: sumE === 0 ? 0 : (-misclosure.dE * runE) / sumE, dN: sumN === 0 ? 0 : (-misclosure.dN * runN) / sumN });
    }
  }
  const largest = corrections.reduce((m, c) => Math.max(m, Math.hypot(c.dE, c.dN)), 0);
  return { ok: true, corrections, largest };
}

/** "1 in 34,360" for a precision ratio, or "exactly" when there's no misclosure to divide by. */
export function precisionText(precision: number | null): string {
  return precision === null ? "exactly" : `1 in ${Math.round(precision).toLocaleString("en-GB")}`;
}
