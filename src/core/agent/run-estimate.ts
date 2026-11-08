/**
 * What a run is likely to use of this period's AI usage, worked out from what
 * each model costs. Server-only by import: it reads the rate card, which never
 * goes to the browser. Moved out of prompt-start.ts, which the composer uses.
 */
import { costUnits, type TokenUsage } from "@/core/billing/rate-card";

// One agent step, at the light and heavy ends of what Farbaek's runs use (prompt caching on).
// Calibrated on a live run (2026-10-18): 3 Sonnet steps on a small site cost 147 units, about 49 a step.
// The heavy end allows for a larger project, where each step resends more cached context and writes more.
const LIGHT_STEP: TokenUsage = { inputTokens: 400, cacheReadTokens: 5_000, outputTokens: 300 };
const HEAVY_STEP: TokenUsage = { inputTokens: 1_500, cacheReadTokens: 25_000, outputTokens: 1_200 };
const STEPS = { fast: [3, 10], balanced: [4, 18], deep: [6, 28] } as const;

/** About how many more steps a first build or a design upgrade takes at the least than a change to one part (ADR 0158). */
const WHOLE_SITE_SCALE = 2.5;

/** Units as a share of the period's allowance, as people see it: "under 0.1%", "0.4%", "3%". Null without an allowance. */
export function shareOfPeriod(units: number, periodUnits: number | null): string | null {
  if (!periodUnits || periodUnits <= 0) return null;
  const pct = (Math.max(0, units) / periodUnits) * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return "under 0.1%";
  if (pct < 1) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/**
 * A run's likely share of this period's AI usage, as a range of whole
 * percents (at least 1). Guidance only: the wallet still meters each step
 * at its real cost and refunds failed ones. Null without an allowance.
 */
export function estimateRunShare(input: { model: string; effort: keyof typeof STEPS; periodUnits: number | null; wholeSite?: boolean }): { low: number; high: number } | null {
  if (!input.periodUnits || input.periodUnits <= 0) return null;
  const [fewest, most] = STEPS[input.effort];
  // A whole site written or redesigned never takes as few steps as a small change, so its low end rises. The high
  // end is already a long run of heavy steps, and a run can't use more than the whole period, so it stops at 100%.
  const low = fewest * (input.wholeSite ? WHOLE_SITE_SCALE : 1) * costUnits(input.model, LIGHT_STEP);
  const high = most * costUnits(input.model, HEAVY_STEP);
  const pct = (units: number) => Math.min(100, Math.max(1, Math.round((units / input.periodUnits!) * 100)));
  return { low: pct(low), high: Math.max(pct(low), pct(high)) };
}
