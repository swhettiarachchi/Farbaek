/**
 * Intent contracts: the structured, versioned agreement a task executes
 * against. Natural language proposes a contract; these deterministic checks
 * (and the server-side policy engine) enforce it.
 */
import { z } from "zod";
import { canonicalHash } from "../trust/canonical-json";

export const INTENT_CONTRACT_SCHEMA = "farbaek.intent-contract/v1";

const Clause = z.object({ id: z.string().min(1), statement: z.string().min(1) });

export const IntentContractSchema = z.object({
  schema: z.literal(INTENT_CONTRACT_SCHEMA),
  version: z.number().int().positive(),
  outcome: z.string().min(1),
  scope: z.object({
    organizationId: z.string().min(1),
    projectId: z.string().min(1),
    resources: z.array(z.string().min(1)).min(1),
  }),
  allowedOperations: z.array(z.string().min(1)).min(1),
  forbiddenOperations: z.array(z.string().min(1)),
  /** Fields that the task must not change, e.g. "price" or "stock". */
  protectedFields: z.array(z.string().min(1)),
  protectedInvariants: z.array(Clause),
  assumptions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  acceptanceCriteria: z
    .array(Clause.extend({ verification: z.enum(["test", "assertion", "read_back", "manual"]) }))
    .min(1),
  approvals: z.array(z.object({ gate: z.string().min(1), role: z.string().min(1) })),
  limits: z.object({
    maxRecords: z.number().int().positive().optional(),
    maxCostCents: z.number().int().nonnegative().optional(),
    maxDurationSeconds: z.number().int().positive().optional(),
    maxRetries: z.number().int().nonnegative().optional(),
  }),
  requiredChecks: z.array(z.string().min(1)),
  recovery: z.string().min(1),
});

export type IntentContract = z.infer<typeof IntentContractSchema>;

export function parseContract(input: unknown): IntentContract {
  return IntentContractSchema.parse(input);
}

export function contractHash(contract: IntentContract): Promise<string> {
  return canonicalHash(contract);
}

export interface ContractViolation {
  kind: "PROTECTED_FIELD" | "FORBIDDEN_OPERATION" | "OPERATION_NOT_ALLOWED" | "RECORD_LIMIT";
  detail: string;
}

/** Deterministic pre-execution check of a proposed action against the contract. */
export function checkActionAgainstContract(
  contract: IntentContract,
  action: { operation: string; fields: readonly string[]; recordCount: number },
): ContractViolation[] {
  const violations: ContractViolation[] = [];
  if (contract.forbiddenOperations.includes(action.operation)) {
    violations.push({ kind: "FORBIDDEN_OPERATION", detail: `${action.operation} isn't allowed by the plan.` });
  } else if (!contract.allowedOperations.includes(action.operation)) {
    violations.push({ kind: "OPERATION_NOT_ALLOWED", detail: `${action.operation} isn't one of the things the plan allows.` });
  }
  for (const field of action.fields) {
    if (contract.protectedFields.includes(field)) {
      violations.push({ kind: "PROTECTED_FIELD", detail: `${field} is protected by the plan.` });
    }
  }
  const max = contract.limits.maxRecords;
  if (max !== undefined && action.recordCount > max) {
    violations.push({ kind: "RECORD_LIMIT", detail: `${action.recordCount} records is more than this task's plan allows (${max}).` });
  }
  return violations;
}
