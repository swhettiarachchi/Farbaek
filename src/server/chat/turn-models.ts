/**
 * Which models one Chat turn may use, from what the workspace's AI setup answered
 * (stage 209). Kept apart from the wiring so the own-key rule is tested: a
 * workspace that set its own Claude key keeps to it (ADR 0125). When that key
 * can't be read, the turn stops with the reason. It never goes to OpenAI on
 * Farbaek's key instead, which would move the workspace's words to a provider it
 * didn't choose.
 */
import type { AiProviderId } from "@/server/ai/config";

export type WorkspaceAiAnswer<D, C> = { provider: AiProviderId; client: C; deps: D; own: boolean } | { error: string; ownKey?: boolean };

export interface TurnModels<D, M> {
  claude: M | null;
  /** Metering for Claude: the workspace's own key's log when it has one. */
  claudeUsage: D;
  claudeOwnKey: boolean;
  openai: M | null;
  /** Why nothing can answer, or null when a model can. */
  error: string | null;
}

export function turnModels<D, C, M>(ai: WorkspaceAiAnswer<D, C>, openai: M | null, deps: D, claudeFor: (client: C) => M): TurnModels<D, M> {
  if ("error" in ai) {
    // Its own key, unreadable: fail closed, with what to do about it.
    if (ai.ownKey) return { claude: null, claudeUsage: deps, claudeOwnKey: true, openai: null, error: ai.error };
    return { claude: null, claudeUsage: deps, claudeOwnKey: false, openai, error: openai ? null : ai.error };
  }
  if (ai.provider !== "anthropic") return { claude: null, claudeUsage: deps, claudeOwnKey: false, openai, error: openai ? null : "Chat needs Claude or OpenAI, and this server uses Gemini." };
  return { claude: claudeFor(ai.client), claudeUsage: ai.deps, claudeOwnKey: ai.own, openai, error: null };
}
