/**
 * Planning a turn's web searches (stage 205, ADR 0222). A short, self-contained English first question is planned here, with
 * no model call (core/web/plan.ts). Otherwise the fast model of the provider that will answer writes the queries, in at most
 * 2.5 seconds, reading only the question and the last few turns (never page text or files). Whatever it returns is checked;
 * if it fails, is late or returns nonsense, the local plan is used. Server-only.
 */
import { localPlan, parsePlan, PLANNER_PROMPT, type SearchPlan } from "@/core/web/plan";
import type { ProviderUsage } from "@/server/ai/contract-drafter";
import type { ChatModel } from "@/server/ai/chat-model";

export interface PlannerInput {
  question: string;
  /** The conversation before the question, oldest first, as plain text. */
  earlier: { role: "user" | "assistant"; text: string }[];
  /** Plan locally, without the model. */
  local: boolean;
  model: ChatModel | null;
  modelId: string | null;
  signal: AbortSignal;
  timeoutMs?: number;
}

export interface PlannerResult {
  plan: SearchPlan;
  usage: ProviderUsage | null;
  via: "local" | "model" | "fallback";
}

/** What the planner model reads: the last few turns, trimmed, then the latest message. */
export function plannerInput(question: string, earlier: PlannerInput["earlier"]): string {
  const recent = earlier.slice(-4).map((m) => `${m.role === "user" ? "Person" : "Assistant"}: ${m.text.replace(/\s+/g, " ").slice(0, 600)}`);
  return [recent.length > 0 ? `Conversation so far:\n${recent.join("\n")}` : "No earlier conversation.", "", `Latest message:\n${question.slice(0, 2_000)}`].join("\n");
}

export async function planSearch(input: PlannerInput): Promise<PlannerResult> {
  const fallback = localPlan(input.question);
  if (input.local || !input.model?.complete || !input.modelId) return { plan: fallback, usage: null, via: "local" };
  const reply = await input.model.complete(
    { model: input.modelId, system: PLANNER_PROMPT, input: plannerInput(input.question, input.earlier), maxOutputTokens: 600 },
    AbortSignal.any([input.signal, AbortSignal.timeout(input.timeoutMs ?? 2_500)]),
  );
  const plan = reply.text ? parsePlan(reply.text) : null;
  return plan ? { plan, usage: reply.usage, via: "model" } : { plan: fallback, usage: reply.usage, via: "fallback" };
}
