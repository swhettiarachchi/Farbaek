/**
 * Money as people read it. Kept apart from catalog.ts so browser code can
 * format a price without pulling in how plans are worked out: costs, margins
 * and fees stay on the server.
 */
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** "$19" for whole dollars, "$15.50" otherwise. */
export function formatUsd(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usdCents.format(cents / 100);
}
