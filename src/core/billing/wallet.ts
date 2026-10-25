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

/** The latest day a paid period can reset on: every month has it, so periods never drift. */
export const LATEST_RESET_DAY = 28;

/** The same moment `add` months later, on the given day of the month (at most the 28th). */
function onDay(d: Date, add: number, day: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

/**
 * The start of the paid usage period that contains `now`, for a subscription
 * that started at `anchor` (go-live checklist: grants follow the subscription,
 * not the calendar). Periods reset on the anchor's day of the month, or the
 * 28th for anchors on the 29th to 31st. The first period starts at the anchor.
 */
export function paidPeriodStart(anchor: Date, now: Date): Date {
  const day = Math.min(anchor.getUTCDate(), LATEST_RESET_DAY);
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
  if (start > now) start = onDay(start, -1, day);
  return start < anchor ? anchor : start;
}

/** When a paid period that started at `start` resets: the next month, on its day (at most the 28th). */
export function paidPeriodEnd(start: Date, periods = 1): Date {
  return onDay(start, periods, Math.min(start.getUTCDate(), LATEST_RESET_DAY));
}

/**
 * The grant for the period containing `now`:
 * - trial: the whole trial's usage, ending with the trial;
 * - Free: the calendar month, no rollover;
 * - paid: the subscription's own period when there's an anchor (its start),
 *   otherwise the calendar month, lasting one more period as rollover.
 * Null for contract plans, whose usage is set by the contract.
 */
export function currentGrant(plan: EffectivePlan, trial: TrialWindow | undefined, now: Date, anchor: Date | null = null): GrantSpec | null {
  const units = plan.limits.aiUnitsPerMonth;
  if (units === null) return null;
  if (plan.source === "trial" && trial) {
    return { kind: "trial", units, starts_at: trial.startedAt.toISOString(), expires_at: trial.endsAt.toISOString(), source_key: `trial:${trial.startedAt.toISOString()}` };
  }
  const start = monthStart(now);
  if (plan.source === "free") {
    return { kind: "free", units, starts_at: start.toISOString(), expires_at: monthStart(now, 1).toISOString(), source_key: `free:${monthKey(start)}` };
  }
  if (anchor) {
    const period = paidPeriodStart(anchor, now);
    return { kind: "plan", units, starts_at: period.toISOString(), expires_at: paidPeriodEnd(period, 2).toISOString(), source_key: `plan:${plan.planId}:${period.toISOString().slice(0, 10)}` };
  }
  return { kind: "plan", units, starts_at: start.toISOString(), expires_at: monthStart(now, 2).toISOString(), source_key: `plan:${plan.planId}:${monthKey(start)}` };
}

/** When a grant's period resets: a paid grant's period is its first month; the rest end when they expire. */
export function grantResetsAt(grant: Pick<GrantRow, "kind" | "startsAt" | "expiresAt">): string {
  if (grant.kind !== "plan") return grant.expiresAt;
  const start = new Date(grant.startsAt);
  // A calendar-month grant starts at midnight on the 1st; an anchored one on its subscription's day.
  const calendar = start.getUTCDate() === 1 && start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0;
  return (calendar ? monthStart(start, 1) : paidPeriodEnd(start)).toISOString();
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
