/**
 * Drafting an intent contract with AI. The model only proposes: the result
 * prefills the editor, and the person still saves and approves it through
 * the normal contract use cases. Credits follow ai-credits.ts.
 */
import type { EffectivePlan } from "@/core/billing/trial";
import { draftToForm } from "@/core/realityloop/contract-draft";
import type { ContractFormValues } from "@/core/realityloop/contract-form";
import type { ContractDrafter, DraftBrief } from "@/server/ai/contract-drafter";
import { percentUsed } from "@/core/billing/usage-view";
import { aiAvailability, refundAndFail, reserveCredits, settleCredits, type AiAvailability, type AiCreditDeps } from "./ai-credits";
import { draftingEvents, fail, requireContributor, type WriteDeps, type WriteResult } from "./use-cases";

export type { AiAvailability, AiCreditDeps } from "./ai-credits";

const MANUAL = "You can still write the contract yourself.";

export interface AiDraft {
  form: ContractFormValues;
  /** The model that answered, which can differ from the one requested when a refusal fallback ran. */
  model: string;
  /** The share of AI usage used after this draft, for the editor's note. */
  usage: { percent: number | null };
}

export function aiDraftAvailability(input: { writeReason: string | null; keyPresent: boolean; used: number | null; plan: EffectivePlan | null; period: "trial" | "month"; resetsAt: string }): AiAvailability {
  return aiAvailability({ ...input, operation: "contract_draft", manual: MANUAL });
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

  const reserved = await reserveCredits(deps, { orgId: input.orgId, userId: input.userId, taskId: task.id, operation: "contract_draft", manual: MANUAL });
  if (!reserved.ok) return reserved;
  const { entryId, credits, used, limit } = reserved.value;

  let outcome;
  try {
    outcome = await drafter.draft(input.brief);
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) return refundAndFail(deps, { orgId: input.orgId, entryId, usage: outcome.usage }, outcome.failure);

  await settleCredits(deps, { orgId: input.orgId, entryId, status: "settled", usage: outcome.usage });
  return { ok: true, value: { form: draftToForm(outcome.draft), model: outcome.usage.model, usage: { percent: percentUsed(used + credits, limit) } } };
}
