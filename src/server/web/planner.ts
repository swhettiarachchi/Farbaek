/**
 * Planning a turn's web research (stage 205, ADR 0222; stage 206, ADR 0223). A short, self-contained English question that
 * plainly needs the web is planned here with no model call (core/web/plan.ts). Otherwise the fast model of the provider that
 * will answer decides whether the web is needed at all and writes the searches, in at most four seconds, reading only the
 * question and the last few turns (never page text or files). Whatever it returns is checked:
 *
 * - it may say "none" only when the message's own words didn't already ask for the web ("latest", "today", "search for");
 * - a query it wrote in a language typed in English letters is read into search words or dropped;
 * - if it is late, fails or returns nonsense, the plan made here is used, and the reason is logged.
 *
 * A deep task gets a second small call after its first round: which parts of the task the pages found don't cover yet. Server-only.
 */
import type { NeedReading } from "@/core/web/intent";
import { FRESHNESS, freshnessOf, GAP_PROMPT, localPlan, parseGap, parsePlan, PLANNER_PROMPT, type SearchPlan } from "@/core/web/plan";
import { soundsLikeNews } from "@/core/web/intent";
import type { ProviderUsage } from "@/server/ai/contract-drafter";
import type { ChatModel } from "@/server/ai/chat-model";

export interface PlannerInput {
  question: string;
  /** The conversation before the question, oldest first, as plain text. */
  earlier: { role: "user" | "assistant"; text: string }[];
  /** What the message's own words say about needing the web. */
  need: NeedReading;
  /** Plan locally, without the model. */
  local: boolean;
  model: ChatModel | null;
  modelId: string | null;
  signal: AbortSignal;
  now: number;
  timeoutMs?: number;
}

export interface PlannerResult {
  /** Null when the web isn't needed for this message. */
  plan: SearchPlan | null;
  usage: ProviderUsage | null;
  via: "local" | "model" | "fallback";
  /** Why the model's plan wasn't used, for the log. */
  miss?: "late" | "no-answer" | "unreadable" | "overruled";
}

/** What the planner model reads: today's date, the last few turns, trimmed, then the latest message. */
export function plannerInput(question: string, earlier: PlannerInput["earlier"], now: number): string {
  const recent = earlier.slice(-4).map((m) => `${m.role === "user" ? "Person" : "Assistant"}: ${m.text.replace(/\s+/g, " ").slice(0, 600)}`);
  return [`Today is ${new Date(now).toISOString().slice(0, 10)}.`, recent.length > 0 ? `Conversation so far:\n${recent.join("\n")}` : "No earlier conversation.", "", `Latest message:\n${question.slice(0, 2_000)}`].join("\n");
}

const fresher = (a: SearchPlan["freshness"], b: SearchPlan["freshness"]) => (FRESHNESS.indexOf(a) <= FRESHNESS.indexOf(b) ? a : b);

export async function planSearch(input: PlannerInput): Promise<PlannerResult> {
  const year = new Date(input.now).getUTCFullYear();
  const fallback = localPlan(input.question, year);
  const wanted = input.need.need === "search" || input.need.need === "deep";
  if (input.local || !input.model?.complete || !input.modelId) return { plan: fallback, usage: null, via: "local" };
  const timeout = AbortSignal.timeout(input.timeoutMs ?? 4_000);
  const reply = await input.model.complete(
    { model: input.modelId, system: PLANNER_PROMPT, input: plannerInput(input.question, input.earlier, input.now), maxOutputTokens: 800 },
    AbortSignal.any([input.signal, timeout]),
  );
  if (!reply.text) return { plan: fallback, usage: reply.usage, via: "fallback", miss: timeout.aborted ? "late" : "no-answer" };
  const answer = parsePlan(reply.text);
  if (!answer) return { plan: fallback, usage: reply.usage, via: "fallback", miss: "unreadable" };
  if (answer.need === "none") {
    // The person's own words asked for the web: a model doesn't get to skip that.
    return wanted ? { plan: fallback, usage: reply.usage, via: "fallback", miss: "overruled" } : { plan: null, usage: reply.usage, via: "model" };
  }
  const plan: SearchPlan = {
    ...answer.plan,
    // The question's own words can ask for fresher results, or for news, than the model noticed.
    freshness: fresher(answer.plan.freshness, freshnessOf(input.question, year)),
    news: answer.plan.news || soundsLikeNews(input.question),
    depth: input.need.need === "deep" ? "deep" : answer.plan.depth,
  };
  return { plan, usage: reply.usage, via: "model" };
}

export interface GapInput {
  task: string;
  queries: readonly string[];
  /** Titles and sites of the pages the first round found: web content, read as data. */
  titles: readonly string[];
  model: ChatModel | null;
  modelId: string | null;
  signal: AbortSignal;
  timeoutMs?: number;
}

/** A deep task's second round: new searches for what the first round's pages don't cover. None when it's covered, or on any failure. */
export async function planGap(input: GapInput): Promise<{ queries: string[]; usage: ProviderUsage | null }> {
  if (!input.model?.complete || !input.modelId) return { queries: [], usage: null };
  const text = [
    `Task:\n${input.task.replace(/\s+/g, " ").slice(0, 1_200)}`,
    `Searches already run:\n${input.queries.map((q) => `- ${q}`).join("\n")}`,
    `Pages found (titles only):\n${input.titles.slice(0, 12).map((t) => `- ${t.replace(/\s+/g, " ").slice(0, 160)}`).join("\n")}`,
  ].join("\n\n");
  const reply = await input.model.complete({ model: input.modelId, system: GAP_PROMPT, input: text, maxOutputTokens: 500 }, AbortSignal.any([input.signal, AbortSignal.timeout(input.timeoutMs ?? 4_000)]));
  return { queries: reply.text ? parseGap(reply.text, input.queries) : [], usage: reply.usage };
}

/** Two calls' usage as one, when both ran on the same model. */
export function addUsage(a: ProviderUsage | null, b: ProviderUsage | null): ProviderUsage | null {
  if (!a || !b) return a ?? b;
  if (a.model !== b.model) return a;
  return {
    model: a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0),
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
  };
}
