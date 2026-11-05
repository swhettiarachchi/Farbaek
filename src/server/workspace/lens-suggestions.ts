/**
 * AI suggestions in the Intent Diff Lens (ADR 0044). On request, a model
 * maps each hunk of a pending proposal to the contract clause it serves, or
 * none. The call is metered like any AI action and refunded if it fails;
 * only mappings for hunks that were sent and clauses that exist are kept.
 */
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { routeModel } from "@/server/ai/routing";
import { lensForChange } from "@/core/realityloop/intent-lens";
import { acceptSuggestion, lensRequest, type LensSuggestionMapping } from "@/core/realityloop/lens-suggestion";
import { LENS_MAPPER_SYSTEM_PROMPT, lensMessage, type LensMapper } from "@/server/ai/lens-mapper";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ModelSource } from "./ai-usage";
import type { ProposalDeps } from "./proposals";
import { codeFromDatabaseError, fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export const MANUAL_LENS = "The exact checks still apply; read each change against the contract yourself.";

export interface LensSuggestionDeps {
  /** One revision's content, or null when it doesn't exist. */
  fileRevision(orgId: string, projectId: string, path: string, revision: number): Promise<string | null>;
  recordLensSuggestion(input: { proposalId: string; actor: string; mappings: LensSuggestionMapping[]; model: string }): Promise<RpcResult<null>>;
}

type Deps = WriteDeps & AiUsageDeps & Pick<ProposalDeps, "approvedContract" | "loadProposal"> & LensSuggestionDeps;

const FAILURES = {
  REFUSED: "The model declined to map these changes, so it wasn't counted. The exact checks still apply.",
  INCOMPLETE: "The mapping came back incomplete, so it wasn't counted. Try again.",
  PROVIDER_BUSY: "The AI provider is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The AI couldn't finish linking these changes, so it wasn't counted. Try again.",
} as const;

export async function suggestLensMapping(deps: Deps, source: ModelSource<LensMapper>, input: { orgId: string; userId: string; proposalId: string }): Promise<WriteResult<{ mapped: number; hunks: number; model: string }>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const proposal = await deps.loadProposal(input.orgId, input.proposalId);
  if (!proposal) return fail("NOT_FOUND");
  if (proposal.status !== "pending") return fail("PROPOSAL_CLOSED");
  if (deps.now().getTime() >= Date.parse(proposal.expiresAt)) return fail("PROPOSAL_EXPIRED");
  const contract = await deps.approvedContract(input.orgId, proposal.taskId);
  if (!contract || contract.version !== proposal.contractVersion) return fail("CONTRACT_CHANGED");

  // The same reading as the review: each hunk against the contract, with its exact flags.
  const bases = await Promise.all(proposal.changes.map((c) => (c.kind === "edit" ? deps.fileRevision(input.orgId, proposal.projectId, c.path, c.baseRevision) : Promise.resolve(""))));
  const lenses = proposal.changes.map((c, i) => lensForChange(contract.body, c, bases[i] ?? ""));
  const request = lensRequest(contract.body, lenses, proposal.changes);
  if (request.hunks.length === 0) return fail("INVALID_PROPOSAL", "This proposal has no changes to map.");

  const billing = await resolvePlan(deps, input.orgId);
  if (!billing.ok) return billing;
  const mapper = source.create(routeModel({ plan: billing.value.plan, family: source.family, step: "review", effort: "fast" }));
  const units = reserveUnits(mapper.model, approxTokens(LENS_MAPPER_SYSTEM_PROMPT) + approxTokens(lensMessage(request)) + 500, mapper.maxOutputTokens);
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: proposal.taskId, operation: "lens_mapping", units, manual: MANUAL_LENS, billing: billing.value });
  if (!reserved.ok) return reserved;

  let outcome;
  try {
    outcome = await mapper.map(request);
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) {
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail(outcome.failure === "PROVIDER_BUSY" ? "AI_BUSY" : outcome.failure === "REFUSED" ? "AI_REFUSED" : "AI_INCOMPLETE", FAILURES[outcome.failure]);
  }
  await settleUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage });

  // Model output is untrusted: keep hunks that were sent and clauses the contract has.
  const mappings = acceptSuggestion(request, outcome.output);
  const recorded = await deps.recordLensSuggestion({ proposalId: proposal.id, actor: input.userId, mappings, model: outcome.usage.model });
  if (!recorded.ok) return fail(codeFromDatabaseError(recorded.error));
  return { ok: true, value: { mapped: mappings.filter((m) => m.clause !== "none").length, hunks: request.hunks.length, model: outcome.usage.model } };
}
