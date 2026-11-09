/**
 * The Cost-Before-Compute Envelope (spec §25, ADR 0040): a hard cap a person
 * sets on one run, from the estimate they see before it starts. The cap is
 * a share of this period's AI usage, stored as units. Before each model
 * step the gateway checks that even the step's worst case fits in what's
 * left, so a run's metered total never passes its cap.
 */
import { costUnits } from "../billing/rate-card";

import type { CapChoice } from "./cap-choices";

export { CAP_CHOICES, CAP_LABELS, type CapChoice } from "./cap-choices";

/** Input tokens are counted before a step only approximately; the worst case allows this much more. */
export const INPUT_MARGIN = 1.25;

/** A run's cap in units, or null for no run cap. `top` is the estimate's high end, a whole percent. */
export function capUnitsFor(choice: CapChoice, top: number, periodUnits: number | null): number | null {
  if (choice === "plan" || !periodUnits || periodUnits <= 0 || top <= 0) return null;
  const percent = choice === "double" ? top * 2 : top;
  return Math.max(1, Math.ceil((percent / 100) * periodUnits));
}

/**
 * The most one step can cost: every input token written to the cache (the
 * dearest way to read it), with a margin for the estimate, and the step's
 * whole output allowance. A step that fits this can't overspend.
 */
export function worstStepUnits(model: string, approxInputTokens: number, maxOutputTokens: number): number {
  return costUnits(model, { inputTokens: 0, cacheWriteTokens: Math.ceil(approxInputTokens * INPUT_MARGIN), cacheReadTokens: 0, outputTokens: maxOutputTokens });
}

/**
 * The longest reply a step can be allowed without its worst case passing what's left of the cap. On a small plan
 * one step's full allowance can be the whole cap, so a step is limited to what fits, and not refused for what it
 * almost never writes. The promise holds: its worst case still fits. 0 when not even the prompt fits.
 */
export function affordableOutputTokens(model: string, approxInputTokens: number, remainingUnits: number, mostOutputTokens: number): number {
  const fits = (tokens: number) => worstStepUnits(model, approxInputTokens, tokens) <= remainingUnits;
  if (fits(mostOutputTokens)) return mostOutputTokens;
  if (!fits(0)) return 0;
  let low = 0;
  let high = mostOutputTokens;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** A cap as people see it: "6%". */
export function capShare(units: number, periodUnits: number | null): string | null {
  if (!periodUnits || periodUnits <= 0) return null;
  const pct = (units / periodUnits) * 100;
  return pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}
