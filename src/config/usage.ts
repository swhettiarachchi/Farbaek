/**
 * Every operation that uses AI, and how room is reserved for it before it
 * runs. Usage itself is metered at the real token cost of each call
 * (src/core/billing/rate-card.ts, docs/billing/usage.md); an estimate only
 * reserves room first and is settled to the real cost afterwards.
 * The database ledger (ai_credit_ledger) accepts only these operations.
 */
export const USAGE_OPERATIONS = ["contract_draft", "change_proposal", "agent_step", "security_review", "model_gateway"] as const;

export type UsageOperation = (typeof USAGE_OPERATIONS)[number];

export const USAGE_OPERATION_LABELS: Record<UsageOperation, string> = {
  contract_draft: "Draft an intent contract",
  change_proposal: "Propose a change to project files",
  agent_step: "Agent step",
  security_review: "Security review",
  model_gateway: "Model call from an agent",
};

/** The operations a button in the web app starts directly. */
export type ButtonOperation = Extract<UsageOperation, "contract_draft" | "change_proposal">;

/**
 * Prompt tokens of a typical call, for deciding whether a button works
 * before the real prompt is known. The call itself reserves for its real
 * prompt.
 */
export const TYPICAL_PROMPT_TOKENS: Record<ButtonOperation, number> = {
  contract_draft: 2_000,
  change_proposal: 20_000,
};
