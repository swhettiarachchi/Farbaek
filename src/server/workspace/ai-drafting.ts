/**
 * Drafting an intent contract with AI. The model only proposes: the result
 * prefills the editor, and the person still saves and approves it through
 * the normal contract use cases. Usage follows ai-usage.ts.
 */
import { draftToForm } from "@/core/realityloop/contract-draft";
import type { ContractFormValues } from "@/core/realityloop/contract-form";
import type { ContractDrafter, DraftBrief } from "@/server/ai/contract-drafter";
import { contractPromptTokens } from "@/server/ai/prompts";
import { reserveUnits } from "@/core/billing/rate-card";
import { percentAfter, refundAndFail, reserveUsage, settleUsage, type AiUsageDeps } from "./ai-usage";
import { draftingEvents, fail, requireContributor, type WriteDeps, type WriteResult } from "./use-cases";

export type { AiAvailability, AiUsageDeps } from "./ai-usage";

export const MANUAL_CONTRACT = "You can still write the contract yourself.";

export interface AiDraft {
  form: ContractFormValues;
  /** The model that answered, which can differ from the one requested when a refusal fallback ran. */
  model: string;
  /** The share of this period's AI usage used after this draft, for the editor's note. */
  usage: { percent: number | null };
}

export async function draftContractWithAi(
  deps: WriteDeps & AiUsageDeps,
  drafter: ContractDrafter,
  input: { orgId: string; userId: string; taskId: string; brief: DraftBrief },
): Promise<WriteResult<AiDraft>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;

  const task = await deps.loadTask(input.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  if (!draftingEvents(task.state)) return fail("INVALID_TRANSITION", "The contract can't change once the task has moved past planning.");

  const units = reserveUnits(drafter.model, contractPromptTokens(input.brief), drafter.maxOutputTokens);
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: task.id, operation: "contract_draft", units, manual: MANUAL_CONTRACT });
  if (!reserved.ok) return reserved;
  const { entryId } = reserved.value;

  let outcome;
  try {
    outcome = await drafter.draft(input.brief);
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) return refundAndFail(deps, { orgId: input.orgId, entryId, usage: outcome.usage }, outcome.failure);

  await settleUsage(deps, { orgId: input.orgId, entryId, usage: outcome.usage });
  const percent = await percentAfter(deps, input.orgId, reserved.value);
  return { ok: true, value: { form: draftToForm(outcome.draft), model: outcome.usage.model, usage: { percent } } };
}
