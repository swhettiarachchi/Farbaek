/**
 * Governed action evaluation metering.
 *
 * One evaluation = one unique authenticated action request entering policy
 * evaluation. A BLOCK outcome counts. A failed authentication does not.
 * Retries with the same idempotency key count once per organization.
 *
 * The database implementation (Stage 1) enforces the same rule with a unique
 * key on (org_id, idempotency_key) inside the transaction that records usage.
 */

export const POLICY_OUTCOMES = ["ALLOW", "ALLOW_WITHIN_LIMITS", "REQUIRE_APPROVAL", "SIMULATE_FIRST", "ESCALATE", "BLOCK"] as const;

export type PolicyOutcome = (typeof POLICY_OUTCOMES)[number];

export interface EvaluationRequest {
  orgId: string;
  idempotencyKey: string;
  authenticated: boolean;
  outcome: PolicyOutcome;
  at: Date;
}

export type RecordResult = { counted: true } | { counted: false; reason: "DUPLICATE" | "UNAUTHENTICATED" | "INVALID_KEY" };

export interface BillingPeriod {
  start: Date;
  end: Date;
}

export interface UsageLedger {
  recordEvaluation(request: EvaluationRequest): Promise<RecordResult>;
  countEvaluations(orgId: string, period: BillingPeriod): Promise<number>;
}

/** Reference implementation used by tests and the labelled demo. Not for production. */
export class InMemoryUsageLedger implements UsageLedger {
  private readonly entries = new Map<string, EvaluationRequest>();

  async recordEvaluation(request: EvaluationRequest): Promise<RecordResult> {
    if (!request.authenticated) return { counted: false, reason: "UNAUTHENTICATED" };
    if (request.idempotencyKey.trim() === "" || request.orgId.trim() === "") return { counted: false, reason: "INVALID_KEY" };
    const key = `${request.orgId}\u0000${request.idempotencyKey}`;
    if (this.entries.has(key)) return { counted: false, reason: "DUPLICATE" };
    this.entries.set(key, request);
    return { counted: true };
  }

  async countEvaluations(orgId: string, period: BillingPeriod): Promise<number> {
    let count = 0;
    for (const e of this.entries.values()) {
      if (e.orgId === orgId && e.at.getTime() >= period.start.getTime() && e.at.getTime() < period.end.getTime()) count++;
    }
    return count;
  }
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Adds months to the anchor, clamping to month end, always measured from the original anchor day. */
function addMonthsFromAnchor(anchor: Date, months: number): Date {
  const total = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(
    Date.UTC(year, month, day, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()),
  );
}

/**
 * The monthly period containing `now`. Paid plans anchor to the subscription
 * start; Free uses the UTC calendar month (pass `anchor = null`).
 */
export function billingPeriod(anchor: Date | null, now: Date): BillingPeriod {
  if (anchor === null) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }
  if (now.getTime() < anchor.getTime()) {
    throw new Error("billingPeriod: now is before the subscription anchor");
  }
  let offset = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  if (addMonthsFromAnchor(anchor, offset).getTime() > now.getTime()) offset -= 1;
  return { start: addMonthsFromAnchor(anchor, offset), end: addMonthsFromAnchor(anchor, offset + 1) };
}

/**
 * The window a plan's usage limits apply to right now: the whole trial while
 * it runs (trial caps are totals), otherwise the period from billingPeriod.
 */
export function usagePeriod(
  trial: { startedAt: Date; endsAt: Date } | undefined,
  anchor: Date | null,
  now: Date,
): BillingPeriod & { kind: "trial" | "month" } {
  if (trial && now.getTime() >= trial.startedAt.getTime() && now.getTime() < trial.endsAt.getTime()) {
    return { start: trial.startedAt, end: trial.endsAt, kind: "trial" };
  }
  return { ...billingPeriod(anchor, now), kind: "month" };
}
