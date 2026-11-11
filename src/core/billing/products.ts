/**
 * Which Dodo product checkout charges for a plan (ADR 0185).
 *
 * A plan's product is the newest one recorded, in the server's mode, at the
 * plan's current price. Which price list it was made for doesn't matter, so a
 * price change needs new products only for the plans whose price changed, and
 * every other plan keeps selling meanwhile. Until the new ones exist, the
 * changed plan has no product and checkout says so, so nobody is charged the
 * old price. A subscription on an older product keeps its plan, because a
 * product id names one plan for good.
 *
 * Pure: shared by checkout and plan changes, and by Office Space's Payments
 * page and its Create products action.
 */
import { chargeCents, getPlan, type PlanId } from "./catalog";

/**
 * The price list new products are recorded against (`catalog_version` in the
 * products tables). The database keeps one product per plan and price list, so
 * a new price needs a new price list to be recorded beside the old product.
 * products.test.ts pins it to the prices, so changing a price fails the test
 * until this changes too.
 */
export const PRICE_LIST_VERSION = "2026-11-11.1";

export interface RecordedProduct {
  planId: string;
  amountCents: number;
  /** When it was recorded, as the database gives it (ISO 8601). */
  createdAt: string;
}

export interface RecordedPack {
  packCents: number;
  createdAt: string;
}

const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

/** The product checkout uses for a plan, or null when none is recorded at its price yet. */
export function currentProduct<T extends RecordedProduct>(rows: readonly T[], planId: PlanId): T | null {
  const plan = getPlan(planId);
  if (plan.pricing.kind !== "paid") return null;
  const price = chargeCents(plan);
  return [...rows].filter((r) => r.planId === planId && r.amountCents === price).sort(newestFirst)[0] ?? null;
}

/** The product a top-up pack is bought with: the newest one recorded for it. A pack's amount is its price, so any of them charges the same. */
export function currentPack<T extends RecordedPack>(rows: readonly T[], packCents: number): T | null {
  return [...rows].filter((r) => r.packCents === packCents).sort(newestFirst)[0] ?? null;
}
