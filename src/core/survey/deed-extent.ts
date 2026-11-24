/**
 * The deed's extent on the face of a classic plan (stage 244, ADR 0252): one rule for when the front page gives it, used by the front
 * page, the boundaries schedule overleaf, the checks and the Sheet tab, so none of them can say something the others don't do.
 *
 * The face gives the deed's extent only when all of these hold: the surveyor chose it, the layout is the classic one, the sheet isn't an
 * extract of one lot, the stated extent can be read, and the plan has its own computed extent to keep in the schedule beside it.
 * Nothing is computed from the deed: its extent is printed, never used for an area, a lot or a check's result.
 */
import type { SurveyDocument } from "./document";
import { readStatedExtent, type StatedExtent } from "./extent";
import { arpClassic, hectares } from "./formats";
import type { PlanLots } from "./lots";
import { toArp } from "./units";

/** The plan's entire area: the outline's own area when the lots join cleanly, otherwise the sum of the lots it could compute. */
export function entireAreaM2(lots: PlanLots): number | null {
  if (lots.lots.length === 0) return null;
  return lots.outlineAreaM2 ?? (lots.sumAreaM2 > 0 ? lots.sumAreaM2 : null);
}

/** The decimals a stated extent writes its perches to ("05.00 P." is 2, "P. 4.6" is 1), or null when it gives no perches. */
export function writtenPerchDecimals(text: string): number | null {
  // Each part (the text in and out of brackets) as the extent reader takes it: numbers then units, or units first ("A. 0 R. 2 P. 04.6").
  for (const part of text.split(/[()]/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^[a-z]/i.test(part) ? /\b(?:perches|perch|per|p)\.?\s*\d+(?:\.(\d+))?/i.exec(part) : /\d+(?:\.(\d+))?\s*(?:perches|perch|per|p)\b/i.exec(part);
    if (m) return m[1]?.length ?? 0;
  }
  return null;
}

export type DeedFace =
  | { shown: true; stated: StatedExtent; perchDecimals: number; printed: string }
  | { shown: false; why: "off" | "not_classic" | "extract" | "unreadable" | "no_area" };

/**
 * Whether the front page gives the deed's extent, and if not, why not. When it does, `printed` is the figure as the face prints it: the
 * perches to at least as many decimals as the deed writes them, so the deed's own figure isn't rounded away.
 */
export function deedExtentFace(doc: SurveyDocument, lots: PlanLots): DeedFace {
  if (doc.settings.deedExtentOnFace !== true) return { shown: false, why: "off" };
  if (doc.settings.template !== "classic") return { shown: false, why: "not_classic" };
  // The same extract the classic layout draws: a lot that's still on the plan.
  if (doc.sheet.extractOf && doc.lots.some((l) => l.id === doc.sheet.extractOf)) return { shown: false, why: "extract" };
  const stated = readStatedExtent(doc.sheet.statedExtent);
  if (!stated) return { shown: false, why: "unreadable" };
  if (entireAreaM2(lots) === null) return { shown: false, why: "no_area" };
  const perchDecimals = Math.min(4, Math.max(doc.settings.perchDecimals, writtenPerchDecimals(doc.sheet.statedExtent) ?? 0));
  return { shown: true, stated, perchDecimals, printed: `${hectares(stated.m2)} Hectares ( ${arpClassic(toArp(stated.m2, perchDecimals))} )` };
}
