/**
 * Bearings (survey skill, rule 4). The engine's convention is the whole-circle
 * bearing: degrees clockwise from the grid north of the project's confirmed
 * CRS, from 0 up to (not including) 360. Every bearing shown carries that
 * convention in words, and a typed bearing keeps its original text.
 *
 * Coordinates are (E, N): easting and northing in metres. A bearing from
 * point A to point B is atan2(ΔE, ΔN): note the argument order, east first,
 * because bearings are measured from north, not from the x-axis.
 */

export const NORTH_REFERENCE = "grid" as const;
export const BEARING_CONVENTION = "Whole-circle bearings, clockwise from grid north of the confirmed coordinate system." as const;

const FULL = 360;

/** Any angle in degrees brought into [0, 360). -0 and 360 both become 0. */
export function normaliseDegrees(deg: number): number {
  if (!Number.isFinite(deg)) throw new RangeError("An angle must be a finite number of degrees.");
  const r = deg % FULL;
  const n = r < 0 ? r + FULL : r;
  return n === FULL || Object.is(n, -0) ? 0 : n;
}

/** The whole-circle bearing in degrees from (ΔE, ΔN). Null when both are zero: a leg with no length has no direction. */
export function bearingFromDeltas(dE: number, dN: number): number | null {
  if (dE === 0 && dN === 0) return null;
  return normaliseDegrees((Math.atan2(dE, dN) * 180) / Math.PI);
}

/** Degrees, minutes and seconds, already rounded and carried. */
export interface Dms {
  degrees: number;
  minutes: number;
  seconds: number;
  /** Decimals the seconds were rounded to. */
  secondDecimals: number;
}

/**
 * A bearing in [0, 360) as degrees, minutes and seconds. The value is rounded
 * once, in seconds, before it is split, so 59.9996″ at whole seconds carries
 * into the minutes and 359°59′59.6″ becomes 0°00′00″, never "60″" or "360°".
 */
export function toDms(deg: number, secondDecimals = 0): Dms {
  if (!Number.isInteger(secondDecimals) || secondDecimals < 0 || secondDecimals > 3) throw new RangeError("Second decimals must be 0 to 3.");
  const scale = 10 ** secondDecimals;
  const perDegree = 3600 * scale;
  let units = Math.round(normaliseDegrees(deg) * perDegree);
  if (units >= FULL * perDegree) units -= FULL * perDegree;
  const degrees = Math.floor(units / perDegree);
  const minutes = Math.floor((units - degrees * perDegree) / (60 * scale));
  const seconds = (units - degrees * perDegree - minutes * 60 * scale) / scale;
  return { degrees, minutes, seconds, secondDecimals };
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** "045°30′07″", as survey plans write a whole-circle bearing. */
export function formatDms(dms: Dms): string {
  const whole = Math.floor(dms.seconds);
  const fraction = dms.secondDecimals > 0 ? (dms.seconds - whole).toFixed(dms.secondDecimals).slice(1) : "";
  return `${pad(dms.degrees, 3)}°${pad(dms.minutes, 2)}′${pad(whole, 2)}${fraction}″`;
}

/** A whole-circle bearing as a quadrant bearing, "N 45°30′07″ E", from the same rounded value. */
export function formatQuadrant(deg: number, secondDecimals = 0): string {
  const b = normaliseDegrees(deg);
  const [ns, ew, angle] = b <= 90 ? ["N", "E", b] : b <= 180 ? ["S", "E", 180 - b] : b <= 270 ? ["S", "W", b - 180] : ["N", "W", 360 - b];
  const d = toDms(angle, secondDecimals);
  const whole = Math.floor(d.seconds);
  const fraction = d.secondDecimals > 0 ? (d.seconds - whole).toFixed(d.secondDecimals).slice(1) : "";
  return `${ns} ${pad(d.degrees, 2)}°${pad(d.minutes, 2)}′${pad(whole, 2)}${fraction}″ ${ew}`;
}

/** A typed bearing, read and normalised, with what was typed kept beside it. */
export interface ParsedBearing {
  degrees: number;
  original: string;
  notation: "dms" | "decimal" | "quadrant";
}

const DMS = /^(\d{1,3})(?:[°\s:-]+|d\s*)(\d{1,2})(?:[′'\s:-]+|m\s*)(\d{1,2}(?:\.\d+)?)\s*(?:″|"|''|s)?$/i;
const DM = /^(\d{1,3})(?:[°\s:-]+|d\s*)(\d{1,2}(?:\.\d+)?)\s*(?:′|'|m)?$/i;
const DECIMAL = /^(\d{1,3}(?:\.\d+)?)\s*°?$/;
const QUADRANT = /^([NS])\s*(.+?)\s*([EW])$/i;

function angleFromText(text: string): { degrees: number; notation: "dms" | "decimal" } | null {
  const t = text.trim();
  let m = DMS.exec(t);
  if (m) {
    const [d, min, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (min >= 60 || s >= 60) return null;
    return { degrees: d + min / 60 + s / 3600, notation: "dms" };
  }
  m = DM.exec(t);
  if (m) {
    const [d, min] = [Number(m[1]), Number(m[2])];
    if (min >= 60) return null;
    return { degrees: d + min / 60, notation: "dms" };
  }
  m = DECIMAL.exec(t);
  if (m) return { degrees: Number(m[1]), notation: "decimal" };
  return null;
}

/**
 * Reads a typed bearing: whole-circle in DMS ("123°45′12″", "123 45 12",
 * "123-45-12") or decimal degrees ("123.7533"), or a quadrant bearing
 * ("N 45 30 00 E"). Returns null for anything it can't read for certain,
 * rather than guessing.
 */
export function parseBearing(text: string): ParsedBearing | null {
  const original = text;
  const t = text.trim().replace(/\s+/g, " ");
  const q = QUADRANT.exec(t);
  if (q) {
    const angle = angleFromText(q[2]!);
    if (!angle || angle.degrees > 90) return null;
    const ns = q[1]!.toUpperCase();
    const ew = q[3]!.toUpperCase();
    const a = angle.degrees;
    const wcb = ns === "N" && ew === "E" ? a : ns === "S" && ew === "E" ? 180 - a : ns === "S" && ew === "W" ? 180 + a : 360 - a;
    return { degrees: normaliseDegrees(wcb), original, notation: "quadrant" };
  }
  const angle = angleFromText(t);
  if (!angle || angle.degrees >= 360) return null;
  return { degrees: normaliseDegrees(angle.degrees), original, notation: angle.notation };
}

/** The (ΔE, ΔN) of a leg from its bearing and horizontal distance. */
export function deltasFromBearing(deg: number, distance: number): { dE: number; dN: number } {
  const r = (normaliseDegrees(deg) * Math.PI) / 180;
  return { dE: distance * Math.sin(r), dN: distance * Math.cos(r) };
}
