/**
 * The daily model check (ADR 0090): what Anthropic lists, set against the
 * models Farbaek routes to. A model that's no longer listed may have been
 * retired; a later one in the same family may be its replacement. Neither
 * changes anything on its own: staff compare with a canary, and an owner
 * decides.
 */

export interface ListedModel {
  id: string;
  displayName: string;
  /** When the provider released it; may be the epoch when unknown. */
  createdAt: string;
}

export type WatchFinding =
  | { kind: "missing"; tier: string; model: string }
  | { kind: "newer"; tier: string; model: string; newer: string; displayName: string };

/** A configured alias ("claude-sonnet-5-5") as the provider may list it, with or without a date ("claude-sonnet-5-5-20260901"). */
export function listedAs(alias: string, listed: readonly ListedModel[]): ListedModel | null {
  return listed.find((m) => m.id === alias || new RegExp(`^${alias.replace(/[.]/g, "\\.")}-\\d{8}$`).test(m.id)) ?? null;
}

/** "claude-sonnet" for "claude-sonnet-5-5"; null when the id isn't a Claude model name. */
export function familyOf(id: string): string | null {
  return /^(claude-[a-z]+)-\d/.exec(id)?.[1] ?? null;
}

export function watchFindings(configured: Readonly<Record<string, string>>, listed: readonly ListedModel[]): WatchFinding[] {
  const findings: WatchFinding[] = [];
  const inUse = new Set(Object.values(configured));
  for (const [tier, model] of Object.entries(configured)) {
    const found = listedAs(model, listed);
    if (!found) {
      findings.push({ kind: "missing", tier, model });
      continue;
    }
    const family = familyOf(model);
    if (!family) continue;
    const since = Date.parse(found.createdAt);
    const later = listed
      .filter((m) => familyOf(m.id) === family && Date.parse(m.createdAt) > since && ![...inUse].some((alias) => listedAs(alias, [m])))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    if (later) findings.push({ kind: "newer", tier, model, newer: later.id, displayName: later.displayName });
  }
  return findings;
}

/** One sentence per finding, for the owner's email and Office Space. */
export function findingWords(f: WatchFinding): string {
  return f.kind === "missing"
    ? `${f.model} (the ${f.tier} tier) isn't in Anthropic's model list any more. It may have been retired: run a canary for a replacement.`
    : `Anthropic lists ${f.displayName} (${f.newer}), newer than ${f.model} (the ${f.tier} tier). Run a canary before deciding.`;
}
