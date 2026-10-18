/**
 * Converts the contract editor's plain-text fields into a validated
 * IntentContract, and back. Lists are one item per line (operations, fields
 * and resources may also be comma-separated). Acceptance criteria can start
 * with "test:", "assertion:", "read_back:" or "manual:" to say how they are
 * verified; the default is "test".
 */
import { INTENT_CONTRACT_SCHEMA, IntentContractSchema, type IntentContract } from "./contract";

export interface ContractFormValues {
  outcome: string;
  resources: string;
  allowed: string;
  forbidden: string;
  protectedFields: string;
  invariants: string;
  acceptance: string;
  assumptions: string;
  questions: string;
  checks: string;
  recovery: string;
  maxRecords: string;
  maxRetries: string;
}

export const EMPTY_CONTRACT_FORM: ContractFormValues = {
  outcome: "",
  resources: "",
  allowed: "",
  forbidden: "",
  protectedFields: "",
  invariants: "",
  acceptance: "",
  assumptions: "",
  questions: "",
  checks: "",
  recovery: "",
  maxRecords: "",
  maxRetries: "",
};

type Verification = "test" | "assertion" | "read_back" | "manual";

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const items = (text: string) =>
  text
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter(Boolean);

function optionalInt(text: string, label: string): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const t = text.trim();
  if (!t) return { ok: true, value: undefined };
  if (!/^\d+$/.test(t)) return { ok: false, message: `${label} must be a whole number.` };
  return { ok: true, value: Number(t) };
}

const FIELD_LABELS: Record<string, string> = {
  outcome: "Outcome",
  "scope.resources": "Resources",
  allowedOperations: "Allowed operations",
  acceptanceCriteria: "Acceptance criteria",
  recovery: "Recovery",
};

export type ContractFromForm = { ok: true; contract: IntentContract } | { ok: false; message: string };

export function contractFromForm(values: ContractFormValues, scope: { organizationId: string; projectId: string }, version: number): ContractFromForm {
  const maxRecords = optionalInt(values.maxRecords, "Record limit");
  if (!maxRecords.ok) return maxRecords;
  const maxRetries = optionalInt(values.maxRetries, "Retry limit");
  if (!maxRetries.ok) return maxRetries;
  if (maxRecords.value === 0) return { ok: false, message: "Record limit must be at least 1." };

  const candidate = {
    schema: INTENT_CONTRACT_SCHEMA,
    version,
    outcome: values.outcome.trim(),
    scope: { organizationId: scope.organizationId, projectId: scope.projectId, resources: items(values.resources) },
    allowedOperations: items(values.allowed),
    forbiddenOperations: items(values.forbidden),
    protectedFields: items(values.protectedFields),
    protectedInvariants: lines(values.invariants).map((statement, i) => ({ id: `inv-${i + 1}`, statement })),
    assumptions: lines(values.assumptions),
    openQuestions: lines(values.questions),
    acceptanceCriteria: lines(values.acceptance).map((line, i) => {
      const match = /^(test|assertion|read_back|manual)\s*:\s*(.+)$/i.exec(line);
      const verification = (match?.[1]?.toLowerCase() ?? "test") as Verification;
      return { id: `ac-${i + 1}`, statement: match?.[2]?.trim() ?? line, verification };
    }),
    approvals: [{ gate: "before_execution", role: "contributor" }],
    limits: {
      ...(maxRecords.value !== undefined ? { maxRecords: maxRecords.value } : {}),
      ...(maxRetries.value !== undefined ? { maxRetries: maxRetries.value } : {}),
    },
    requiredChecks: lines(values.checks),
    recovery: values.recovery.trim(),
  };

  const overlap = candidate.allowedOperations.filter((op) => candidate.forbiddenOperations.includes(op));
  if (overlap.length) return { ok: false, message: `${overlap[0]} can't be both allowed and forbidden.` };

  const parsed = IntentContractSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    const label = FIELD_LABELS[path] ?? FIELD_LABELS[String(issue?.path[0] ?? "")] ?? "The contract";
    return { ok: false, message: `${label} is required.` };
  }
  return { ok: true, contract: parsed.data };
}

export function formFromContract(c: IntentContract): ContractFormValues {
  return {
    outcome: c.outcome,
    resources: c.scope.resources.join(", "),
    allowed: c.allowedOperations.join("\n"),
    forbidden: c.forbiddenOperations.join("\n"),
    protectedFields: c.protectedFields.join(", "),
    invariants: c.protectedInvariants.map((i) => i.statement).join("\n"),
    acceptance: c.acceptanceCriteria.map((a) => (a.verification === "test" ? a.statement : `${a.verification}: ${a.statement}`)).join("\n"),
    assumptions: c.assumptions.join("\n"),
    questions: c.openQuestions.join("\n"),
    checks: c.requiredChecks.join("\n"),
    recovery: c.recovery,
    maxRecords: c.limits.maxRecords?.toString() ?? "",
    maxRetries: c.limits.maxRetries?.toString() ?? "",
  };
}
