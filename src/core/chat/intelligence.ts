/**
 * Farbaek AI's intelligence layer for chat (stage 201, ADR 0215; stage 203, ADR 0220). People talk to one assistant, Farbaek AI;
 * behind it, each question goes to a model that can answer it well, with a model from the other provider standing by. Pure: the
 * server supplies what's connected, the plan, which providers are failing right now and what happened earlier in the conversation.
 *
 * The rules, in order:
 * 1. A model the person picked by hand answers, when the plan's tier includes it. An answer that's continued keeps its model.
 * 2. Otherwise Auto reads the question for free (no model call): what it's about, and how hard it looks.
 * 3. The tier: Quick and Balanced start at fast (GPT-6 Luna, the default), Thorough at standard. A hard question steps up; on paid
 *    plans so do asking again for an answer and a thumbs-down on the last one, and a short follow-up keeps the tier of the answer
 *    before it. The plan's ceiling caps it. Free reaches the standard tier only for a question that reads as hard, inside its own
 *    AI allowance.
 * 4. The provider: the lead for that tier and kind (ladder.ts). Above the fast tier, the one that answered last keeps answering
 *    while the tier holds, so a conversation doesn't flip between providers; at the fast tier GPT-6 Luna always leads. Asking again
 *    goes to the other provider than the answer it replaces: a real second opinion. A provider failing right now is routed around.
 * 5. Up to three candidates, tried in order only when one fails before writing a word: the first choice, the other provider at the
 *    same tier, then a fast model as the last resort. A workspace on its own Claude key never leaves Claude (ADR 0125).
 */
import { maxTier, TIERS, type Tier } from "@/core/agent/routing";
import { modelName } from "@/core/billing/model-names";
import { chatModel, leadAt, modelAt, type ChatProvider, type QuestionKind } from "./ladder";
import { chatModelOptions, type ChatSetup } from "./models";
import type { ChatEffort } from "./protocol";

export type { QuestionKind } from "./ladder";

/** How hard a question looks. Only steers the route; never shown as a label. */
export type Difficulty = "simple" | "moderate" | "hard";

export interface QuestionSignals {
  text: string;
  /** Pictures attached to this question. */
  images: number;
  /** PDFs and text files attached to this question. */
  documents: number;
}

export interface QuestionRead {
  kind: QuestionKind;
  difficulty: Difficulty;
  /** Pictures came with it. */
  pictures: boolean;
  /** A short question with no files: read in the light of the answer before it. */
  short: boolean;
}

