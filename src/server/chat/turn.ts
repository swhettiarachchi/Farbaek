/**
 * One turn of Farbaek Chat on the server (stage 199, ADR 0213), in two parts so the browser hears a refusal before any stream
 * opens:
 *
 * - prepareTurn checks the request against the person's own conversation, picks the model the plan allows, builds what the model
 *   will read, reserves usage for it (operation chat, or image_generation for a picture), and only then writes the question and
 *   an empty answer. A refusal here writes nothing and costs nothing.
 * - run streams the answer: text as it comes, saved every few seconds and at the end, so a stopped or interrupted answer keeps
 *   what it had. Usage settles to the real cost; a failed answer is refunded, and a stopped one pays only for what was written.
 *   The first answer of a new conversation also gets the AI's short name for it.
 */
import { createHash } from "node:crypto";
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { modelIdForName, modelName } from "@/core/billing/model-names";
import { imageSize } from "@/core/chat/files";
import { mayFallBack, planChatRoute, readQuestion, type ChatCandidate, type ProviderHealth, type RouteSetup } from "@/core/chat/intelligence";
import { CHAT_LIMITS, cleanTitle, titleFrom, type ChatFile, type ChatMessage, type TurnEvent, type TurnRequest } from "@/core/chat/protocol";
import { sniffImage } from "@/core/workspace/images";
import type { ProviderUsage } from "@/server/ai/contract-drafter";
import { CHAT_SYSTEM_PROMPT, type ChatInputMessage, type ChatModel, type ChatOutcome, type ChatPart } from "@/server/ai/chat-model";
import { languageNote, planLanguage } from "@/core/chat/language-plan";
import { modelAt } from "@/core/chat/ladder";
import { computerNote, readAction } from "@/core/chat/intent";
import { checkCitations } from "@/core/web/citations";
import { oneLine, sourceOf, webFailureNote, webNotNeededNote, webOffNote, type WebDoc } from "@/core/web/context";
import { readSearchNeed, type NeedReading } from "@/core/web/intent";
import { GAP_PROMPT, PLANNER_PROMPT, plansLocally, searchSkip } from "@/core/web/plan";
import { fitSearchMeta, type SearchMeta } from "@/core/web/sources";
import type { ResearchInput, ResearchResult } from "@/server/web/research";
import { IMAGE_OUTPUT_TOKENS, type AspectRatio, type ImageGenerator } from "@/server/ai/gemini-image";
import { log } from "@/server/observability/log";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ResolvedPlan, type UsageContext } from "@/server/workspace/ai-usage";
import { MESSAGES, codeFromDatabaseError } from "@/server/workspace/use-cases";
import type { ChatWrites, StoredFile } from "./store";

export interface ChatReads {
  path(conversationId: string, leaf: string | null, limit: number): Promise<ChatMessage[] | null>;
  files(ids: string[]): Promise<StoredFile[]>;
  pendingFiles(ids: string[]): Promise<{ id: string; kind: ChatFile["kind"]; size: number; messageId: string | null; conversationId: string | null; generated: boolean }[]>;
  conversation(id: string): Promise<{ id: string; titled: boolean; title: string; projectId: string | null } | null>;
  projectExists(id: string): Promise<boolean>;
}

export interface TurnDeps {
  /** Metering for Claude: the workspace's own key's log when it has one, otherwise its allowance. */
  claudeUsage: UsageContext & AiUsageDeps;
  /** Metering on Farbaek's keys (OpenAI and images): always the workspace's allowance. */
  usage: UsageContext & AiUsageDeps;
  writes: ChatWrites;
  reads: ChatReads;
  claude: ChatModel | null;
  openai: ChatModel | null;
  images: ImageGenerator | null;
  /** Why images can't be made here, when they can't. */
  imagesOff: string | null;
  openaiConnected: boolean;
  /** The workspace answers on its own Claude key (ADR 0125): its questions stay on that key. */
  claudeOwnKey?: boolean;
  /** Which providers are answering right now, and a way to report each answer's result (provider-health.ts). */
  health?: () => ProviderHealth;
  recordHealth?: (provider: ChatCandidate["provider"], ok: boolean) => void;
  overrides?: RouteSetup["overrides"];
  /** Checks the live web before an answer (stage 205, server/web/research.ts). Missing: every answer says the web couldn't be checked. */
  research?: (input: ResearchInput) => Promise<ResearchResult>;
  now(): number;
}

export type TurnFailure = { ok: false; status: number; message: string };

export interface PreparedTurn {
  ok: true;
  conversationId: string;
  run(emit: (e: TurnEvent) => void, signal: AbortSignal): Promise<void>;
}

const MANUAL = "Earlier answers in your chats stay readable.";
const MAX_OUTPUT = { quick: 4_096, balanced: 16_000, thorough: 32_000 } as const;
/** What the model reads at most, estimated: older messages drop off first. */
const CONTEXT_TOKENS = 120_000;
/** Messages read from the branch for context. */
const CONTEXT_MESSAGES = 80;
/** User messages back whose files the model still reads; older files are named only. */
const FILE_TURNS = 3;
const SAVE_EVERY_MS = 3_000;
/** Web text an answer may read, by tier (stage 205): a little for the fast models, more where an answer is worth more. */
const WEB_TOKENS = { fast: 3_000, standard: 6_000, strong: 8_000, frontier: 8_000 } as const;
/** A deep task reads more, on every tier (stage 206): up to twelve sources in two rounds. */
const DEEP_WEB_TOKENS = 12_000;
/** The web block's own lines (markers, header, numbered sources) beyond the page text. */
const WEB_FRAME_TOKENS = 600;
/** The planner's instructions and the conversation it reads, at most; and its reply, with room for a short think. */
const PLANNER_INPUT_TOKENS = 1_500;
const PLANNER_OUTPUT_TOKENS = 800;
/** A deep task's second small call: the task, the searches run and the titles found; and its reply. */
const GAP_INPUT_TOKENS = 1_200;
const GAP_OUTPUT_TOKENS = 500;

