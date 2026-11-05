/**
 * Drafting an intent contract with AI. The model only proposes: the result
 * prefills the editor, and the person still saves and approves it through
 * the normal contract use cases. Usage follows ai-usage.ts.
 */
import { draftToForm } from "@/core/realityloop/contract-draft";
import { isStaticSite, SITE_CHECK_COMMAND } from "@/core/realityloop/site-check";
import type { ContractFormValues } from "@/core/realityloop/contract-form";
import { type Effort } from "@/core/agent/routing";
import { routeModel } from "@/server/ai/routing";
import type { ContractDrafter, DraftBrief } from "@/server/ai/contract-drafter";
import { contractPromptTokens } from "@/server/ai/prompts";
import { reserveUnits } from "@/core/billing/rate-card";
import { percentAfter, refundAndFail, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ModelSource } from "./ai-usage";
import { draftingEvents, fail, requireContributor, type WriteDeps, type WriteResult } from "./use-cases";

export type { AiAvailability, AiUsageDeps, ModelSource } from "./ai-usage";

export const MANUAL_CONTRACT = "You can still write the plan yourself.";

export interface AiDraft {
  form: ContractFormValues;
  /** The model that answered, which can differ from the one requested when a refusal fallback ran. */
  model: string;
  /** The share of this period's AI usage used after this draft, for the editor's note. */
  usage: { percent: number | null };
  /** Why Auto routing chose differently from what was asked, when it did. */
  routeNote: string | null;
}

export async function draftContractWithAi(
  deps: WriteDeps & AiUsageDeps,
  models: ModelSource<ContractDrafter>,
  input: { orgId: string; userId: string; taskId: string; brief: DraftBrief; effort?: Effort },
): Promise<WriteResult<AiDraft>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;

  const task = await deps.loadTask(input.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  if (!draftingEvents(task.state)) return fail("INVALID_TRANSITION", "The plan can't change once the task has moved past planning.");

  const billing = await resolvePlan(deps, input.orgId);
  if (!billing.ok) return billing;
  // Drafting a contract is planning: Auto routing keeps it on a fast model unless Deep is asked for.
  const choice = routeModel({ plan: billing.value.plan, family: models.family, step: "plan", effort: input.effort ?? "balanced" });
  const drafter = models.create(choice);

  const units = reserveUnits(drafter.model, contractPromptTokens(input.brief), drafter.maxOutputTokens);
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: task.id, operation: "contract_draft", units, manual: MANUAL_CONTRACT, billing: billing.value });
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
  const form = draftToForm(outcome.draft);
  // An existing static site's plan gets Farbaek's site check when the model listed none (ADR 0054), so the person sees it before approving.
  if (!form.checks.trim() && isStaticSite(input.brief.paths ?? [])) form.checks = SITE_CHECK_COMMAND;
  return { ok: true, value: { form, model: outcome.usage.model, usage: { percent }, routeNote: choice.note } };
}
