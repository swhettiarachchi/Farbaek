import { z } from "zod";
import { PAID_PLAN_IDS } from "@/core/billing/catalog";
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
      paid_plan_id: z.enum(PAID_PLAN_IDS).nullable(),
      paid_through: z.string().nullable(),
      suspended_reason: z.enum(["payment", "paused"]).nullable(),
      // Why a workspace started without a trial (migration v38, ADR 0065).
      trial_withheld: z.enum(["address_used", "disposable_address"]).nullable().optional(),
    }),
  ),
  trials: OneOrMany(z.object({ started_at: z.string(), ends_at: z.string() })),
  // Set by Farbaek staff from Office Space (migration v21, ADR 0032).
  suspended_at: z.string().nullable().optional(),
  suspended_notice: z.string().nullable().optional(),
  // The workspace's own emergency pause (migration v53, ADR 0083).
  agents_paused_at: z.string().nullable().optional(),
  agents_paused_reason: z.string().nullable().optional(),
});

export const ORGANIZATION_SELECT =
  "id, name, created_at, suspended_at, suspended_notice, agents_paused_at, agents_paused_reason, billing_accounts(state, paid_plan_id, paid_through, suspended_reason, trial_withheld), trials(started_at, ends_at)";

export interface WorkspaceSummary {
  id: string;
  name: string;
  plan: EffectivePlan;
  trial: { startedAt: string; endsAt: string; phase: TrialPhase } | null;
  /** Why the workspace started on Free instead of a trial, when it did (ADR 0065). */
  trialWithheld: "address_used" | "disposable_address" | null;
  /** True when billing state is missing, so entitlements fail closed. */
  billingUnknown: boolean;
  /** Paused by Farbaek staff: members can read but not change anything, and the notice says why. */
  suspension: { at: string; notice: string } | null;
  /** The workspace's own emergency pause (ADR 0083): no agent runs or automatic changes until an owner or admin resumes. */
  agentsPaused: { at: string; reason: string | null } | null;
}

/** Billing snapshot for one organization row, or null when billing state is missing. */
export function billingSnapshotFromRow(row: unknown): BillingSnapshot | null {
  const parsed = OrganizationRow.parse(row);
  if (!parsed.billing_accounts) return null;
  return toSnapshot(parsed);
}

function toSnapshot(row: z.infer<typeof OrganizationRow>): BillingSnapshot {
  const window = row.trials ? trialWindow(new Date(row.trials.started_at), new Date(row.trials.ends_at)) : undefined;
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
      const window = row.trials ? trialWindow(new Date(row.trials.started_at), new Date(row.trials.ends_at)) : undefined;
      const billing = row.billing_accounts;
      const snapshot = toSnapshot(row);
      return {
        id: row.id,
        name: row.name,
        plan: resolveEffectivePlan(snapshot, now),
        trial: window ? { startedAt: window.startedAt.toISOString(), endsAt: window.endsAt.toISOString(), phase: trialPhase(window, now) } : null,
        trialWithheld: billing?.trial_withheld ?? null,
        billingUnknown: !billing,
        suspension: row.suspended_at ? { at: row.suspended_at, notice: row.suspended_notice ?? "Farbaek has paused this workspace." } : null,
        agentsPaused: row.agents_paused_at ? { at: row.agents_paused_at, reason: row.agents_paused_reason ?? null } : null,
      };
    });
}

export type CreateOrganizationError = "EMAIL_NOT_VERIFIED" | "INVALID_NAME" | "NOT_AUTHENTICATED" | "PAUSED" | "UNKNOWN";

export function mapCreateOrganizationError(message: string | undefined): { code: CreateOrganizationError; message: string } {
  if (message?.includes("EMAIL_NOT_VERIFIED")) return { code: "EMAIL_NOT_VERIFIED", message: "Confirm your email address first, then try again." };
  if (message?.includes("INVALID_NAME")) return { code: "INVALID_NAME", message: "Use a name between 1 and 80 characters." };
  if (message?.includes("NOT_AUTHENTICATED")) return { code: "NOT_AUTHENTICATED", message: "Your session ended. Sign in again." };
  if (message?.includes("PAUSED_BY_FARBAEK")) return { code: "PAUSED", message: "Farbaek has paused new workspaces for a short while. Try again soon; nothing was charged." };
  return { code: "UNKNOWN", message: "The workspace couldn't be created. Nothing was charged. Try again in a moment." };
}