const CHAT_ERRORS: Record<string, { status: number; message: string }> = {
  CHAT_LIMIT: { status: 409, message: "This conversation is as long as a conversation can be. Start a new chat to carry on." },
  FILE_NOT_FOUND: { status: 404, message: "One of the attached files isn't available anymore. Remove it and attach it again." },
  TOO_MANY_FILES: { status: 409, message: "That's more files than a chat can hold at once. Remove some, then try again." },
  INVALID_MESSAGE: { status: 400, message: "Write a message or attach a file first." },
  CANNOT_CONTINUE: { status: 409, message: "Only the last answer, when it stopped part-way, can be continued." },
  ALREADY_ENDED: { status: 409, message: "That answer has already ended." },
  STORAGE_FULL: { status: 409, message: "Your chat files in this workspace have reached 300 MB. Delete older chats with files to make room." },
};

/** A database refusal as the person reads it. */
export function chatFailure(error: string): TurnFailure {
  const known = Object.keys(CHAT_ERRORS).find((code) => error.includes(code));
  if (known) return { ok: false, ...CHAT_ERRORS[known]! };
  const code = codeFromDatabaseError(error);
  const status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" || code === "WORKSPACE_SUSPENDED" ? 403 : code === "PAUSED_BY_FARBAEK" ? 503 : 409;
  return { ok: false, status, message: code === "NOT_FOUND" ? "That conversation doesn't exist or isn't yours." : MESSAGES[code] };
}

const refused = (status: number, message: string): TurnFailure => ({ ok: false, status, message });

const FAILED_TEXT: Record<string, string> = {
  REFUSED: "The AI declined to answer that, so it wasn't counted.",
  INCOMPLETE: "The answer didn't finish, so it wasn't counted. If you attached a file, try again without it.",
  PROVIDER_BUSY: "The AI is busy right now, so this wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The answer didn't finish, so it wasn't counted. Try again.",
};
const FAILED_IMAGE: Record<string, string> = {
  REFUSED: "The image service declined to make that picture, so it wasn't counted. Reword the description and try again.",
  INCOMPLETE: "No picture came back, so it wasn't counted. Try again, or reword the description.",
  PROVIDER_BUSY: "The image service is busy, so this wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The picture wasn't made, so it wasn't counted. Try again in a minute.",
};

function fileTokens(f: { kind: ChatFile["kind"]; size: number }): number {
  if (f.kind === "image") return 1_600;
  if (f.kind === "pdf") return Math.min(100_000, Math.ceil(f.size * 0.08));
  return Math.ceil(f.size / 3);
}

function messageTokens(m: { content: string; files: { kind: ChatFile["kind"]; size: number }[] }, withFiles: boolean): number {
  return approxTokens(m.content) + 8 + (withFiles ? m.files.reduce((n, f) => n + fileTokens(f), 0) : m.files.length * 12);
}

interface ContextMessage {
  id: string;
  role: "user" | "assistant";
  kind: "text" | "image";
  content: string;
  status: ChatMessage["status"];
  files: { id: string; name: string; kind: ChatFile["kind"]; size: number; generated: boolean }[];
}

/** The messages the model reads: the branch, newest last, trimmed to fit, with files for the last few questions only. */
export function fitContext(messages: ContextMessage[], budget: number = CONTEXT_TOKENS): { kept: ContextMessage[]; withFiles: Set<string>; tokens: number } {
  const withFiles = new Set<string>();
  let turns = 0;
  for (let i = messages.length - 1; i >= 0 && turns < FILE_TURNS; i--) {
    const m = messages[i]!;
    if (m.role === "user" && m.files.length > 0) {
      withFiles.add(m.id);
      turns++;
    }
  }
  const kept: ContextMessage[] = [];
  let tokens = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const cost = messageTokens(m, withFiles.has(m.id));
    if (kept.length > 0 && tokens + cost > budget) break;
    kept.unshift(m);
    tokens += cost;
  }
  // The model's conversation starts with a question.
  while (kept.length > 1 && kept[0]!.role !== "user") kept.shift();
  return { kept, withFiles, tokens };
}

/** Adds this turn's web results after the person's latest message, for the model only (stage 205). */
function withContext(messages: ChatInputMessage[], text: string): void {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (last) last.parts.push({ type: "context", text });
}

/** When this server has no live web search set up: the answer says so, honestly. */
function noResearch(now: number): ResearchResult {
  const at = new Date(now);
  const reason = "live web search isn't set up on this server";
  return { context: webFailureNote(reason, at), meta: { at: at.toISOString(), status: "failed", queries: [], reason, sources: [] }, plannerUsage: null, docs: [] };
}

/** Turns the kept messages into the model's input, reading file contents for the ones that carry them. */
async function toModelInput(reads: ChatReads, context: { kept: ContextMessage[]; withFiles: Set<string> }): Promise<ChatInputMessage[]> {
  const ids = context.kept.filter((m) => context.withFiles.has(m.id)).flatMap((m) => m.files.map((f) => f.id));
  const contents = new Map((await reads.files(ids)).map((f) => [f.id, f]));
  const out: ChatInputMessage[] = [];
  for (const m of context.kept) {
    const parts: ChatPart[] = [];
    if (m.role === "user") {
      for (const f of m.files) {
        const stored = context.withFiles.has(m.id) ? contents.get(f.id) : undefined;
        if (!stored) {
          parts.push({ type: "text", text: `[${f.name} was attached earlier in the conversation.]` });
          continue;
        }
        if (stored.kind === "image") parts.push({ type: "image", mime: stored.mime, data: stored.content });
        else if (stored.kind === "pdf") parts.push({ type: "pdf", name: stored.name, data: stored.content });
        else parts.push({ type: "document", name: stored.name, text: Buffer.from(stored.content, "base64").toString("utf8") });
      }
      parts.push({ type: "text", text: m.content });
    } else if (m.kind === "image") {
      parts.push({ type: "text", text: m.status === "complete" ? "[An image was made for this request with Farbaek's image tool.]" : "[The image wasn't made.]" });
    } else {
      parts.push({ type: "text", text: m.content || "(no answer)" });
    }
    // Two messages from the same side in a row are joined, as the providers expect turns to alternate.
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.parts.push(...parts);
    else out.push({ role: m.role, parts });
  }
  return out;
}

