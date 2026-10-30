/**
 * The second check on a pending change (ADR 0121): a second model reads it
 * against its approved contract. When this server has an OpenAI key, the
 * second model comes from another company than the one that wrote the
 * change; otherwise it's a different Claude model when the plan has one. Metered like any AI action and refunded if
 * it fails. The answer is advisory and kept with the proposal; it never
 * changes the policy's decision or what the change needs to be approved.
 */
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { acceptSecondCheck, checkerModel, secondCheckRequest, type SecondCheckResult } from "@/core/trust/second-check";
import { SECOND_CHECK_SYSTEM_PROMPT, secondCheckMessage, type SecondChecker } from "@/server/ai/second-checker";
import { platformModels } from "@/server/platform/state";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps } from "./ai-usage";
import type { ProposalDeps } from "./proposals";
import { codeFromDatabaseError, fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export const MANUAL_SECOND_CHECK = "The policy and the exact checks still apply; read the diff yourself.";

export interface SecondCheckDeps {
  /** One revision's content, or null when it doesn't exist. */
  fileRevision(orgId: string, projectId: string, path: string, revision: number): Promise<string | null>;
  recordSecondCheck(input: { proposalId: string; actor: string; result: SecondCheckResult }): Promise<RpcResult<null>>;
}

type Deps = WriteDeps & AiUsageDeps & Pick<ProposalDeps, "approvedContract" | "loadProposal"> & SecondCheckDeps;

const FAILURES = {
  REFUSED: "The second model declined to review this change, so it wasn't counted. The policy and exact checks still apply.",
  INCOMPLETE: "The second check came back incomplete, so it wasn't counted. Try again.",
  PROVIDER_BUSY: "The AI provider is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The second check didn't finish, so it wasn't counted. Try again.",
} as const;

export interface SecondCheckers {
  /** The OpenAI checker, when this server has a key. */
  openai: SecondChecker | null;
  claude: (model: string) => SecondChecker;
}

export async function runSecondCheck(deps: Deps, checkers: SecondCheckers, input: { orgId: string; userId: string; proposalId: string }): Promise<WriteResult<SecondCheckResult>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const proposal = await deps.loadProposal(input.orgId, input.proposalId);
  if (!proposal) return fail("NOT_FOUND");
  if (proposal.status !== "pending") return fail("PROPOSAL_CLOSED");
  if (deps.now().getTime() >= Date.parse(proposal.expiresAt)) return fail("PROPOSAL_EXPIRED");
  const contract = await deps.approvedContract(input.orgId, proposal.taskId);
  if (!contract || contract.version !== proposal.contractVersion) return fail("CONTRACT_CHANGED");
  if (proposal.changes.length === 0) return fail("INVALID_PROPOSAL", "This proposal has no changes to check.");

  const bases = await Promise.all(proposal.changes.map((c) => (c.kind === "edit" ? deps.fileRevision(input.orgId, proposal.projectId, c.path, c.baseRevision) : Promise.resolve(""))));
  const { request, truncated } = secondCheckRequest(
    contract.body,
    {
      plan: proposal.plan ?? { summary: "", steps: [], risks: [], checks: [] },
      changes: proposal.changes,
      violations: proposal.violations ?? [],
      policy: proposal.policy ? { outcome: proposal.policy.outcome, findings: proposal.policy.findings } : null,
    },
    bases.map((b) => b ?? ""),
  );

  const billing = await resolvePlan(deps, input.orgId);
  if (!billing.ok) return billing;
  // Another company's model when there's one; otherwise a different Claude model, when the plan includes another.
  const choice =
    checkers.openai && checkers.openai.model !== proposal.model
      ? { checker: checkers.openai, independent: true }
      : (() => {
          const c = checkerModel(billing.value.plan, "anthropic", proposal.model, platformModels());
          return { checker: checkers.claude(c.model), independent: c.independent };
        })();
  const checker = choice.checker;
  const units = reserveUnits(checker.model, approxTokens(SECOND_CHECK_SYSTEM_PROMPT) + approxTokens(secondCheckMessage(request)) + 500, checker.maxOutputTokens);
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: proposal.taskId, operation: "second_check", units, manual: MANUAL_SECOND_CHECK, billing: billing.value });
  if (!reserved.ok) return reserved;

  let outcome;
  try {
    outcome = await checker.check(request);
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) {
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail(outcome.failure === "PROVIDER_BUSY" ? "AI_BUSY" : outcome.failure === "REFUSED" ? "AI_REFUSED" : "AI_INCOMPLETE", FAILURES[outcome.failure]);
  }
  await settleUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage });

  const result: SecondCheckResult = { ...acceptSecondCheck(request, outcome.output), model: outcome.usage.model, independent: choice.independent && outcome.usage.model !== proposal.model, truncated };
  const recorded = await deps.recordSecondCheck({ proposalId: proposal.id, actor: input.userId, result });
  if (!recorded.ok) return fail(codeFromDatabaseError(recorded.error));
  return { ok: true, value: result };
}
