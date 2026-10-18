/**
 * The shape a model fills when it drafts an intent contract, and the
 * conversion into the contract editor's fields. Model output is untrusted:
 * it is trimmed, bounded and made fail-safe here, then a person reviews it
 * in the editor, and saving runs the same validation as a hand-written
 * contract. A draft is never saved or approved on its own.
 */
import { z } from "zod";
import { EMPTY_CONTRACT_FORM, type ContractFormValues } from "./contract-form";

const VERIFICATIONS = ["test", "assertion", "read_back", "manual"] as const;

/**
 * Kept loose on purpose (no length limits): structured output follows the
 * shape, and the bounds are applied by `draftToForm` instead of failing the
 * whole response.
 */
export const ContractDraftSchema = z.object({
  outcome: z.string().describe("One or two sentences: what is true when the task is done."),
  resources: z.array(z.string()).describe("Kinds of records or files the task touches, for example products or src/components."),
  allowedOperations: z.array(z.string()).describe("Operations the task may perform, as resource.verb, for example products.update."),
  forbiddenOperations: z.array(z.string()).describe("Operations the task must not perform, as resource.verb."),
  protectedFields: z.array(z.string()).describe("Field names that must not change."),
  protectedInvariants: z.array(z.string()).describe("Statements that must stay true, for example: No orders are created or edited."),
  acceptanceCriteria: z
    .array(z.object({ statement: z.string(), verification: z.enum(VERIFICATIONS) }))
    .describe("Checkable criteria and how each is verified."),
  requiredChecks: z.array(z.string()).describe("Commands that must pass, for example pnpm test. Empty when unknown."),
  assumptions: z.array(z.string()).describe("What the draft assumes because the task did not say."),
  openQuestions: z.array(z.string()).describe("Questions a person should answer before approving."),
  recovery: z.string().describe("How to undo the change."),
  maxRecords: z.number().nullable().describe("Most records the task may change, or null when it does not change records."),
});

export type ContractDraft = z.infer<typeof ContractDraftSchema>;

const MAX_ITEMS = 20;
const MAX_ITEM_LENGTH = 300;
const MAX_TEXT_LENGTH = 1000;

/** One line, no control characters, bounded. */
function clean(text: string, max = MAX_ITEM_LENGTH): string {
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function list(values: readonly string[], options: { comma?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const v of values) {
    // Comma-separated editor fields split on commas, so a comma inside an item becomes a separator.
    const item = clean(options.comma ? v.replace(/,/g, " ") : v);
    if (item && !out.includes(item)) out.push(item);
    if (out.length === MAX_ITEMS) break;
  }
  return out;
}

/** Converts a model draft into editor fields. Anything both allowed and forbidden stays forbidden. */
export function draftToForm(draft: ContractDraft): ContractFormValues {
  const forbidden = list(draft.forbiddenOperations, { comma: true });
  const allowed = list(draft.allowedOperations, { comma: true }).filter((op) => !forbidden.includes(op));
  const acceptance = draft.acceptanceCriteria
    .map((a) => ({ statement: clean(a.statement), verification: a.verification }))
    .filter((a) => a.statement)
    .slice(0, MAX_ITEMS)
    .map((a) => (a.verification === "test" ? a.statement.replace(/^(test|assertion|read_back|manual)\s*:\s*/i, "") : `${a.verification}: ${a.statement}`));
  const maxRecords = draft.maxRecords !== null && Number.isInteger(draft.maxRecords) && draft.maxRecords >= 1 && draft.maxRecords <= 1_000_000 ? draft.maxRecords : null;

  return {
    ...EMPTY_CONTRACT_FORM,
    outcome: clean(draft.outcome, MAX_TEXT_LENGTH),
    resources: list(draft.resources, { comma: true }).join(", "),
    allowed: allowed.join("\n"),
    forbidden: forbidden.join("\n"),
    protectedFields: list(draft.protectedFields, { comma: true }).join(", "),
    invariants: list(draft.protectedInvariants).join("\n"),
    acceptance: acceptance.join("\n"),
    checks: list(draft.requiredChecks).join("\n"),
    assumptions: list(draft.assumptions).join("\n"),
    questions: list(draft.openQuestions).join("\n"),
    recovery: clean(draft.recovery, MAX_TEXT_LENGTH),
    maxRecords: maxRecords === null ? "" : String(maxRecords),
  };
}
