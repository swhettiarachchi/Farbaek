/**
 * A stated extent, as a deed or an earlier plan writes it, read as a number
 * so it can be set beside the land the engine computed (stage 192, survey
 * skill rule 5: a stated extent and a computed area are different numbers,
 * kept apart). The text is the surveyor's, or read from a photo and checked
 * by them; this only parses what's written, in the units it names. Anything
 * it can't read is said to be unreadable, never guessed.
 *
 * Units, from the international yard (units.ts): 1 perch = 25.29285264 m²,
 * 40 perches = 1 rood, 4 roods = 1 acre; 1 hectare = 10,000 m².
 */
import { ACRE_M2, HECTARE_M2, PERCH_M2, ROOD_M2 } from "./units";

export type StatedUnit = "arp" | "ha" | "acre" | "perch" | "m2";

export interface StatedExtent {
  m2: number;
  /** The units it was written in, so the difference is shown in the same. */
  as: StatedUnit;
}

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const n = (s: string | undefined) => (s === undefined ? 0 : Number(s.replace(/,/g, "")));

/**
 * Reads "0 A. 2 R. 04.60 P.", "A0-R2-P4.6", "2R 10P", "0.21398 Hectares",
 * "0.2 ha", "1.5 acres", "34.5 perches", "2,267 m²", "2267 sq. m".
 * Acres, roods and perches come first, as Sri Lankan deeds give them; a text
 * that also gives hectares is read by its A-R-P.
 */
export function readStatedExtent(text: string): StatedExtent | null {
  const t = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Acres, roods and perches, numbers before or after their letters; at least two of the three named.
  const before = new RegExp(String.raw`(?:${NUM}\s*a(?:cres?)?\b\.?)?\s*[-,]?\s*(?:${NUM}\s*r(?:oods?)?\b\.?)?\s*[-,]?\s*(?:${NUM}\s*p(?:erch(?:es)?)?\b\.?)?`, "iy");
  const after = new RegExp(String.raw`(?:a(?:cres?)?\.?\s*${NUM})?\s*[-,]?\s*(?:r(?:oods?)?\.?\s*${NUM})?\s*[-,]?\s*(?:p(?:erch(?:es)?)?\.?\s*${NUM})?`, "iy");
  for (const re of [before, after]) {
    for (let i = 0; i < t.length; i++) {
      // Only where a word starts, so "12 A" isn't read from the middle of "112 A".
      if (i > 0 && /[\p{L}\p{N}.]/u.test(t[i - 1]!)) continue;
      re.lastIndex = i;
      const m = re.exec(t);
      if (!m || !m[0].trim()) continue;
      const named = [m[1], m[2], m[3]].filter((x) => x !== undefined).length;
      if (named >= 2) {
        const [a, r, p] = [n(m[1]), n(m[2]), n(m[3])];
        if (r >= 4 || p >= 40) return null;
        return { m2: a * ACRE_M2 + r * ROOD_M2 + p * PERCH_M2, as: "arp" };
      }
    }
  }
  const one = (unit: string) => new RegExp(String.raw`${NUM}\s*(?:${unit})(?![a-z])`, "i").exec(t);
  const ha = one(String.raw`ha\.?|hectares?`);
  if (ha) return { m2: n(ha[1]) * HECTARE_M2, as: "ha" };
  const ac = one(String.raw`acres?|ac\.?`);
  if (ac) return { m2: n(ac[1]) * ACRE_M2, as: "acre" };
  const pe = one(String.raw`perch(?:es)?|p\.?`);
  if (pe) return { m2: n(pe[1]) * PERCH_M2, as: "perch" };
  const sq = one(String.raw`m2|m²|sq\.?\s*m(?:etres?|eters?)?|square\s+met(?:re|er)s?`);
  if (sq) return { m2: n(sq[1]), as: "m2" };
  return null;
}
