/**
 * Drafting an intent contract with AI. The model only proposes: the result
 * prefills the editor, and the person still saves and approves it through
 * the normal contract use cases.
 *
 * Credits are reserved before the model is called and the database
 * re-checks the allowance under a lock. A call that produces no draft is
 * refunded. If settling fails after a successful draft, the reservation
 * keeps counting (fail closed) and the person still gets the draft.
 */
import { CREDIT_COSTS, type CreditOperation } from "@/config/credits";
import { checkQuota } from "@/core/billing/entitlements";
import { resolveEffectivePlan, type EffectivePlan } from "@/core/billing/trial";
import { usagePeriod, type BillingPeriod } from "@/core/billing/usage";
import { draftToForm } from "@/core/realityloop/contract-draft";
import type { ContractFormValues } from "@/core/realityloop/contract-form";
import type { ContractDrafter, DraftBrief, DraftFailure, ProviderUsage } from "@/server/ai/contract-drafter";
import { MESSAGES, codeFromDatabaseError, draftingEvents, fail, requireContributor, type RpcResult, type WriteDeps, type WriteErrorCode, type WriteResult } from "./use-cases";

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

export interface AiDraft {
  form: ContractFormValues;
  /** The model that answered, which can differ from the one requested when a refusal fallback ran. */
  model: string;
  credits: { used: number; limit: number | null };
}

const FAILURE_CODE: Record<DraftFailure, WriteErrorCode> = {
  REFUSED: "AI_REFUSED",
  INCOMPLETE: "AI_INCOMPLETE",
  PROVIDER_BUSY: "AI_BUSY",
  PROVIDER_ERROR: "AI_UNAVAILABLE",
};

function outOfCredits(trial: boolean, limit: number | null): string {
  const n = limit === null ? "your" : `all ${limit}`;
  return trial
    ? `You've used ${n} AI credits in the trial. Choose a plan to keep drafting with AI, or write the contract yourself.`
    : `You've used ${n} AI credits for this period. They reset at the start of the next one. You can still write the contract yourself.`;
}

/** What the editor shows about AI drafting, computed on the server for the current workspace. */
export interface AiAvailability {
  cost: number;
  used: number | null;
  limit: number | null;
  period: "trial" | "month";
  /** Why the button is off, or null when it works. */
  disabledReason: string | null;
}

export function aiDraftAvailability(input: {
  writeReason: string | null;
  keyPresent: boolean;
  used: number | null;
  /** Null when billing state is unknown: AI drafting then fails closed. */
  plan: EffectivePlan | null;
  period: "trial" | "month";
}): AiAvailability {
  const cost = CREDIT_COSTS.contract_draft;
  const limit = input.plan?.limits.aiCreditsPerMonth ?? null;
  const base = { cost, used: input.used, limit, period: input.period };
  if (input.writeReason) return { ...base, disabledReason: input.writeReason };
  if (!input.keyPresent) return { ...base, disabledReason: "AI drafting isn't connected on this server yet. You can still write the contract yourself." };
  if (input.used === null) return { ...base, disabledReason: "AI credit usage couldn't be read, so AI drafting is paused." };
  const quota = checkQuota(input.plan, "ai_credits", { used: input.used, requested: cost });
  if (quota.allowed) return { ...base, disabledReason: null };
  const capped = quota.code === "TRIAL_CAP_REACHED" || quota.code === "QUOTA_EXCEEDED";
  return { ...base, disabledReason: capped ? outOfCredits(quota.code === "TRIAL_CAP_REACHED", limit) : quota.message };
}

function settle(deps: AiCreditDeps, input: Parameters<AiCreditDeps["settleAiCredits"]>[0]): Promise<RpcResult<null>> {
  return deps.settleAiCredits(input).catch(() => ({ ok: false as const, error: "SETTLE_FAILED" }));
}

export async function draftContractWithAi(
  deps: WriteDeps & AiCreditDeps,
  drafter: ContractDrafter,
  input: { orgId: string; userId: string; taskId: string; brief: DraftBrief },
): Promise<WriteResult<AiDraft>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;

  const task = await deps.loadTask(input.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  if (!draftingEvents(task.state)) return fail("INVALID_TRANSITION", "The contract can't change once the task has moved past planning.");

  const now = deps.now();
  const snapshot = await deps.billing(input.orgId);
  const plan = snapshot ? resolveEffectivePlan(snapshot, now) : null;
  const period = usagePeriod(plan?.source === "trial" ? snapshot?.trial : undefined, null, now);
  const credits = CREDIT_COSTS.contract_draft;
  const used = await deps.countAiCredits(input.orgId, period);
  const quota = checkQuota(plan, "ai_credits", { used, requested: credits });
  const limit = plan?.limits.aiCreditsPerMonth ?? null;
  if (!quota.allowed) {
    const trialCap = quota.code === "TRIAL_CAP_REACHED";
    return trialCap || quota.code === "QUOTA_EXCEEDED" ? fail(quota.code, outOfCredits(trialCap, limit)) : fail(quota.code, quota.message);
  }

  const reserved = await deps.reserveAiCredits({
    orgId: input.orgId,
    actor: input.userId,
    key: deps.newEventId(),
    operation: "contract_draft",
    taskId: task.id,
    credits,
    limit,
    period,
  });
  if (!reserved.ok) {
    const code = codeFromDatabaseError(reserved.error);
    if (code === "QUOTA_EXCEEDED") return fail(plan?.source === "trial" ? "TRIAL_CAP_REACHED" : "QUOTA_EXCEEDED", outOfCredits(plan?.source === "trial", limit));
    return fail(code);
  }

  let outcome;
  try {
    outcome = await drafter.draft(input.brief);
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }

  if (!outcome.ok) {
    const refund = await settle(deps, { orgId: input.orgId, entryId: reserved.value, status: "refunded", usage: outcome.usage });
    const code = FAILURE_CODE[outcome.failure];
    return fail(code, `${MESSAGES[code]} ${refund.ok ? "No credit was used." : "The credit couldn't be returned automatically, so it may still show as used."}`);
  }

  await settle(deps, { orgId: input.orgId, entryId: reserved.value, status: "settled", usage: outcome.usage });
  return { ok: true, value: { form: draftToForm(outcome.draft), model: outcome.usage.model, credits: { used: used + credits, limit } } };
}
