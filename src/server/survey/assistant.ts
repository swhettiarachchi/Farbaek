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
import { SURVEY_FREE_BOOST, surveyFreeBoosted } from "@/server/ai/config";
import { routeModel } from "@/server/ai/routing";
import { SURVEY_ASSIST_PROMPT, surveyAssistMessage, type SurveyAssistOutcome, type SurveyAssistant } from "@/server/ai/survey-assistant";
import { refundUsage, reserveMetered, resolveMetering, settleUsage, type AiUsageDeps, type FreeUsageDeps, type ModelSource } from "@/server/workspace/ai-usage";
import { fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "@/server/workspace/use-cases";

export const MANUAL_SURVEY_ASSIST = "Without AI the assistant still zooms, shows and hides layers, sets the paper and scale, moves labels and answers the area; the Lots and Plan steps have every other tool.";
export const ASSIST_LIMITS = { words: 2_000, recent: 6 } as const;

/** What one person may ask Survey Studio's free AI in a UTC day while it's tested (ADR 0212): instructions, drafts and photo reads. */
export const SURVEY_AI_DAILY = { assist: 300, draft: 20, read: 20 } as const;

/** Today's share for one person: more drafts and photo reads during the ten days with more free AI (stage 302), the usual after. */
export function surveyAiDaily(now: Date = new Date()): { assist: number; draft: number; read: number } {
  if (!surveyFreeBoosted(now)) return { ...SURVEY_AI_DAILY };
  return { assist: SURVEY_AI_DAILY.assist, draft: Math.max(SURVEY_AI_DAILY.draft, SURVEY_FREE_BOOST.perPerson), read: Math.max(SURVEY_AI_DAILY.read, SURVEY_FREE_BOOST.perPerson) };
}

export interface SurveyAssistDeps {
  /** Records the turn (words, reply, operations as checked, outcome) and its audit event; returns its id. */
  recordAssistTurn(input: { orgId: string; actor: string; projectId: string; lang: AssistLanguage; inputMethod: "voice" | "typed"; words: string; reply: string; operations: unknown; dropped: unknown; outcome: "suggested" | "failed"; model: string }): Promise<RpcResult<string>>;
}

type Deps = WriteDeps & AiUsageDeps & FreeUsageDeps & SurveyAssistDeps;

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
  return bytes(short) <= 60_000 ? short : ops.map((o) => ({ kind: o.kind, shortened: true }));
}

/** What was left out, as kept in the record: inside the table's 16 KB check, counted in bytes (Sinhala takes three a character). */
export function recordedDropped(dropped: readonly { what: string; why: string }[]): { what: string; why: string }[] {
  const list = dropped.slice(0, 40).map((d) => ({ what: d.what.slice(0, 160), why: d.why.slice(0, 300) }));
  while (list.length > 0 && bytes(list) > 15_000) list.pop();
  return list;
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

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

  // Free while Survey Studio is tested (ADR 0212): no plan is read, and nothing is drawn from the workspace.
  const metering = await resolveMetering(deps, input.orgId, "survey_assist");
  if (!metering.ok) return metering;
  const assistant = source.create(routeModel({ plan: metering.value.plan, family: source.family, step: "plan", effort: "fast" }));
  const units = reserveUnits(assistant.model, approxTokens(SURVEY_ASSIST_PROMPT) + approxTokens(surveyAssistMessage(request)) + 200, assistant.maxOutputTokens);
  const reserved = await reserveMetered(deps, metering.value, { orgId: input.orgId, userId: input.userId, taskId: null, operation: "survey_assist", units, manual: MANUAL_SURVEY_ASSIST });
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
      dropped: recordedDropped(checked.dropped),
      outcome: usable ? "suggested" : "failed",
      model: outcome.usage.model,
    })
    .catch(() => null);
  return { ok: true, value: { turnId: recorded && recorded.ok ? recorded.value : null, output: outcome.output, model: outcome.usage.model } };
}
