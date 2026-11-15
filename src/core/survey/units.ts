/**
 * Area units, converted in this one tested module (survey skill, rule 5).
 *
 * The imperial units derive from the international yard, fixed at exactly
 * 0.9144 m by the 1959 international yard and pound agreement:
 *   1 square yard = 0.83612736 m²
 *   1 perch       = 30.25 square yards = 25.29285264 m²
 *   1 rood        = 40 perches         = 1,011.7141056 m²
 *   1 acre        = 4 roods = 160 perches = 4,046.8564224 m²
 *   1 hectare     = 10,000 m²
 * Areas are stored and computed in square metres; these conversions run only
 * when presenting or exporting. Sources and status: docs/survey/STANDARDS_RESEARCH.md.
 */

export const YARD_M = 0.9144;
export const SQUARE_YARD_M2 = 0.83612736;
export const PERCH_M2 = 25.29285264;
export const ROOD_M2 = 1011.7141056;
export const ACRE_M2 = 4046.8564224;
export const HECTARE_M2 = 10_000;

export const PERCHES_PER_ROOD = 40;
export const ROODS_PER_ACRE = 4;
export const PERCHES_PER_ACRE = PERCHES_PER_ROOD * ROODS_PER_ACRE;

export type AreaUnit = "m2" | "ha" | "acre" | "rood" | "perch";

const PER_UNIT: Record<AreaUnit, number> = { m2: 1, ha: HECTARE_M2, acre: ACRE_M2, rood: ROOD_M2, perch: PERCH_M2 };

/** An area in square metres expressed in another unit, at full precision. */
export function fromSquareMetres(m2: number, unit: AreaUnit): number {
  return m2 / PER_UNIT[unit];
}

/** An area in another unit expressed in square metres, at full precision. */
export function toSquareMetres(value: number, unit: AreaUnit): number {
  return value * PER_UNIT[unit];
}

/** An extent in acres, roods and perches. Perches carry the decimals. */
export interface Arp {
  acres: number;
  roods: number;
  perches: number;
  /** How many decimals the perches were rounded to. */
  perchDecimals: number;
}

/**
 * Square metres as acres, roods and perches. The total is rounded once, in
 * perches, before it is split, so 39.999 perches at two decimals becomes
 * 1 rood 0.00 perches rather than "40.00 perches". The rounding is half away
 * from zero on the decimal value. Sri Lanka's official rounding for stated
 * extents is recorded in the standards research; this default is a setting.
 */
export function toArp(m2: number, perchDecimals = 2): Arp {
  if (!Number.isFinite(m2) || m2 < 0) throw new RangeError("An area must be a finite, non-negative number of square metres.");
  if (!Number.isInteger(perchDecimals) || perchDecimals < 0 || perchDecimals > 4) throw new RangeError("Perch decimals must be 0 to 4.");
  const scale = 10 ** perchDecimals;
  // Rounded in whole hundredths (or whatever the scale is) of a perch, as an integer, so no float residue is split.
  const units = roundHalfAway((m2 / PERCH_M2) * scale);
  const perAcre = PERCHES_PER_ACRE * scale;
  const perRood = PERCHES_PER_ROOD * scale;
  const acres = Math.floor(units / perAcre);
  const roods = Math.floor((units - acres * perAcre) / perRood);
  const perches = (units - acres * perAcre - roods * perRood) / scale;
  return { acres, roods, perches, perchDecimals };
}

/** A-R-P as written on plans: "0A 1R 12.50P". */
export function formatArp(arp: Arp): string {
  return `${arp.acres}A ${arp.roods}R ${arp.perches.toFixed(arp.perchDecimals)}P`;
}

/** Half away from zero, on a value already scaled to the decimal kept. Guards float residue such as 12.499999999. */
export function roundHalfAway(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const nudged = abs + Number.EPSILON * Math.max(1, abs) * 4;
  return sign * Math.floor(nudged + 0.5);
}

/** A number rounded to a number of decimals with the same rule, for presentation only. */
export function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return roundHalfAway(value * scale) / scale;
}
