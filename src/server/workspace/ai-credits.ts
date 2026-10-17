/**
 * Spending AI credits, shared by every AI operation. Credits are reserved
 * before the model is called and the database re-checks the allowance under
 * a lock. A call that produces nothing usable is refunded. If settling fails
 * after a success, the reservation keeps counting (fail closed).
 */
import { CREDIT_COSTS, type CreditOperation } from "@/config/credits";
import { checkQuota } from "@/core/billing/entitlements";
import { resolveEffectivePlan, type EffectivePlan } from "@/core/billing/trial";
import { usagePeriod, type BillingPeriod } from "@/core/billing/usage";
import type { DraftFailure, ProviderUsage } from "@/server/ai/contract-drafter";
import { MESSAGES, codeFromDatabaseError, fail, type RpcResult, type WriteDeps, type WriteErrorCode, type WriteResult } from "./use-cases";

export interface AiCreditDeps {
  countAiCredits(orgId: string, period: BillingPeriod): Promise<number>;
  reserveAiCredits(input: {
    orgId: string;
    actor: string;
    key: string;
    operation: CreditOperation;
    taskId: string | null;
    credits: number;
    limit: number | null;
    period: BillingPeriod;
  }): Promise<RpcResult<string>>;
  settleAiCredits(input: { orgId: string; entryId: string; status: "settled" | "refunded"; usage: ProviderUsage | null }): Promise<RpcResult<null>>;
}

/** What a screen shows about an AI action, computed on the server for the current workspace. */
export interface AiAvailability {
  cost: number;
  used: number | null;
  limit: number | null;
  period: "trial" | "month";
  /** Why the button is off, or null when it works. */
  disabledReason: string | null;
  /** The model provider this server uses ("Claude", "Gemini"), or null when none is connected. */
  provider: string | null;
}

export function outOfCredits(trial: boolean, limit: number | null, manual: string): string {
  const n = limit === null ? "your" : `all ${limit}`;
  return trial
    ? `You've used ${n} AI credits in the trial. Choose a plan to keep using AI, or continue without it. ${manual}`
    : `You've used ${n} AI credits for this period. They reset at the start of the next one. ${manual}`;
}

export function aiAvailability(input: {
  operation: CreditOperation;
  writeReason: string | null;
  keyPresent: boolean;
  /** Provider label shown next to the action, when one is connected. */
  provider?: string | null;
  /** Why no provider is connected, when keyPresent is false. */
  notConnectedReason?: string;
  used: number | null;
  /** Null when billing state is unknown: AI then fails closed. */
  plan: EffectivePlan | null;
  period: "trial" | "month";
  /** What the person can still do by hand, for example "You can still write the contract yourself." */
  manual: string;
}): AiAvailability {
  const cost = CREDIT_COSTS[input.operation];
  const limit = input.plan?.limits.aiCreditsPerMonth ?? null;
  const base = { cost, used: input.used, limit, period: input.period, provider: input.keyPresent ? (input.provider ?? null) : null };
  if (input.writeReason) return { ...base, disabledReason: input.writeReason };
  if (!input.keyPresent) return { ...base, disabledReason: `${input.notConnectedReason ?? "AI isn't connected on this server yet."} ${input.manual}` };
  if (input.used === null) return { ...base, disabledReason: "AI credit usage couldn't be read, so AI is paused." };
  const quota = checkQuota(input.plan, "ai_credits", { used: input.used, requested: cost });
  if (quota.allowed) return { ...base, disabledReason: null };
  const capped = quota.code === "TRIAL_CAP_REACHED" || quota.code === "QUOTA_EXCEEDED";
  return { ...base, disabledReason: capped ? outOfCredits(quota.code === "TRIAL_CAP_REACHED", limit, input.manual) : quota.message };
}

export interface Reservation {
  entryId: string;
  credits: number;
  used: number;
  limit: number | null;
}

/** Checks the allowance with the shared rules, then reserves the credits in the database. */
export async function reserveCredits(
  deps: WriteDeps & AiCreditDeps,
  input: { orgId: string; userId: string; taskId: string; operation: CreditOperation; manual: string },
): Promise<WriteResult<Reservation>> {
  const now = deps.now();
  const snapshot = await deps.billing(input.orgId);
  const plan = snapshot ? resolveEffectivePlan(snapshot, now) : null;
  const trial = plan?.source === "trial";
  const period = usagePeriod(trial ? snapshot?.trial : undefined, null, now);
  const credits = CREDIT_COSTS[input.operation];
  const used = await deps.countAiCredits(input.orgId, period);
  const quota = checkQuota(plan, "ai_credits", { used, requested: credits });
  const limit = plan?.limits.aiCreditsPerMonth ?? null;
  if (!quota.allowed) {
    const capped = quota.code === "TRIAL_CAP_REACHED" || quota.code === "QUOTA_EXCEEDED";
    return capped ? fail(quota.code, outOfCredits(quota.code === "TRIAL_CAP_REACHED", limit, input.manual)) : fail(quota.code, quota.message);
  }

  const reserved = await deps.reserveAiCredits({
    orgId: input.orgId,
    actor: input.userId,
    key: deps.newEventId(),
    operation: input.operation,
    taskId: input.taskId,
    credits,
    limit,
    period,
  });
  if (!reserved.ok) {
    const code = codeFromDatabaseError(reserved.error);
    if (code === "QUOTA_EXCEEDED") return fail(trial ? "TRIAL_CAP_REACHED" : "QUOTA_EXCEEDED", outOfCredits(trial, limit, input.manual));
    return fail(code);
  }
  return { ok: true, value: { entryId: reserved.value, credits, used, limit } };
}

export function settleCredits(deps: AiCreditDeps, input: Parameters<AiCreditDeps["settleAiCredits"]>[0]): Promise<RpcResult<null>> {
  return deps.settleAiCredits(input).catch(() => ({ ok: false as const, error: "SETTLE_FAILED" }));
}

const FAILURE_CODE: Record<DraftFailure, WriteErrorCode> = {
  REFUSED: "AI_REFUSED",
  INCOMPLETE: "AI_INCOMPLETE",
  PROVIDER_BUSY: "AI_BUSY",
  PROVIDER_ERROR: "AI_UNAVAILABLE",
};

/** Refunds a reservation and returns the failure, saying honestly whether the refund was recorded. */
export async function refundAndFail<T>(
  deps: AiCreditDeps,
  input: { orgId: string; entryId: string; usage: ProviderUsage | null },
  failure: DraftFailure | { code: WriteErrorCode; message: string },
): Promise<WriteResult<T>> {
  const refund = await settleCredits(deps, { ...input, status: "refunded" });
  const code = typeof failure === "string" ? FAILURE_CODE[failure] : failure.code;
  const message = typeof failure === "string" ? MESSAGES[code] : failure.message;
  return fail(code, `${message} ${refund.ok ? "No credit was used." : "The credit couldn't be returned automatically, so it may still show as used."}`);
}