const asContext = (m: ChatMessage): ContextMessage => ({ id: m.id, role: m.role, kind: m.kind, content: m.content, status: m.status, files: m.files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, size: f.size, generated: f.generated })) });

/** Checks the turn, reserves usage and writes the question and an empty answer. Nothing is written when it fails. */
export async function prepareTurn(deps: TurnDeps, input: { orgId: string; userId: string; request: TurnRequest }): Promise<TurnFailure | PreparedTurn> {
  const { orgId, userId, request } = input;
  const actor = userId;

  // 1. What the turn builds on.
  const conversationId: string | null = request.conversationId;
  let questionParent: string | null = null;
  let base: ChatMessage[] = [];
  let questionText: string | null = null;
  let questionFiles: string[] = [];
  let existingQuestion: ChatMessage | null = null;
  let continuing: ChatMessage | null = null;
  let conversationTitled = false;

  if (conversationId) {
    const conversation = await deps.reads.conversation(conversationId);
    if (!conversation) return refused(404, "That conversation doesn't exist or isn't yours.");
    // Named by the person; the question's first words are only a stand-in until the AI names it.
    conversationTitled = conversation.titled;
  }

  if (request.action === "send") {
    questionText = request.text;
    questionFiles = request.files;
    questionParent = request.parentId;
    if (request.parentId) {
      if (!conversationId) return refused(400, "That message isn't in a conversation.");
      const path = await deps.reads.path(conversationId, request.parentId, CONTEXT_MESSAGES);
      if (!path || path.length === 0 || path[path.length - 1]!.role !== "assistant") return refused(404, "That conversation doesn't exist or isn't yours.");
      if (path[path.length - 1]!.status === "streaming") return refused(409, "Wait for the answer to finish, or stop it, before asking again.");
      base = path;
    } else if (conversationId) {
      return refused(400, "That message isn't in this conversation.");
    }
    if (request.projectId && !conversationId && !(await deps.reads.projectExists(request.projectId))) return refused(404, "That project doesn't exist or isn't in this workspace.");
  } else {
    const path = await deps.reads.path(conversationId!, request.messageId, CONTEXT_MESSAGES);
    const target = path?.[path.length - 1];
    if (!path || !target || target.id !== request.messageId) return refused(404, "That message doesn't exist or isn't yours.");
    if (request.action === "edit") {
      if (target.role !== "user") return refused(400, "Only your own messages can be edited.");
      questionText = request.text;
      questionFiles = request.files;
      questionParent = target.parentId;
      base = path.slice(0, -1);
    } else if (request.action === "regenerate") {
      if (target.role !== "user") return refused(400, "Choose the question to answer again.");
      existingQuestion = target;
      base = path;
    } else {
      if (target.role !== "assistant" || target.kind !== "text" || (target.status !== "stopped" && !(target.status === "complete" && target.meta.stop === "length"))) {
        return refused(409, "Only an answer that stopped part-way can be continued.");
      }
      continuing = target;
      base = path;
    }
  }

  const mode = request.action === "continue" ? "text" : request.mode;
  if (questionText !== null) {
    const trimmed = questionText.trim();
    if (!trimmed && questionFiles.length === 0) return refused(400, "Write a message or attach a file first.");
    if (mode === "image" && (trimmed.length < 3 || trimmed.length > CHAT_LIMITS.imagePrompt)) return refused(400, `Describe the image in 3 to ${CHAT_LIMITS.imagePrompt.toLocaleString("en-US")} characters.`);
  }
  if (mode === "image" && existingQuestion && (existingQuestion.content.trim().length < 3 || existingQuestion.content.length > CHAT_LIMITS.imagePrompt)) {
    return refused(400, `Describe the image in 3 to ${CHAT_LIMITS.imagePrompt.toLocaleString("en-US")} characters.`);
  }

  // Files on a new question: the person's own, either waiting to be sent or (when editing) on this conversation's messages.
  const pending = await deps.reads.pendingFiles(questionFiles);
  if (pending.length !== new Set(questionFiles).size) return refused(404, "One of the attached files isn't available anymore. Remove it and attach it again.");
  if (pending.some((f) => f.messageId !== null && f.conversationId !== conversationId)) return refused(404, "One of the attached files isn't available anymore. Remove it and attach it again.");
  // A picture the AI made in this conversation is a starting point for a new one ("Change it"), never attached to the question.
  const made = pending.filter((f) => f.generated);
  if (made.length > 0 && (mode !== "image" || made.some((f) => f.kind !== "image" || f.conversationId !== conversationId))) {
    return refused(400, "A picture made here can be changed with Create an image switched on. To ask about it, download it and attach it.");
  }
  const madeIds = made.map((f) => f.id);
  questionFiles = pending.filter((f) => !f.generated).map((f) => f.id);

  // 2. The plan, and the model or image tool that answers.
  const plan = await resolvePlan(deps.usage, orgId);
  if (!plan.ok) return refused(503, plan.message);

  const newQuestion: ContextMessage | null =
    questionText !== null
      ? {
          id: "new",
          role: "user",
          kind: "text",
          content: questionText,
          status: "complete",
          files: pending.filter((f) => !f.generated).map((f) => ({ id: f.id, name: "file", kind: f.kind, size: f.size, generated: false })),
        }
      : null;

  if (mode === "image") return prepareImage(deps, { orgId, actor, plan: plan.value, request, conversationId, questionParent, base, questionText, questionFiles, madeIds, newQuestion, existingQuestion, conversationTitled });

  // Farbaek AI's route (ADR 0215): the model best placed for this question, and one from the other provider standing by.
  const setup: RouteSetup = { plan: plan.value.plan, claude: deps.claude !== null, openai: deps.openai !== null && deps.openaiConnected, overrides: deps.overrides, claudeOwnKey: deps.claudeOwnKey ?? false };
  const asked = newQuestion ?? existingQuestion;
  const askedFiles = newQuestion?.files ?? existingQuestion?.files ?? [];
  const read = readQuestion({
    text: questionText ?? existingQuestion?.content ?? continuing?.content ?? "",
    images: askedFiles.filter((f) => f.kind === "image").length,
    documents: asked ? askedFiles.filter((f) => f.kind !== "image").length : 0,
  });
  // The language to answer in (stage 204, ADR 0221): read from the person's own words in this branch, never stored, and sent as a
  // short note beside the system prompt. The messages themselves go to the model unchanged. Asked again or continued, the question
  // is the last one the person wrote.
  const userTexts = base.filter((m) => m.role === "user").map((m) => m.content);
  const asking = questionText ?? userTexts.pop() ?? "";
  const languagePlan = planLanguage({ message: asking, earlier: userTexts, preference: request.language });
  const guidance = languageNote(languagePlan) ?? undefined;
  // Live web search (stage 205, ADR 0222): every text question checks the web first, unless it's continuing an answer, only an
  // acknowledgement, or the person switched it off. (Pictures returned earlier.)
  const skip = searchSkip({ action: request.action, mode, text: asking, webOn: "web" in request ? (request.web ?? true) : true });
  // Whether the message needs the web at all (stage 206, ADR 0223), read from its own words: a greeting, a poem or the person's
  // own text to rewrite starts at once; "latest", a price or a request to search is searched; anything unclear is the planner
  // model's to decide. "Check the web" on an answer asks for a search whatever the words look like.
  const forced = "research" in request && request.research === "search";
  // A request to do something on the person's computer (stage 206): Chat can't, and the model is told so in so many words.
  const action = skip ? null : readAction(asking);
  const read0 = skip ? null : readSearchNeed({ text: asking, files: askedFiles.length, year: new Date(deps.now()).getUTCFullYear() });
  // A request to act never outranks words that ask for the web ("open my browser and check today's news" is still searched).
  const actsOnly = action !== null && read0 !== null && (read0.need === "none" || read0.need === "unsure");
  const need: NeedReading | null = !read0 ? null : forced ? { need: read0.need === "deep" ? "deep" : "search", explicit: true, why: "asked to check the web" } : actsOnly ? { need: "none", explicit: false, why: "a request to act on the computer" } : read0;
  const notNeeded = need?.need === "none";
  // The conversation the search planner may read: the turns before this question.
  const earlierTurns = base.filter((m) => m.kind === "text" && m.content).map((m) => ({ role: m.role, text: m.content }));
  if (questionText === null && earlierTurns.at(-1)?.role === "user") earlierTurns.pop();
  // What the route needs from earlier (stage 203): the answer before this question, and whether this question is being asked again.
  const before = [...base].reverse().find((m) => m.role === "assistant" && m.kind === "text");
  const previous = before ? { model: modelIdForName(before.modelName), tier: before.meta.tier, provider: before.meta.provider, rating: before.rating } : null;
  // Asked again: the answer it replaces, read back only when it really is an answer to this question in this conversation.
  let replaced: { model: string | null; provider?: "anthropic" | "openai" } | null = null;
  if (request.action === "regenerate" && request.replacing && existingQuestion) {
    const found = (await deps.reads.path(conversationId!, request.replacing, 1))?.at(-1);
    if (found && found.id === request.replacing && found.role === "assistant" && found.parentId === existingQuestion.id) replaced = { model: modelIdForName(found.modelName), provider: found.meta.provider };
  }
  // An answer that's continued keeps the model that started it and its reason, when the plan still allows that model.
  const keep = continuing ? { model: modelIdForName(continuing.modelName), reason: continuing.meta.why, tier: continuing.meta.tier } : null;
  const routed = planChatRoute(setup, request.model, request.effort, read, deps.health?.() ?? { anthropic: true, openai: true }, { previous, again: request.action === "regenerate", replaced, keep });
  if (!routed) return refused(503, "AI isn't connected on this server yet. Earlier answers in your chats stay readable.");
  const choice = { ...routed.candidates[0]!, note: routed.note };
  const modelFor = (c: ChatCandidate) => (c.provider === "anthropic" ? deps.claude! : deps.openai!);
  // Both candidates meter the same way: a second provider only stands by on Farbaek's own keys (intelligence.ts).
  const meter = choice.provider === "anthropic" ? deps.claudeUsage : deps.usage;

  const contextMessages = [...base.map(asContext), ...(newQuestion ? [newQuestion] : [])];
  if (continuing) contextMessages[contextMessages.length - 1] = asContext(continuing);
  // The search planner runs unless the message plainly needs the web and is a short, self-contained English first question,
  // which is planned without a model. It may turn a question into a deep task, so the room for one is kept whenever it runs.
  const searching = !skip && !notNeeded && need !== null;
  const plansHere = searching && need.need === "search" && plansLocally(asking, userTexts.length);
  const wantsPlanner = searching && !plansHere && Boolean(modelFor(choice).complete);
  // The web text this answer may read comes out of the conversation's room, and goes into the reservation.
  const webTokens = !searching ? 0 : (wantsPlanner ? Math.max(DEEP_WEB_TOKENS, WEB_TOKENS[choice.tier]) : WEB_TOKENS[choice.tier]) + WEB_FRAME_TOKENS;
  const context = fitContext(contextMessages, CONTEXT_TOKENS - webTokens);
  const maxOutput = MAX_OUTPUT[request.effort];
  // The AI names a chat with its first answer that finishes: a first answer that failed leaves it to the next.
  const needsTitle = !conversationId || (!conversationTitled && !base.some((m) => m.role === "assistant" && m.status === "complete"));
  // Enough for whichever candidate answers: the one standing by may cost more per word.
  const units = Math.max(...routed.candidates.map((c) => reserveUnits(c.model, context.tokens + webTokens + approxTokens(CHAT_SYSTEM_PROMPT) + approxTokens(guidance ?? "") + (needsTitle ? 1_400 : 200), maxOutput + (needsTitle ? 600 : 0))));

  const reserved = await reserveUsage(meter, { orgId, userId, taskId: null, operation: "chat", units, manual: MANUAL, billing: plan.value });
  if (!reserved.ok) return refused(reserved.code === "QUOTA_EXCEEDED" || reserved.code === "TRIAL_CAP_REACHED" ? 402 : reserved.code === "PLATFORM_DAILY_LIMIT" ? 429 : 503, reserved.message);
  const refund = (reason: "failed" | "stopped", usage: ProviderUsage | null = null) => refundUsage(meter, { orgId, entryId: reserved.value.entryId, usage, reason });

  // The search planner: the answering provider's fast model decides whether the web is needed and writes the searches, on its
  // own small reservation (with room for a deep task's second small call). If that can't be reserved, the plan is made locally.
  let planner: { model: string; entryId: string } | null = null;
  if (wantsPlanner) {
    const plannerModel = modelAt(choice.provider, "fast", read.kind, false, deps.overrides);
    const units = reserveUnits(plannerModel, approxTokens(PLANNER_PROMPT) + PLANNER_INPUT_TOKENS + approxTokens(GAP_PROMPT) + GAP_INPUT_TOKENS, PLANNER_OUTPUT_TOKENS + GAP_OUTPUT_TOKENS);
    const held = await reserveUsage(meter, { orgId, userId, taskId: null, operation: "chat", units, manual: MANUAL, billing: plan.value });
    if (held.ok) planner = { model: plannerModel, entryId: held.value.entryId };
  }
  const settlePlanner = async (usage: ProviderUsage | null) => {
    if (!planner) return;
    if (usage) await settleUsage(meter, { orgId, entryId: planner.entryId, usage });
    else await refundUsage(meter, { orgId, entryId: planner.entryId, usage: null, reason: "failed" });
  };

  // 3. The writes: the conversation, the question and an empty answer.
  const written = await writeQuestionAndAnswer(deps, { orgId, actor, request, conversationId, questionParent, questionText, questionFiles, existingQuestion, continuing, kind: "text", model: choice.model });
  if (!written.ok) {
    await refund("failed");
    await settlePlanner(null);
    return written;
  }
  const { conversationId: convId, question, answerId, created } = written;

  const keptMessages = context.kept.map((m) => (m.id === "new" ? { ...m, id: question?.id ?? m.id, files: question?.files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, size: f.size, generated: f.generated })) ?? m.files } : m));
  const withFiles = new Set([...context.withFiles].map((id) => (id === "new" ? (question?.id ?? id) : id)));
  const modelInput = await toModelInput(deps.reads, { kept: keptMessages, withFiles });
  const prior = continuing?.content ?? "";
  if (continuing) {
    // A continued answer doesn't search again: it keeps citing the sources it started with (stage 205).
    const sources = continuing.meta.search?.sources ?? [];
    const parts: ChatPart[] = [{ type: "text", text: "Continue your previous answer from exactly where it stopped. Don't repeat anything you already wrote, and don't comment on continuing." }];
    if (sources.length > 0) parts.push({ type: "context", text: `The web sources that answer was using, to keep citing as before:\n${sources.map((s) => `[${s.n}] ${oneLine(s.title)} | ${oneLine(s.site, 120)} | ${s.url}`).join("\n")}` });
    modelInput.push({ role: "user", parts });
  }

  const answer: ChatMessage = {
    id: answerId,
    parentId: continuing ? continuing.parentId : (question?.id ?? existingQuestion!.id),
    role: "assistant",
    kind: "text",
    content: prior,
    status: "streaming",
    modelName: modelName(choice.model),
    error: null,
    rating: null,
    thinkingMs: null,
    // A continued answer keeps showing its sources while it carries on.
    meta: { why: routed.reason, ...(continuing?.meta.search ? { search: continuing.meta.search } : {}) },
    createdAt: continuing?.createdAt ?? new Date(deps.now()).toISOString(),
    siblings: continuing?.siblings ?? [answerId],
    files: [],
  };

  return {
    ok: true,
    conversationId: convId,
    async run(emit, signal) {
      emit({ type: "start", conversationId: convId, created, question, answer, note: choice.note });
      let text = prior;
      let added = "";
      let thinkingAt: number | null = null;
      let thinkingMs: number | null = null;
      let thoughtChars = 0;
      let lastSave = deps.now();
      let saving: Promise<unknown> = Promise.resolve();
      let answering: ChatCandidate = routed.candidates[0]!;
      let fellBack = false;
      const save = (status: "streaming" | "complete" | "stopped" | "failed", error: string | null, meta: Record<string, unknown> | null) =>
        deps.writes.writeReply({ orgId, actor, messageId: answerId, content: text, status, model: fellBack ? answering.model : null, error, thinkingMs, meta });
      // Saved every few seconds while it streams and while the model thinks, so a live answer is never taken for an abandoned one.
      const heartbeat = () => {
        if (deps.now() - lastSave <= SAVE_EVERY_MS) return;
        lastSave = deps.now();
        // One save at a time; a slow save never holds up the stream.
        saving = saving.then(() => save("streaming", null, null)).catch(() => undefined);
      };
      const handlers = {
        onThinking(summary: string) {
          if (thinkingAt === null) thinkingAt = deps.now();
          thoughtChars += summary.length;
          emit({ type: "thinking", v: summary });
          heartbeat();
        },
        onText(delta: string) {
          if (thinkingAt !== null && thinkingMs === null) thinkingMs = deps.now() - thinkingAt;
          if (text.length + delta.length > 190_000) return;
          text += delta;
          added += delta;
          emit({ type: "text", v: delta });
          heartbeat();
        },
      };
      const askOnce = async (messages: ChatInputMessage[]): Promise<ChatOutcome> => {
        try {
          return await modelFor(answering).stream({ model: answering.model, thinking: answering.thinking, system: CHAT_SYSTEM_PROMPT, guidance, messages, maxOutputTokens: maxOutput }, handlers, signal);
        } catch {
          return { ok: false, failure: "PROVIDER_ERROR", usage: null, aborted: signal.aborted };
        }
      };
      // Each candidate in turn: when one fails before writing a word, the next takes the question, and the person is told.
      // A workspace's own Claude key failing says nothing about Anthropic for everyone else: it isn't recorded.
      const record = (provider: ChatCandidate["provider"], ok: boolean) => {
        if (provider === "anthropic" && deps.claudeOwnKey) return;
        deps.recordHealth?.(provider, ok);
      };
      const ask = async (messages: ChatInputMessage[]): Promise<ChatOutcome> => {
        let result = await askOnce(messages);
        for (const next of routed.candidates.slice(routed.candidates.indexOf(answering) + 1)) {
          if (result.ok || !mayFallBack(result.failure, result.aborted, added.length > 0)) break;
          record(answering.provider, false);
          answering = next;
          fellBack = true;
          thinkingAt = null;
          thoughtChars = 0;
          try {
            emit({
            type: "route",
            modelName: modelName(next.model),
            note: next.tier === "fast" && routed.candidates[0]!.tier !== "fast" ? "The stronger models didn't answer, so a faster one did." : "That model didn't answer, so Farbaek AI asked another.",
          });
          } catch {
            // Gone.
          }
          result = await askOnce(messages);
        }
        if (result.ok) record(answering.provider, true);
        else if (!result.aborted && (result.failure === "PROVIDER_BUSY" || result.failure === "PROVIDER_ERROR")) record(answering.provider, false);
        return result;
      };

      // Live web search (stage 205, ADR 0222), before the model is asked, with its progress on screen. The results go after the
      // question for this answer only: the question as saved stays the person's own words. A continued answer keeps its sources.
      const tell = (e: TurnEvent) => {
        try {
          emit(e);
        } catch {
          // The browser has gone; the answer carries on and is saved.
        }
      };
      let searchMeta: SearchMeta | null = continuing?.meta.search ?? null;
      let webContext: string | null = null;
      // The pages as the model read them, kept only to check this answer's citations against.
      let webDocs: WebDoc[] = [];
      if (searching && need) {
        const result = deps.research
          ? await deps.research({
              question: asking,
              earlier: earlierTurns,
              need,
              local: planner === null,
              plannerModel: planner ? modelFor(choice) : null,
              plannerModelId: planner?.model ?? null,
              budgetChars: WEB_TOKENS[choice.tier] * 3,
              deepBudgetChars: Math.max(DEEP_WEB_TOKENS, WEB_TOKENS[choice.tier]) * 3,
              signal,
              onStage: (s) => {
                // A deep task can take half a minute before the first word: the answer is kept marked as live meanwhile.
                heartbeat();
                tell({ type: "search", ...s });
              },
            })
          : noResearch(deps.now());
        await settlePlanner(result.plannerUsage);
        webContext = result.context;
        searchMeta = result.meta;
        webDocs = result.docs;
        tell({ type: "search", stage: result.meta.status === "done" ? "done" : result.meta.status === "skipped" ? "skipped" : "failed", search: result.meta });
      } else if (skip === "off") {
        const at = new Date(deps.now());
        webContext = webOffNote(at);
        searchMeta = { at: at.toISOString(), status: "off", queries: [], sources: [] };
        tell({ type: "search", stage: "off", search: searchMeta });
      } else if (notNeeded) {
        // Nothing to look up: the answer starts at once, and the model knows the web wasn't checked.
        const at = new Date(deps.now());
        webContext = action ? `${computerNote(action)}\n${webNotNeededNote(at)}` : webNotNeededNote(at);
        searchMeta = { at: at.toISOString(), status: "skipped", queries: [], reason: action ? "this was a request to act on the computer" : "this message didn't need current information", sources: [] };
        tell({ type: "search", stage: "skipped", search: searchMeta });
      }
      // A request to act on the computer that was searched anyway (the person asked for a search) still carries its note.
      if (action && searching && webContext) webContext = `${computerNote(action)}\n${webContext}`;
      if (webContext) withContext(modelInput, webContext);

      let outcome = await ask(modelInput);
      // A file the provider can't read (too large, locked, damaged) would fail every later question too. Asked once more without the
      // files of earlier questions, so one bad file doesn't break the conversation.
      const newest = [...keptMessages].reverse().find((m) => m.role === "user")?.id;
      const older = [...withFiles].filter((id) => id !== newest);
      if (!outcome.ok && !outcome.aborted && outcome.failure === "INCOMPLETE" && !added && thinkingAt === null && older.length > 0) {
        const lean = await toModelInput(deps.reads, { kept: keptMessages, withFiles: new Set(newest && withFiles.has(newest) ? [newest] : []) });
        if (webContext) withContext(lean, webContext);
        outcome = await ask(continuing ? [...lean, ...modelInput.slice(-1)] : lean);
      }
      await saving;
      if (thinkingAt !== null && thinkingMs === null) thinkingMs = deps.now() - thinkingAt;

      let status: "complete" | "stopped" | "failed";
      let error: string | null = null;
      let stop: "length" | "refusal" | null = null;
      if (outcome.ok) {
        stop = outcome.stop === "end" ? null : outcome.stop;
        status = outcome.stop === "refusal" && !added.trim() ? "failed" : "complete";
        if (status === "failed") error = FAILED_TEXT.REFUSED!;
      } else if (outcome.aborted) {
        status = "stopped";
      } else {
        status = "failed";
        error = FAILED_TEXT[outcome.failure] ?? FAILED_TEXT.PROVIDER_ERROR!;
      }
      // The answer's citations (stage 206): which sources it cites, and whether the names and numbers of each cited sentence are
      // on the page it cites. A hint for the reader, saved with the sources and sent to the screen before the answer ends.
      if (searchMeta?.status === "done" && (searchMeta.sources.length > 0 || webDocs.length > 0) && text.trim()) {
        // Against every page the model was given, not only the ones that fitted in the saved list: a source it read and cites
        // is kept, and one it doesn't cite goes first when there isn't room (fitSearchMeta).
        const given = webDocs.length > 0 ? webDocs.map(sourceOf) : searchMeta.sources;
        const checked = checkCitations(text, given, webDocs);
        searchMeta = fitSearchMeta({ ...searchMeta, sources: checked.sources, checks: checked.checks });
        if (checked.checks.invalid > 0 || checked.checks.unmatched > 0) log("info", "chat.citations", checked.checks);
        tell({ type: "search", stage: "done", search: searchMeta });
      }
      // The answer's own facts, written whole: a continued answer no longer says it reached its length limit.
      // The route's facts are kept with the answer: the next question reads its tier and provider, and ratings can later be read by kind.
      const route = { why: routed.reason, kind: routed.kind, difficulty: routed.difficulty, tier: answering.tier, provider: answering.provider, ...(fellBack ? { fallback: true } : {}) };
      const finalSave = await save(status, error, { ...(stop ? { stop } : {}), route, ...(searchMeta ? { search: searchMeta } : {}) });
      if (!finalSave.ok) log("error", "chat.save_failed", { status, reason: finalSave.error.slice(0, 120) });
      try {
        emit({ type: "done", status, error, thinkingMs, modelName: modelName(outcome.usage?.model ?? answering.model), stop });
      } catch {
        // The browser has gone; what was written is saved.
      }

      // The conversation's name, from its first answer; shown only when it was used (the person may have named it meanwhile).
      let usage = outcome.usage;
      if (needsTitle && status === "complete" && added.trim()) {
        const named = await modelFor(answering).title({ model: answering.model, question: questionText ?? "", answer: text }, AbortSignal.timeout(20_000));
        const title = named.title ? cleanTitle(named.title) : null;
        if (title) {
          const applied = await deps.writes.autoTitle({ orgId, actor, conversationId: convId, title });
          if (applied.ok && applied.value) {
            try {
              emit({ type: "title", title });
            } catch {
              // Gone.
            }
          }
        }
        if (usage && named.usage && named.usage.model === usage.model) {
          usage = {
            ...usage,
            inputTokens: usage.inputTokens + named.usage.inputTokens,
            outputTokens: usage.outputTokens + named.usage.outputTokens,
            cacheWriteTokens: (usage.cacheWriteTokens ?? 0) + (named.usage.cacheWriteTokens ?? 0),
            cacheReadTokens: (usage.cacheReadTokens ?? 0) + (named.usage.cacheReadTokens ?? 0),
          };
        }
      }

      // Settling: what was answered is paid for, a failure isn't, and a stopped answer pays for what it read, thought and wrote. A
      // provider reports little for a stopped call, so thinking is counted from its summary and how long it lasted.
      if (status === "complete") {
        if (usage) await settleUsage(meter, { orgId, entryId: reserved.value.entryId, usage });
        else await refund("failed");
      } else if (status === "stopped") {
        const thought = thinkingAt === null ? 0 : Math.min(maxOutput, Math.max(thoughtChars, Math.round(((thinkingMs ?? 0) / 1_000) * 30)));
        const wrote = approxTokens(added) + thought;
        if (wrote > 0) {
          const reported = usage && usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) > 0 ? usage : null;
          const spent: ProviderUsage = reported
            ? { ...reported, outputTokens: Math.max(reported.outputTokens, wrote) }
            : { model: usage?.model ?? answering.model, inputTokens: context.tokens + approxTokens(CHAT_SYSTEM_PROMPT) + approxTokens(guidance ?? "") + approxTokens(webContext ?? ""), outputTokens: Math.max(usage?.outputTokens ?? 0, wrote), cacheWriteTokens: 0, cacheReadTokens: 0 };
          await settleUsage(meter, { orgId, entryId: reserved.value.entryId, usage: spent });
        } else await refund("stopped", usage);
      } else await refund("failed", usage);
    },
  };
}

