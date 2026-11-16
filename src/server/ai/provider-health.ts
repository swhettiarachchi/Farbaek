/**
 * Which AI providers are answering right now (stage 201, ADR 0215). Kept in this server's memory: after three failures in a row a
 * provider is routed around for two minutes, then tried again. One success clears it. Nothing here is stored or shared between
 * servers; it only spares people waiting on a provider that's down while another can answer.
 */
import type { ProviderHealth } from "@/core/chat/intelligence";

type Provider = keyof ProviderHealth;

const TRIP_AFTER = 3;
const REST_MS = 120_000;

interface State {
  failures: number;
  restingUntil: number;
}

const g = globalThis as unknown as { __farbaekProviderHealth?: Record<Provider, State> };
const state: Record<Provider, State> = (g.__farbaekProviderHealth ??= {
  anthropic: { failures: 0, restingUntil: 0 },
  openai: { failures: 0, restingUntil: 0 },
});

export function providerHealth(now = Date.now()): ProviderHealth {
  return { anthropic: state.anthropic.restingUntil <= now, openai: state.openai.restingUntil <= now };
}

/** A provider's answer worked or failed for a reason of its own (busy, an error), never because the person stopped it. */
export function recordProviderResult(provider: Provider, ok: boolean, now = Date.now()): void {
  const s = state[provider];
  if (ok) {
    s.failures = 0;
    s.restingUntil = 0;
    return;
  }
  s.failures += 1;
  if (s.failures >= TRIP_AFTER) {
    s.restingUntil = now + REST_MS;
    s.failures = 0;
  }
}

/** For tests: back to healthy. */
export function resetProviderHealth(): void {
  for (const p of ["anthropic", "openai"] as const) state[p] = { failures: 0, restingUntil: 0 };
}
