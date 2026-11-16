/**
 * Farbaek AI's intelligence layer for chat (stage 201, ADR 0215). People talk to one assistant, Farbaek AI; behind it, each
 * question is routed to the model best placed to answer it, with a model from the other provider ready to take over when the
 * first can't answer. Pure: the server supplies what's connected, the plan, and which providers are failing right now.
 *
 * The rules, in order:
 * 1. A model the person picked by hand answers, when the plan includes it.
 * 2. Otherwise Auto routes by the question: Claude for code, analysis, long documents and writing (its strengths, and the
 *    plan's tier decides which Claude); OpenAI's model when Claude isn't connected or is failing right now.
 * 3. A second candidate from the other provider stands by, used only when the first fails before writing anything. Never on
 *    the Free plan (its one model is the cheapest), and never when the workspace answers on its own Claude key: ADR 0125 keeps
 *    that workspace's questions on the key it chose.
 */
import { maxTier, route } from "@/core/agent/routing";
import { modelName } from "@/core/billing/model-names";
import { chatModelOptions, OPENAI_CHAT_MODEL, type ChatProvider, type ChatSetup } from "./models";
import type { ChatEffort } from "./protocol";

/** What a question is mostly about, read from its words and files. Only steers the route; never shown as a label. */
export type QuestionKind = "code" | "analysis" | "writing" | "everyday";

export interface QuestionSignals {
  text: string;
  /** Pictures attached to this question. */
  images: number;
  /** PDFs and text files attached to this question. */
  documents: number;
}

const CODE = /```|\b(function|const|let|var|class|def|import|return|async|await|regex|sql|select \*|stack ?trace|exception|traceback|compile|typescript|javascript|python|java|rust|golang|kotlin|swift|c\+\+|css|html|json|yaml|api|endpoint|bug|debug|refactor|unit test)\b|[{};]\s*$|=>|\(\)\s*\{/im;
const ANALYSIS = /\b(analy[sz]e|analysis|compare|comparison|summari[sz]e|summary|explain why|pros and cons|trade-?offs?|evaluate|review|research|calculate|prove|derive|statistics?|forecast|strategy|plan for)\b/i;
const WRITING = /\b(write|draft|rewrite|reword|proofread|edit my|email|letter|essay|story|poem|caption|tagline|slogan|blog|post|speech|cover letter|bio|translate)\b/i;

/** What a question is mostly about. Code wins over the rest, then documents and analysis, then writing. */
export function readQuestion(q: QuestionSignals): QuestionKind {
  const text = q.text.slice(0, 8_000);
  if (CODE.test(text)) return "code";
  if (q.documents > 0 || text.length > 1_500 || ANALYSIS.test(text)) return "analysis";
  if (WRITING.test(text)) return "writing";
  return "everyday";
}

/** Which providers are answering right now (provider-health.ts on the server). A failing one is routed around for a while. */
export interface ProviderHealth {
  anthropic: boolean;
  openai: boolean;
}

export interface ChatCandidate {
  model: string;
  provider: ChatProvider;
  thinking: "low" | "medium" | "high";
}

export interface ChatRoute {
  /** First the model that answers, then the one that takes over if it can't. Never empty. */
  candidates: ChatCandidate[];
  kind: QuestionKind;
  /** Why this model, in a few words, for the answer's details. */
  reason: string;
  /** Set when the choice differs from what the person picked: shown to them. */
  note: string | null;
}

export interface RouteSetup extends ChatSetup {
  /** The workspace answers on its own Claude key: its questions never go to another provider. */
  claudeOwnKey: boolean;
}

const EFFORT_TO_ROUTE = { quick: "fast", balanced: "balanced", thorough: "deep" } as const;

const REASON: Record<QuestionKind, string> = {
  code: "a question about code",
  analysis: "careful analysis",
  writing: "writing",
  everyday: "an everyday question",
};

/** Thinking effort: the style asked for, with a little more for code and analysis at Balanced. */
function thinkingFor(effort: ChatEffort, kind: QuestionKind): ChatCandidate["thinking"] {
  if (effort === "quick") return "low";
  if (effort === "thorough") return "high";
  return kind === "code" || kind === "analysis" ? "medium" : "low";
}

/** The route for one question, or null when no AI is connected for this plan. Never a model the plan doesn't include. */
export function planChatRoute(setup: RouteSetup, wanted: string, effort: ChatEffort, kind: QuestionKind, health: ProviderHealth): ChatRoute | null {
  const thinking = thinkingFor(effort, kind);
  const free = maxTier(setup.plan) === "fast";
  const claude: ChatCandidate | null = setup.claude
    ? { model: route({ plan: setup.plan, family: "anthropic", step: "write", effort: EFFORT_TO_ROUTE[effort], overrides: setup.overrides }).model, provider: "anthropic", thinking }
    : null;
  const openai: ChatCandidate | null = setup.openai && !free ? { model: OPENAI_CHAT_MODEL, provider: "openai", thinking } : null;
  // A second provider stands by only on paid plans, on Farbaek's own keys.
  const crossProvider = !free && !setup.claudeOwnKey;

  const options = chatModelOptions(setup);
  const picked = options.find((o) => o.id === wanted && o.id !== "auto");
  if (picked && picked.unavailable === null && picked.provider) {
    const first: ChatCandidate = { model: picked.id, provider: picked.provider, thinking };
    const other = picked.provider === "anthropic" ? openai : claude;
    return { candidates: crossProvider && other ? [first, other] : [first], kind, reason: "the model you chose", note: null };
  }
  const note = picked ? `${picked.name} isn't available here (${picked.unavailable!.replace(/\.$/, "").toLowerCase()}), so Farbaek AI chose for you.` : null;

  // Auto: Claude first, unless it's failing right now and OpenAI isn't.
  let order: ChatCandidate[] = [claude, openai].filter((c): c is ChatCandidate => c !== null);
  if (claude && openai && !health.anthropic && health.openai) order = [openai, claude];
  if (order.length === 0) return null;
  const [first, ...rest] = order;
  const candidates = crossProvider ? [first!, ...rest.filter((c) => c.provider !== first!.provider)] : [first!];
  const reason = first!.provider === "openai" && claude ? `${REASON[kind]}, while ${modelName(claude.model)} is busy` : REASON[kind];
  return { candidates, kind, reason, note };
}

/** Whether a failed answer may be handed to the next candidate: the provider failed, and nothing has been shown yet. */
export function mayFallBack(failure: string, aborted: boolean, wroteAnything: boolean): boolean {
  return !aborted && !wroteAnything && (failure === "PROVIDER_BUSY" || failure === "PROVIDER_ERROR");
}
