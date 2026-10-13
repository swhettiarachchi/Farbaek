/**
 * Every operation that spends AI credits, and what it costs. This file and
 * docs/billing/ai-credits.md are the only places these numbers are defined.
 * The database ledger (ai_credit_ledger) accepts only operations listed here.
 */
export const CREDIT_COSTS = {
  /** One model call that drafts an intent contract from a task. */
  contract_draft: 1,
} as const;

export type CreditOperation = keyof typeof CREDIT_COSTS;

export const CREDIT_OPERATION_LABELS: Record<CreditOperation, string> = {
  contract_draft: "Draft an intent contract",
};
