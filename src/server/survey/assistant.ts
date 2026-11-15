/**
 * The drafting assistant's turn on the server (stage 195, ADR 0210), metered like every AI action: usage is reserved first, refunded if
 * the call fails or nothing in the answer survives the checks, and settled otherwise. The answer is checked here with the same code the
 * browser uses (check.ts), so the turn's record says what was really usable. Nothing is saved to the plan: the operations go back to
 * the screen, where the surveyor applies them, and the plan is saved as an ordinary version.
 *
 * The model sees the plan as refs, names and point numbers (context.ts), never a coordinate or an area, and only the surveyor's own
 * instruction carries values.
 */
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { checkTurn } from "@/core/survey/assistant/check";
import { assistContext } from "@/core/survey/assistant/context";
import type { AssistLanguage } from "@/core/survey/assistant/languages";
import type { AssistOutput, PlanOp } from "@/core/survey/assistant/ops";
import type { SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { routeModel } from "@/server/ai/routing";
import { SURVEY_ASSIST_PROMPT, surveyAssistMessage, type SurveyAssistOutcome, type SurveyAssistant } from "@/server/ai/survey-assistant";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ModelSource } from "@/server/workspace/ai-usage";
import { fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "@/server/workspace/use-cases";

export const MANUAL_SURVEY_ASSIST = "Without AI the assistant still zooms, shows and hides layers, sets the paper and scale, moves labels and answers the area; the Lots and Plan steps have every other tool.";
export const ASSIST_LIMITS = { words: 2_000, recent: 6 } as const;

export interface SurveyAssistDeps {
  /** Records the turn (words, reply, operations as checked, outcome) and its audit event; returns its id. */
  recordAssistTurn(input: { orgId: string; actor: string; projectId: string; lang: AssistLanguage; inputMethod: "voice" | "typed"; words: string; reply: string; operations: unknown; dropped: unknown; outcome: "suggested" | "failed"; model: string }): Promise<RpcResult<string>>;
}

type Deps = WriteDeps & AiUsageDeps & SurveyAssistDeps;

const FAILURES = {
  REFUSED: "The AI declined that instruction, so it wasn't counted.",
  INCOMPLETE: "The answer came back incomplete, so it wasn't counted. Try again, or say it more simply.",
  PROVIDER_BUSY: "The AI provider is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The assistant didn't finish, so it wasn't counted. Try again.",
} as const;

/**
 * The operations as kept in the turn's record, inside the table's 64 KB check: each quote shortened, and when they're still too large
 * (a long dictation), only what kind each was. The surveyor's full words are kept beside them.
 */
export function recordedOps(ops: readonly PlanOp[]): unknown[] {
  const short = ops.map((o) => ({ ...o, quote: o.quote.slice(0, 200) }));
  return JSON.stringify(short).length <= 60_000 ? short : ops.map((o) => ({ kind: o.kind, shortened: true }));
}

export interface AssistInput {
  orgId: string;
  userId: string;
  projectId: string;
  /** The plan as it stands in the editor, unsaved edits included, already checked against the document schema. */
  document: SurveyDocument;
  points: readonly SurveyPoint[];
  selection: readonly string[];
  words: string;
  lang: AssistLanguage;
  inputMethod: "voice" | "typed";
  recent: readonly string[];
}

export async function runAssistant(deps: Deps, source: ModelSource<SurveyAssistant>, input: AssistInput, signal?: AbortSignal): Promise<WriteResult<{ turnId: string | null; output: AssistOutput; model: string }>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const words = input.words.trim();
  if (!words) return fail("INVALID_REQUEST", "Say or type an instruction first.");
  if (words.length > ASSIST_LIMITS.words) return fail("INVALID_REQUEST", `Keep one instruction under ${ASSIST_LIMITS.words.toLocaleString("en-US")} characters.`);
  const context = assistContext({ doc: input.document, points: input.points, selection: input.selection, recent: input.recent.slice(-ASSIST_LIMITS.recent), step: "plan" });
  const request = { words, lang: input.lang, plan: context.plan };

  const billing = await resolvePlan(deps, input.orgId);
  if (!billing.ok) return billing;
  const assistant = source.create(routeModel({ plan: billing.value.plan, family: source.family, step: "plan", effort: "fast" }));
  const units = reserveUnits(assistant.model, approxTokens(SURVEY_ASSIST_PROMPT) + approxTokens(surveyAssistMessage(request)) + 200, assistant.maxOutputTokens);
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: null, operation: "survey_assist", units, manual: MANUAL_SURVEY_ASSIST, billing: billing.value });
  if (!reserved.ok) return reserved;

  let outcome: SurveyAssistOutcome;
  try {
    outcome = await assistant.turn(request, signal);
  } catch {
    outcome = { ok: false, failure: "PROVIDER_ERROR", usage: null };
  }
  if (!outcome.ok) {
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail(outcome.failure === "PROVIDER_BUSY" ? "AI_BUSY" : outcome.failure === "REFUSED" ? "AI_REFUSED" : "AI_INCOMPLETE", FAILURES[outcome.failure]);
  }

  // The same checks the browser runs: what survives is what the surveyor will see.
  let usable: boolean;
  let checked: ReturnType<typeof checkTurn>;
  try {
    checked = checkTurn({ instruction: words, output: outcome.output, doc: input.document, points: input.points, selection: input.selection, refs: context.refs, inputMethod: input.inputMethod });
    usable = checked.ops.length > 0 || checked.question !== null;
  } catch {
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail("AI_INCOMPLETE", FAILURES.INCOMPLETE);
  }
  // Nothing usable came back (everything was left out, or it couldn't be done): not charged.
  if (usable) await settleUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage });
  else await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });

  // The turn's record is a record, not a gate.
  const recorded = await deps
    .recordAssistTurn({
      orgId: input.orgId,
      actor: input.userId,
      projectId: input.projectId,
      lang: input.lang,
      inputMethod: input.inputMethod,
      words,
      reply: checked.say,
      operations: recordedOps(checked.ops),
      dropped: checked.dropped.slice(0, 40).map((d) => ({ what: d.what.slice(0, 200), why: d.why.slice(0, 300) })),
      outcome: usable ? "suggested" : "failed",
      model: outcome.usage.model,
    })
    .catch(() => null);
  return { ok: true, value: { turnId: recorded && recorded.ok ? recorded.value : null, output: outcome.output, model: outcome.usage.model } };
}
