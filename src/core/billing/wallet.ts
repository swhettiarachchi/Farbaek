/**
 * The usage wallet (ADR 0020), as people experience it. AI usage lives in
 * grants: each period issues one, and a paid plan's grant lasts two months,
 * so unused usage rolls over. Spending draws from the grant that expires
 * soonest (the database does the drawing, migration 15).
 *
 * This module decides which grant a period issues, and turns grants into
 * what people see: the share of this period's allowance used, when it
 * resets, and what rolled over and when that expires. Never units.
 */
import { percentUsed } from "./usage-view";
import type { EffectivePlan, TrialWindow } from "./trial";

export type GrantKind = "plan" | "trial" | "free" | "topup" | "adjustment";

export interface GrantRow {
  id: string;
  kind: GrantKind;
  units: number;
  used: number;
  startsAt: string;
  expiresAt: string;
}

/** The grant a period issues, in the shape app_reserve_usage takes. */
export interface GrantSpec {
  kind: "plan" | "trial" | "free";
  units: number;
  starts_at: string;
  expires_at: string;
  source_key: string;
}

function monthStart(d: Date, add = 0): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1));
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * The grant for the period containing `now`:
 * - trial: the whole trial's usage, ending with the trial;
 * - Free: the calendar month, no rollover;
 * - paid: the calendar month (until payments set a subscription anchor),
 *   lasting one more month as rollover.
 * Null for contract plans, whose usage is set by the contract.
 */
export function currentGrant(plan: EffectivePlan, trial: TrialWindow | undefined, now: Date): GrantSpec | null {
  const units = plan.limits.aiUnitsPerMonth;
  if (units === null) return null;
  if (plan.source === "trial" && trial) {
    return { kind: "trial", units, starts_at: trial.startedAt.toISOString(), expires_at: trial.endsAt.toISOString(), source_key: `trial:${trial.startedAt.toISOString()}` };
  }
  const start = monthStart(now);
  if (plan.source === "free") {
    return { kind: "free", units, starts_at: start.toISOString(), expires_at: monthStart(now, 1).toISOString(), source_key: `free:${monthKey(start)}` };
  }
  return { kind: "plan", units, starts_at: start.toISOString(), expires_at: monthStart(now, 2).toISOString(), source_key: `plan:${plan.planId}:${monthKey(start)}` };
}

/** When a grant's period resets: a paid grant's period is its first month; the rest end when they expire. */
export function grantResetsAt(grant: Pick<GrantRow, "kind" | "startsAt" | "expiresAt">): string {
  return grant.kind === "plan" ? monthStart(new Date(grant.startsAt), 1).toISOString() : grant.expiresAt;
}

/** One grant as people see it: never units, only the share left and when it expires. */
export interface WalletGrant {
  id: string;
  kind: GrantKind;
  startsAt: string;
  expiresAt: string;
  /** 0 to 100. */
  percentLeft: number;
  /** This period's grant, as opposed to one carried over or added. */
  current: boolean;
}

export interface WalletView {
  /** Units left across every active grant. Server-side only: never shown. */
  available: number;
  /** This period's grant: the share used and when the period resets. */
  current: { percent: number | null; resetsAt: string; period: "trial" | "month" } | null;
  /** What rolled over from earlier periods, as a share of this period's allowance, and its soonest expiry. */
  rollover: { percentOfMonth: number; expiresAt: string } | null;
  /** Every active grant, soonest expiry first: the order usage is spent in. */
  grants: WalletGrant[];
}

const isActive = (g: GrantRow, now: Date) => Date.parse(g.startsAt) <= now.getTime() && Date.parse(g.expiresAt) > now.getTime();

/**
 * What people see. `spec` stands in for this period's grant before its
 * first use has issued it in the database.
 */
export function walletView(grants: readonly GrantRow[], spec: GrantSpec | null, now: Date): WalletView {
  const active = grants.filter((g) => isActive(g, now));
  const currentKey = spec?.source_key;
  // This period's grant is the issued one matching the spec, else the newest active one.
  // Compared as instants: the database writes "+00:00" where the spec has "Z".
  const issued = active.find((g) => spec && g.kind === spec.kind && Date.parse(g.startsAt) === Date.parse(spec.starts_at)) ?? null;
  const current: GrantRow | null =
    issued ?? (spec ? { id: currentKey ?? "pending", kind: spec.kind, units: spec.units, used: 0, startsAt: spec.starts_at, expiresAt: spec.expires_at } : null);
  const older = active.filter((g) => g !== issued && (current === null || Date.parse(g.startsAt) < Date.parse(current.startsAt)));
  const available = active.reduce((n, g) => n + Math.max(0, g.units - g.used), 0) + (issued || !current ? 0 : current.units);

  const rolledUnits = older.reduce((n, g) => n + Math.max(0, g.units - g.used), 0);
  const rollover =
    rolledUnits > 0 && current && current.units > 0
      ? { percentOfMonth: Math.max(1, Math.round((rolledUnits / current.units) * 100)), expiresAt: older.reduce((a, g) => (Date.parse(g.expiresAt) < Date.parse(a) ? g.expiresAt : a), older[0]!.expiresAt) }
      : null;

  const listed = issued || !current ? active : [...active, current];
  const grantsView: WalletGrant[] = listed
    .map((g) => ({ id: g.id, kind: g.kind, startsAt: g.startsAt, expiresAt: g.expiresAt, percentLeft: 100 - (percentUsed(g.used, g.units) ?? 0), current: g === current }))
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));

  return {
    available,
    grants: grantsView,
    current: current ? { percent: percentUsed(current.used, current.units), resetsAt: grantResetsAt(current), period: current.kind === "trial" ? "trial" : "month" } : null,
    rollover,
  };
}