interface Written {
  ok: true;
  conversationId: string;
  question: ChatMessage | null;
  answerId: string;
  created: boolean;
}

async function writeQuestionAndAnswer(
  deps: TurnDeps,
  i: {
    orgId: string;
    actor: string;
    request: TurnRequest;
    conversationId: string | null;
    questionParent: string | null;
    questionText: string | null;
    questionFiles: string[];
    existingQuestion: ChatMessage | null;
    continuing: ChatMessage | null;
    kind: "text" | "image";
    model: string;
  },
): Promise<Written | TurnFailure> {
  if (i.continuing) {
    const reopened = await deps.writes.reopenReply({ orgId: i.orgId, actor: i.actor, messageId: i.continuing.id });
    if (!reopened.ok) return chatFailure(reopened.error);
    return { ok: true, conversationId: i.conversationId!, question: null, answerId: i.continuing.id, created: false };
  }

  // A question and its empty answer in one transaction (and the conversation, when it's new): a refusal part-way leaves nothing.
  if (i.questionText !== null) {
    const projectId = !i.conversationId && i.request.action === "send" ? i.request.projectId : null;
    const began = await deps.writes.beginTurn({
      orgId: i.orgId,
      actor: i.actor,
      conversationId: i.conversationId,
      projectId,
      title: titleFrom(i.questionText),
      parentId: i.questionParent,
      content: i.questionText,
      files: i.questionFiles,
      kind: i.kind,
      model: i.model,
    });
    if (!began.ok) return chatFailure(began.error);
    const { conversation, question: questionId, answer } = began.value;
    const read = await deps.reads.path(conversation, questionId, 1);
    const question: ChatMessage = read?.[0] ?? {
      id: questionId,
      parentId: i.questionParent,
      role: "user",
      kind: "text",
      content: i.questionText,
      status: "complete",
      modelName: null,
      error: null,
      rating: null,
      thinkingMs: null,
      meta: {},
      createdAt: new Date(deps.now()).toISOString(),
      siblings: [questionId],
      files: [],
    };
    return { ok: true, conversationId: conversation, question, answerId: answer, created: i.conversationId === null };
  }

  const began = await deps.writes.beginReply({ orgId: i.orgId, actor: i.actor, conversationId: i.conversationId!, parentId: i.existingQuestion!.id, kind: i.kind, model: i.model });
  if (!began.ok) return chatFailure(began.error);
  return { ok: true, conversationId: i.conversationId!, question: null, answerId: began.value, created: false };
}

