/**
 * What the browser and the server say to each other about a chat (stage 199, ADR 0213): the request for a turn, the events of its
 * stream, and the shapes of conversations, messages and files as the screen shows them. Shared by both sides, framework-free.
 */
import { z } from "zod";

export const CHAT_LIMITS = {
  /** Characters in one question. */
  message: 32_000,
  /** Files on one question. */
  files: 6,
  /** Bytes in one attached file. */
  fileBytes: 5 * 1024 * 1024,
  /** Bytes a text file may have to be read as text. */
  textBytes: 1024 * 1024,
  /** Characters in a conversation's name. */
  title: 120,
  /** Characters in an image description. */
  imagePrompt: 1_000,
  /** Messages read at a time when a conversation opens, or when earlier ones are asked for. */
  page: 40,
  /** Conversations listed at a time in the sidebar. */
  list: 60,
} as const;

export const ASPECTS = ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const EFFORTS = ["quick", "balanced", "thorough"] as const;
export type ChatEffort = (typeof EFFORTS)[number];
export const EFFORT_LABELS: Record<ChatEffort, string> = { quick: "Quick", balanced: "Balanced", thorough: "Thorough" };
export const EFFORT_ABOUT: Record<ChatEffort, string> = {
  quick: "Answers straight away. Best for everyday questions.",
  balanced: "Thinks a little first. Good for most work.",
  thorough: "Thinks longer. For hard problems, code and maths.",
};

const id = z.uuid();
/** "auto" lets Farbaek choose; otherwise a model id from the picker, checked on the server against the plan. */
const modelChoice = z.string().regex(/^(?:auto|[a-z0-9][a-z0-9.:_-]{0,79})$/);

export const turnRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send"),
    conversationId: id.nullable(),
    /** The answer this question follows, or null for a conversation's first question. */
    parentId: id.nullable(),
    text: z.string().max(CHAT_LIMITS.message),
    files: z.array(id).max(CHAT_LIMITS.files),
    model: modelChoice,
    effort: z.enum(EFFORTS),
    mode: z.enum(["text", "image"]),
    aspect: z.enum(ASPECTS),
    projectId: id.nullable(),
  }),
  z.object({
    action: z.literal("edit"),
    conversationId: id,
    /** The question being edited: the new one becomes its sibling. */
    messageId: id,
    text: z.string().max(CHAT_LIMITS.message),
    files: z.array(id).max(CHAT_LIMITS.files),
    model: modelChoice,
    effort: z.enum(EFFORTS),
    mode: z.enum(["text", "image"]),
    aspect: z.enum(ASPECTS),
  }),
  z.object({
    action: z.literal("regenerate"),
    conversationId: id,
    /** The question to answer again. */
    messageId: id,
    model: modelChoice,
    effort: z.enum(EFFORTS),
    mode: z.enum(["text", "image"]),
    aspect: z.enum(ASPECTS),
  }),
  z.object({
    action: z.literal("continue"),
    conversationId: id,
    /** The stopped answer to carry on. */
    messageId: id,
    model: modelChoice,
    effort: z.enum(EFFORTS),
  }),
]);
export type TurnRequest = z.infer<typeof turnRequestSchema>;

export interface ChatFile {
  id: string;
  name: string;
  kind: "image" | "pdf" | "text";
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  generated: boolean;
}

export type MessageStatus = "streaming" | "complete" | "stopped" | "failed";

export interface ChatMessage {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  kind: "text" | "image";
  content: string;
  status: MessageStatus;
  /** The model that answered, as its product name (never an id). */
  modelName: string | null;
  error: string | null;
  rating: -1 | 1 | null;
  thinkingMs: number | null;
  /** why: what Farbaek AI chose the model for ("a question about code"), shown in the answer's details (ADR 0215). */
  meta: { aspect?: string; prompt?: string; stop?: "length" | "refusal"; why?: string };
  createdAt: string;
  /** This message and its siblings, oldest first: an edited question or a new answer is a sibling. */
  siblings: string[];
  files: ChatFile[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  projectId: string | null;
  updatedAt: string;
  shared: boolean;
}

/** The events of one turn's stream, in order: start, then thinking and text (or an image), then done. */
export type TurnEvent =
  /** note: why the model differs from the one chosen, when it does. */
  | { type: "start"; conversationId: string; created: boolean; question: ChatMessage | null; answer: ChatMessage; note: string | null }
  /** The model is thinking; v is more of its thinking summary (shown while it thinks, never kept). */
  | { type: "thinking"; v: string }
  /** The model that was answering failed before writing anything, and another took the question (ADR 0215). */
  | { type: "route"; modelName: string; note: string }
  | { type: "text"; v: string }
  | { type: "image"; file: ChatFile }
  | { type: "title"; title: string }
  | { type: "done"; status: Exclude<MessageStatus, "streaming">; error: string | null; thinkingMs: number | null; modelName: string | null; stop: "length" | "refusal" | null };

/** A fallback name for a conversation from its first question, until the AI names it. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "New chat";
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).replace(/[,.;:!?-]+$/, "")}…`;
}

/** Cleans the AI's suggested name: one line, no quotes or trailing full stop, at most 60 characters. */
export function cleanTitle(raw: string): string | null {
  const t = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/^["'“”‘’`*#\s]+|["'“”‘’`*\s]+$/g, "")
    .replace(/^title:\s*/i, "")
    .replace(/[.。]+$/, "")
    .trim();
  if (t.length < 2) return null;
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
}
