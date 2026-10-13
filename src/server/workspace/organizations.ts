import { z } from "zod";
import { resolveEffectivePlan, trialPhase, trialWindow, type BillingSnapshot, type EffectivePlan, type TrialPhase } from "@/core/billing/trial";

/** Shape returned by `organizations` with embedded one-to-one billing and trial rows. */
const OneOrMany = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema)]).nullable().transform((v) => (Array.isArray(v) ? (v[0] ?? null) : v));

const OrganizationRow = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  billing_accounts: OneOrMany(
    z.object({
      state: z.enum(["free", "trialing", "checkout_pending", "active", "past_due", "cancellation_scheduled", "suspended", "expired"]),
      paid_plan_id: z.enum(["developer", "team", "business", "enterprise"]).nullable(),
      paid_through: z.string().nullable(),
      suspended_reason: z.enum(["payment", "paused"]).nullable(),
    }),
  ),
  trials: OneOrMany(z.object({ started_at: z.string(), ends_at: z.string() })),
});

export const ORGANIZATION_SELECT =
  "id, name, created_at, billing_accounts(state, paid_plan_id, paid_through, suspended_reason), trials(started_at, ends_at)";

export interface WorkspaceSummary {
  id: string;
  name: string;
  plan: EffectivePlan;
  trial: { startedAt: string; endsAt: string; phase: TrialPhase } | null;
  /** True when billing state is missing, so entitlements fail closed. */
  billingUnknown: boolean;
}

/** Billing snapshot for one organization row, or null when billing state is missing. */
export function billingSnapshotFromRow(row: unknown): BillingSnapshot | null {
  const parsed = OrganizationRow.parse(row);
  if (!parsed.billing_accounts) return null;
  return toSnapshot(parsed);
}

function toSnapshot(row: z.infer<typeof OrganizationRow>): BillingSnapshot {
  const window = row.trials ? trialWindow(new Date(row.trials.started_at)) : undefined;
  const billing = row.billing_accounts;
  return billing
    ? {
        state: billing.state,
        paidPlanId: billing.paid_plan_id ?? undefined,
        paidThrough: billing.paid_through ? new Date(billing.paid_through) : undefined,
        suspendedReason: billing.suspended_reason ?? undefined,
        trial: window,
      }
    : { state: "free" };
}

export function summarizeOrganizations(rows: unknown, now: Date): WorkspaceSummary[] {
  return z
    .array(OrganizationRow)
    .parse(rows)
    .map((row) => {
      const window = row.trials ? trialWindow(new Date(row.trials.started_at)) : undefined;
      const billing = row.billing_accounts;
      const snapshot = toSnapshot(row);
      return {
        id: row.id,
        name: row.name,
        plan: resolveEffectivePlan(snapshot, now),
        trial: window ? { startedAt: window.startedAt.toISOString(), endsAt: window.endsAt.toISOString(), phase: trialPhase(window, now) } : null,
        billingUnknown: !billing,
      };
    });
}

export type CreateOrganizationError = "EMAIL_NOT_VERIFIED" | "INVALID_NAME" | "NOT_AUTHENTICATED" | "UNKNOWN";

export function mapCreateOrganizationError(message: string | undefined): { code: CreateOrganizationError; message: string } {
  if (message?.includes("EMAIL_NOT_VERIFIED")) return { code: "EMAIL_NOT_VERIFIED", message: "Confirm your email address first, then try again." };
  if (message?.includes("INVALID_NAME")) return { code: "INVALID_NAME", message: "Use a name between 1 and 80 characters." };
  if (message?.includes("NOT_AUTHENTICATED")) return { code: "NOT_AUTHENTICATED", message: "Your session ended. Sign in again." };
  return { code: "UNKNOWN", message: "The workspace couldn't be created. Nothing was charged. Try again in a moment." };
}
