/**
 * The boundary between Farbaek and a model provider for contract drafting.
 * Use cases depend on this interface only, so provider code stays in one
 * place and tests use a labelled fake.
 */
import type { ContractDraft } from "@/core/realityloop/contract-draft";

/** What the model is told about the task. All of it is user-supplied data. */
export interface DraftBrief {
  taskTitle: string;
  projectName: string;
  projectDescription: string | null;
  /** Paths already in the project, so the contract's scope names real files. */
  paths?: readonly string[];
  /** Non-empty fields the person already typed into the editor. */
  notes: Record<string, string>;
}

/** Usage as reported by the provider, never estimated. */
export interface ProviderUsage {
  model: string;
  /** Prompt tokens billed at the full input rate (not read from or written to a cache). */
  inputTokens: number;
  /** Output tokens, including any thinking. */
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

export type DraftFailure =
  /** The model (and any fallback model) declined the request. */
  | "REFUSED"
  /** The output was cut off or didn't match the contract shape. */
  | "INCOMPLETE"
  /** Rate limited, overloaded or timed out. Worth retrying later. */
  | "PROVIDER_BUSY"
  /** Anything else, including a rejected server key. */
  | "PROVIDER_ERROR";

export type DraftOutcome = { ok: true; draft: ContractDraft; usage: ProviderUsage } | { ok: false; failure: DraftFailure; usage: ProviderUsage | null };

export interface ContractDrafter {
  /** The model requested for drafts. The model that answered is in the outcome's usage. */
  readonly model: string;
  /** The most a draft can write, thinking included: usage is reserved for it before the call. */
  readonly maxOutputTokens: number;
  draft(brief: DraftBrief, signal?: AbortSignal): Promise<DraftOutcome>;
}