async function prepareImage(
  deps: TurnDeps,
  i: {
    orgId: string;
    actor: string;
    plan: ResolvedPlan;
    request: TurnRequest;
    conversationId: string | null;
    questionParent: string | null;
    base: ChatMessage[];
    questionText: string | null;
    questionFiles: string[];
    /** Pictures the AI made in this conversation, to start from. */
    madeIds: string[];
    newQuestion: ContextMessage | null;
    existingQuestion: ChatMessage | null;
    conversationTitled: boolean;
  },
): Promise<TurnFailure | PreparedTurn> {
  if (!deps.images) return refused(503, deps.imagesOff ?? "Image generation isn't connected on this server yet.");
  const generator = deps.images;
  const request = i.request;
  if (request.action === "continue") return refused(400, "Only an answer that stopped part-way can be continued.");
  const aspect = request.aspect as AspectRatio;
  const prompt = (i.questionText ?? i.existingQuestion?.content ?? "").trim().replace(/\s+/g, " ");

  // Pictures to work from: the ones attached to this question, or else the last picture made in this conversation (so "make it
  // brighter" edits it).
  const questionImages = i.questionText !== null ? await deps.reads.pendingFiles(i.questionFiles) : [];
  let referenceIds = [...i.madeIds, ...(i.questionText !== null ? i.questionFiles.filter((id) => questionImages.find((f) => f.id === id)?.kind === "image") : (i.existingQuestion?.files.filter((f) => f.kind === "image").map((f) => f.id) ?? []))].slice(0, 3);
  if (referenceIds.length === 0) {
    const lastMade = [...i.base].reverse().find((m) => m.role === "assistant" && m.kind === "image" && m.files.some((f) => f.generated));
    if (lastMade) referenceIds = [lastMade.files.find((f) => f.generated)!.id];
  }

  const units = reserveUnits(generator.model, approxTokens(prompt) + 20 + referenceIds.length * 1_300, Math.ceil(IMAGE_OUTPUT_TOKENS * 1.25));
  const reserved = await reserveUsage(deps.usage, { orgId: i.orgId, userId: i.actor, taskId: null, operation: "image_generation", units, manual: MANUAL, billing: i.plan });
  if (!reserved.ok) return refused(reserved.code === "QUOTA_EXCEEDED" || reserved.code === "TRIAL_CAP_REACHED" ? 402 : reserved.code === "PLATFORM_DAILY_LIMIT" ? 429 : 503, reserved.message);
  const entry = { orgId: i.orgId, entryId: reserved.value.entryId };

  const written = await writeQuestionAndAnswer(deps, {
    orgId: i.orgId,
    actor: i.actor,
    request,
    conversationId: i.conversationId,
    questionParent: i.questionParent,
    questionText: i.questionText,
    questionFiles: i.questionFiles,
    existingQuestion: i.existingQuestion,
    continuing: null,
    kind: "image",
    model: generator.model,
  });
  if (!written.ok) {
    await refundUsage(deps.usage, { ...entry, usage: null, reason: "failed" });
    return written;
  }
  const { conversationId, question, answerId, created } = written;
  const references = (await deps.reads.files(referenceIds)).filter((f) => f.kind === "image").map((f) => ({ mimeType: f.mime, data: f.content }));
  const answer: ChatMessage = {
    id: answerId,
    parentId: question?.id ?? i.existingQuestion!.id,
    role: "assistant",
    kind: "image",
    content: "",
    status: "streaming",
    modelName: modelName(generator.model),
    error: null,
    rating: null,
    thinkingMs: null,
    meta: { aspect, prompt: prompt.slice(0, 1_000) },
    createdAt: new Date(deps.now()).toISOString(),
    siblings: [answerId],
    files: [],
  };

  return {
    ok: true,
    conversationId,
    async run(emit, signal) {
      emit({ type: "start", conversationId, created, question, answer, note: null });
      const meta = { aspect, prompt: prompt.slice(0, 1_000) };
      const end = async (status: "complete" | "failed" | "stopped", error: string | null) => {
        await deps.writes.writeReply({ orgId: i.orgId, actor: i.actor, messageId: answerId, content: "", status, model: null, error, thinkingMs: null, meta });
        try {
          emit({ type: "done", status, error, thinkingMs: null, modelName: modelName(generator.model), stop: null });
        } catch {
          // Gone.
        }
      };

      const wording = references.length > 0 ? `Use the attached picture${references.length > 1 ? "s" : ""} as the starting point. ${prompt}` : prompt;
      let outcome;
      try {
        outcome = await generator.generate({ prompt: wording, aspectRatio: aspect, references }, signal);
      } catch {
        outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
      }
      if (!outcome.ok) {
        await refundUsage(deps.usage, { ...entry, usage: outcome.usage, reason: signal.aborted ? "stopped" : "failed" });
        await end(signal.aborted ? "stopped" : "failed", signal.aborted ? null : (FAILED_IMAGE[outcome.failure] ?? FAILED_IMAGE.PROVIDER_ERROR!));
        return;
      }
      const kind = sniffImage(outcome.bytes);
      const mime = kind === "png" ? "image/png" : kind === "jpeg" ? "image/jpeg" : kind === "webp" ? "image/webp" : null;
      if (!mime || outcome.bytes.length > CHAT_LIMITS.fileBytes) {
        await refundUsage(deps.usage, { ...entry, usage: outcome.usage, reason: "failed" });
        await end("failed", FAILED_IMAGE.INCOMPLETE!);
        return;
      }
      const size = imageSize(outcome.bytes);
      const sha256 = createHash("sha256").update(outcome.bytes).digest("hex");
      const name = `farbaek-image-${sha256.slice(0, 8)}.${kind === "jpeg" ? "jpg" : kind}`;
      const saved = await deps.writes.saveFile({
        orgId: i.orgId,
        actor: i.actor,
        messageId: answerId,
        name,
        kind: "image",
        mime,
        size: outcome.bytes.length,
        sha256,
        content: Buffer.from(outcome.bytes).toString("base64"),
        width: size?.width ?? null,
        height: size?.height ?? null,
      });
      if (!saved.ok) {
        await refundUsage(deps.usage, { ...entry, usage: outcome.usage, reason: "failed" });
        await end("failed", "The picture was made but couldn't be saved, so it wasn't counted. Try again.");
        return;
      }
      try {
        emit({ type: "image", file: { id: saved.value, name, kind: "image", mime, size: outcome.bytes.length, width: size?.width ?? null, height: size?.height ?? null, generated: true } });
      } catch {
        // Gone; it's saved.
      }
      await end("complete", null);
      await settleUsage(deps.usage, { ...entry, usage: outcome.usage });
    },
  };
}