// Code: only what marks real code or a programming tool. Words that are also everyday English (let, return, class, import,
// function, api, java, rust, swift) don't count on their own: "How do I return a broken kettle?" isn't code.
const CODE = /```|=>|\(\)\s*\{|[{};]\s*$|\b(?:def|const|function|class)\s+\w+\s*[({:]|\b(?:typescript|javascript|python|golang|kotlin|c\+\+|c#|regex|sql|stack ?trace|traceback|compiler?|endpoint|refactor|unit tests?|npm|pip install|git (?:commit|push|merge|rebase)|null pointer|segfault|api (?:call|key|request|endpoint))\b/im;
// Maths and logic: words that only mean maths, or a real expression (a variable set to a number, or numbers joined by ^ × ÷ *).
// Dates, "24/7", "1/2 cup" and addresses don't count.
const REASONING = /\b(?:prove|proof|derive|derivation|equation|integral|derivative|theorem|lemma|logic puzzle|how many ways|big[- ]o|time complexity)\b|\bsolve\b[^.?!\n]{0,40}(?:for [a-z]\b|=|equation|\d)|\bcalculate\b[^.?!\n]{0,60}\d|\b[a-z]\s*=\s*-?\d|\d\s*[\^×÷*]\s*\d|[∫√∑≤≥]/i;
const ANALYSIS = /\b(?:analy[sz]e|analysis|compare|comparison|summari[sz]e|summary|explain why|pros and cons|trade-?offs?|evaluate|review|research|statistics?|forecast|strategy|plan for)\b/i;
const WRITING = /\b(?:write|draft|rewrite|reword|proofread|edit my|email|letter|essay|story|poem|caption|tagline|slogan|blog post|speech|cover letter|bio|translate)\b/i;
const DEPTH = /\b(?:step[- ]by[- ]step|in (?:detail|depth)|detailed|thorough(?:ly)?|comprehensive|architecture|trade-?offs?|pros and cons|deep dive|from scratch)\b/i;
const DEBUG = /\b(?:error|exception|traceback|stack ?trace|doesn'?t work|not working|crash(?:es|ed)?|fails?|failing|broken|bug)\b/i;
/** A question worth counting: at least a few words before its question mark ("huh???" isn't three questions). */
const QUESTION = /[a-z][^?\n]{10,}\?+/gi;

/** What a question is about and how hard it looks, from its words and files. Code wins, then maths and logic, then the rest. */
export function readQuestion(q: QuestionSignals): QuestionRead {
  const text = q.text.slice(0, 8_000);
  const kind: QuestionKind = CODE.test(text)
    ? "code"
    : REASONING.test(text)
      ? "reasoning"
      : q.documents > 0 || ANALYSIS.test(text)
        ? "analysis"
        : WRITING.test(text)
          ? "writing"
          : // A long question with nothing to write is most likely something to work through.
            text.length > 1_500
            ? "analysis"
            : "everyday";
  const questions = (text.match(QUESTION) ?? []).length;
  const hard =
    kind === "reasoning" ||
    (kind === "code" && DEBUG.test(text)) ||
    DEPTH.test(text) ||
    // A long question is hard; long text to rewrite or proofread isn't, on its own.
    (text.length > 2_000 && kind !== "writing") ||
    (q.documents > 0 && ANALYSIS.test(text)) ||
    questions >= 3;
  const simple = !hard && q.documents === 0 && text.trim().length < 200 && (kind === "everyday" || kind === "writing");
  return { kind, difficulty: hard ? "hard" : simple ? "simple" : "moderate", pictures: q.images > 0, short: text.trim().length < 120 && q.documents === 0 };
}

/** Which providers are answering right now (provider-health.ts on the server). A failing one is routed around for a while. */
export interface ProviderHealth {
  anthropic: boolean;
  openai: boolean;
}

/** What happened earlier in the conversation, as far as the route needs it. */
export interface RouteSignals {
  /** The answer just before this question, when there is one. Its provider is left out when a fallback wrote it. */
  previous?: { model: string | null; provider?: ChatProvider; tier?: Tier; rating: -1 | 1 | null } | null;
  /** The person asked for this question to be answered again. */
  again?: boolean;
  /** The answer being replaced when asked again: the second opinion comes from the other provider. */
  replaced?: { model: string | null; provider?: ChatProvider } | null;
  /** An answer being continued: its model carries on, with its own reason, when the plan still allows it. */
  keep?: { model: string | null; reason?: string; tier?: Tier } | null;
}

export interface ChatCandidate {
  model: string;
  provider: ChatProvider;
  tier: Tier;
  thinking: "low" | "medium" | "high";
}

export interface ChatRoute {
  /** First the model that answers, then the ones that take over if it can't. Never empty, never more than three. */
  candidates: ChatCandidate[];
  kind: QuestionKind;
  difficulty: Difficulty;
  /** Why this model, in a few words, for the answer's details. */
  reason: string;
  /** Set when the choice differs from what the person picked: shown to them. */
  note: string | null;
}

export interface RouteSetup extends ChatSetup {
  /** The workspace answers on its own Claude key: its questions never go to another provider. */
  claudeOwnKey: boolean;
}

const REASON: Record<QuestionKind, string> = {
  code: "a question about code",
  reasoning: "maths and step-by-step reasoning",
  analysis: "careful analysis",
  writing: "writing",
  everyday: "an everyday question",
};

const HARD_REASON: Record<QuestionKind, string> = {
  code: "a hard question about code",
  reasoning: "a hard maths or logic question",
  analysis: "in-depth analysis",
  writing: "a longer piece of writing",
  everyday: "a question that needed more depth",
};

const rank = (t: Tier) => TIERS.indexOf(t);
const up = (t: Tier): Tier => TIERS[Math.min(rank(t) + 1, TIERS.length - 1)]!;
const lower = (a: Tier, b: Tier): Tier => (rank(a) <= rank(b) ? a : b);
const other = (p: ChatProvider): ChatProvider => (p === "anthropic" ? "openai" : "anthropic");

/** Thinking effort: the style asked for; at Balanced, a little more for anything that isn't simple. */
function thinkingFor(effort: ChatEffort, difficulty: Difficulty): ChatCandidate["thinking"] {
  if (effort === "quick") return "low";
  if (effort === "thorough") return "high";
  return difficulty === "simple" ? "low" : "medium";
}

/** The route for one question, or null when no AI is connected for this plan. Never a model above what the plan allows. */
export function planChatRoute(setup: RouteSetup, wanted: string, effort: ChatEffort, question: QuestionRead, health: ProviderHealth, signals: RouteSignals = {}): ChatRoute | null {
  const { kind, difficulty, pictures } = question;
  const thinking = thinkingFor(effort, difficulty);
  const can: Record<ChatProvider, boolean> = { anthropic: setup.claude, openai: setup.openai && !setup.claudeOwnKey };
  if (!can.anthropic && !can.openai) return null;
  const free = setup.plan.planId === "free" || maxTier(setup.plan) === "fast";
  const ceiling = maxTier(setup.plan);
  const at = (provider: ChatProvider, tier: Tier): ChatCandidate => ({ model: modelAt(provider, tier, kind, pictures, setup.overrides), provider, tier, thinking });
  /** The same tier from the other provider, then a fast model as the last resort: none twice, none from a provider that can't answer. */
  const standingBy = (first: ChatCandidate): ChatCandidate[] => {
    const out: ChatCandidate[] = [first];
    const add = (c: ChatCandidate | null) => {
      if (c && can[c.provider] && !out.some((o) => o.model === c.model)) out.push(c);
    };
    add(at(other(first.provider), first.tier));
    if (first.tier !== "fast") {
      // The first provider's fast model, unless that provider is failing and the other can answer instead.
      const p = can[first.provider] && (health[first.provider] || !can[other(first.provider)]) ? first.provider : other(first.provider);
      add({ ...at(p, "fast"), thinking: "low" });
    }
    return out.slice(0, 3);
  };

  // 1. An answer being continued keeps its model and its reason, when the plan still allows that model (on Free, the standard tier
  //    it was stepped up to). Nothing is said about it: the person didn't choose anything.
  const kept = signals.keep?.model ? chatModel(signals.keep.model, setup.overrides) : null;
  if (kept && can[kept.provider] && rank(kept.tier) <= rank(free ? "standard" : ceiling)) {
    return { candidates: standingBy({ model: kept.id, provider: kept.provider, tier: kept.tier, thinking }), kind, difficulty, reason: signals.keep?.reason ?? REASON[kind], note: null };
  }

  // Picked by hand.
  const options = chatModelOptions(setup);
  const picked = options.find((o) => o.id === wanted && o.id !== "auto");
  const spec = picked ? chatModel(picked.id, setup.overrides) : null;
  if (picked && picked.unavailable === null && spec && can[spec.provider]) {
    return { candidates: standingBy({ model: spec.id, provider: spec.provider, tier: spec.tier, thinking }), kind, difficulty, reason: "the model you chose", note: null };
  }
  const note = picked ? `${picked.name} isn't available here (${(picked.unavailable ?? "it isn't connected").replace(/\.$/, "").toLowerCase()}), so Farbaek AI chose for you.` : null;

  // 2 and 3. The tier.
  const previous = signals.previous ?? null;
  const prevSpec = previous?.model ? chatModel(previous.model, setup.overrides) : null;
  const prevTier = previous?.tier ?? prevSpec?.tier ?? null;
  const prevProvider = previous?.provider ?? null;
  const again = signals.again === true;
  const missed = !again && previous?.rating === -1;
  const start: Tier = effort === "thorough" ? "standard" : "fast";
  let tier = difficulty === "hard" ? up(start) : start;
  if (!free && (again || missed)) tier = up(tier);
  const followUp = !again && !free && question.short && prevTier !== null && rank(prevTier) > rank(tier);
  if (followUp) tier = prevTier!;
  // Free reaches the standard tier only for a question that reads as hard; Farbaek's cost stays inside Free's own allowance.
  tier = lower(tier, free ? (difficulty === "hard" ? "standard" : "fast") : ceiling);

  // 4. The provider.
  let lead: ChatProvider = tier !== "fast" && prevProvider && prevTier === tier && can[prevProvider] ? prevProvider : leadAt(tier, kind);
  if (again) {
    // The second opinion comes from the other provider than the answer it replaces; when that isn't known, than the one that
    // leads without the step up.
    const replaced = signals.replaced?.provider ?? (signals.replaced?.model ? chatModel(signals.replaced.model, setup.overrides)?.provider : undefined);
    lead = other(replaced ?? leadAt(lower(difficulty === "hard" ? up(start) : start, free ? (difficulty === "hard" ? "standard" : "fast") : ceiling), kind));
  }
  if (!can[lead]) lead = other(lead);
  let reason = again
    ? "a second opinion from another model"
    : missed && !free
      ? "a stronger model, after the last answer missed"
      : followUp
        ? "a follow-up, on the same model"
        : difficulty === "hard"
          ? HARD_REASON[kind]
          : REASON[kind];
  if (!health[lead] && can[other(lead)] && health[other(lead)]) {
    reason = `${reason}, while ${modelName(at(lead, tier).model)} is busy`;
    lead = other(lead);
  }

  // 5. Who stands by.
  return { candidates: standingBy(at(lead, tier)), kind, difficulty, reason, note };
}

/** Whether a failed answer may be handed to the next candidate: the provider failed, and nothing has been shown yet. */
export function mayFallBack(failure: string, aborted: boolean, wroteAnything: boolean): boolean {
  return !aborted && !wroteAnything && (failure === "PROVIDER_BUSY" || failure === "PROVIDER_ERROR");
}
