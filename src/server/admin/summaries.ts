/**
 * Pure helpers for the admin console (ADR 0026), kept apart from the
 * queries so they can be tested without a database.
 */
import { getPlan } from "@/core/billing/catalog";
import { USD_PER_UNIT } from "@/core/billing/rate-card";
import type { WorkspaceSummary } from "@/server/workspace/organizations";

/** The first instant of the current calendar month, in UTC. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** AI list cost in USD from settled ledger rows (1 unit = $0.0001), rounded to the cent. */
export function aiCostUsd(rows: readonly { credits: number }[]): number {
  const units = rows.reduce((sum, r) => sum + Math.max(0, r.credits), 0);
  return Math.round(units * USD_PER_UNIT * 100) / 100;
}

export function usd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

/** "Pro trial", "Starter", "Free". Payments aren't connected, so paid plans only appear once go-live is done. */
export function planLabel(ws: WorkspaceSummary): string {
  if (ws.billingUnknown) return "Billing missing";
  const name = getPlan(ws.plan.planId).name;
  return ws.plan.source === "trial" ? `${name} trial` : name;
}

/** Days left in an active trial, or null when there's no active trial. */
export function trialDaysLeft(ws: WorkspaceSummary): number | null {
  return ws.trial?.phase.phase === "active" ? ws.trial.phase.daysRemaining : null;
}

/** Counts per key, for joining member and project rows to workspaces. */
export function countBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return counts;
}

/** The latest timestamp per key (ISO strings compare in time order). */
export function latestBy<T>(rows: readonly T[], key: (row: T) => string, at: (row: T) => string): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const k = key(row);
    const t = at(row);
    if (!latest.has(k) || latest.get(k)! < t) latest.set(k, t);
  }
  return latest;
}
