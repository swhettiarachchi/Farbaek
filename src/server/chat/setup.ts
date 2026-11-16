/**
 * What Farbaek Chat can do for this person in this workspace (stage 199, ADR 0213), worked out on the server: which models can
 * answer, whether pictures can be made, how much of the period's AI usage is used, and why anything is off. The page shows it as
 * words; the turn's own checks enforce it again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { costUnits } from "@/core/billing/rate-card";
import { chatModelOptions, type ChatModelOption } from "@/core/chat/models";
import { createAnthropicChat } from "@/server/ai/chat-anthropic";
import type { ChatModel } from "@/server/ai/chat-model";
import { createOpenAiChat } from "@/server/ai/chat-openai";
import { resolveAiProvider } from "@/server/ai/config";
import { IMAGE_OUTPUT_TOKENS } from "@/server/ai/gemini-image";
import { imageGeneration, imageModel } from "@/server/ai/image-config";
import { openAiKey } from "@/server/ai/openai-second-checker";
import { aiForWorkspace, readModelKey } from "@/server/ai/workspace-ai";
import { platformModels } from "@/server/platform/state";
import type { AppContext } from "@/server/workspace/context";
import { loadWallet } from "@/server/workspace/usage-summary";
import type { AiUsageDeps, UsageContext } from "@/server/workspace/ai-usage";
import type { WorkspaceSummary } from "@/server/workspace/organizations";

export interface ChatAvailability {
  /** Why nothing can be sent, or null when chat works. */
  off: string | null;
  /** Why pictures can't be made, or null. */
  imagesOff: string | null;
  models: ChatModelOption[];
  /** Share of this period's AI usage used, or null when unknown. */
  percent: number | null;
  /** About how much of the period's usage one picture takes, as a whole percent, or null. */
  imagePercent: number | null;
  resetsAt: string | null;
  period: "trial" | "month" | null;
  /** The workspace answers with its own Claude key. */
  ownKey: boolean;
}

export async function loadChatAvailability(ctx: AppContext, ws: WorkspaceSummary, client: SupabaseClient | null): Promise<ChatAvailability> {
  const provider = resolveAiProvider();
  const paused = provider.provider === null && provider.reason !== undefined && !provider.detail ? provider.reason : null;
  const ownKey = client ? (await readModelKey(client, ws.id).catch(() => null)) !== null : false;
  const claude = !paused && (ownKey || provider.provider === "anthropic");
  const openai = !paused && openAiKey() !== null;
  const images = imageGeneration();
  const models = chatModelOptions({ plan: ws.plan, claude, openai, overrides: platformModels() });
  const wallet = ctx.mode === "live" ? await loadWallet(ctx, ws).catch(() => null) : null;
  const monthly = ws.plan.limits.aiUnitsPerMonth;
  const perImage = costUnits(imageModel(), { inputTokens: 40, outputTokens: IMAGE_OUTPUT_TOKENS, cacheWriteTokens: 0, cacheReadTokens: 0 });
  const imagePercent = monthly && monthly > 0 ? Math.max(1, Math.round((perImage / monthly) * 100)) : null;

  let off: string | null = null;
  if (ctx.mode === "demo") off = "The demo workspace is read-only, so sending is off. The sample conversation shows how chats look.";
  else if (!ctx.writes.enabled) off = ctx.writes.reason ?? "Changes are off for this workspace right now.";
  else if (paused) off = paused;
  else if (!claude && !openai) off = provider.provider === "gemini" ? "Chat needs Claude or OpenAI, and this server uses Gemini. Earlier chats stay readable." : "AI isn't connected on this server yet. Earlier chats stay readable.";
  else if (ws.billingUnknown) off = "Your plan couldn't be confirmed, so AI is paused. Earlier chats stay readable.";
  else if (wallet && wallet.available <= 0) off = ws.plan.source === "trial" ? "There's no AI usage left in the trial. Choose a plan to keep chatting." : "There's no AI usage left this month. It resets at the start of the next one.";

  return {
    off,
    imagesOff: off ?? (paused ? paused : images.generator ? null : images.reason),
    models,
    percent: wallet?.current?.percent ?? null,
    imagePercent,
    resetsAt: wallet?.current?.resetsAt ?? null,
    period: wallet?.current?.period ?? null,
    ownKey,
  };
}

/** The models for one turn, with the metering each one uses. */
export async function chatModels<D extends UsageContext & AiUsageDeps>(orgId: string, deps: D): Promise<{ claude: ChatModel | null; claudeUsage: D; claudeOwnKey: boolean; openai: ChatModel | null; error: string | null }> {
  const provider = resolveAiProvider();
  const paused = provider.provider === null && !provider.detail ? provider.reason : null;
  if (paused) return { claude: null, claudeUsage: deps, claudeOwnKey: false, openai: null, error: paused };
  const key = openAiKey();
  const openai = key ? createOpenAiChat({ key }) : null;
  const ai = await aiForWorkspace(orgId, deps, { timeout: 600_000 });
  if ("error" in ai) return { claude: null, claudeUsage: deps, claudeOwnKey: false, openai, error: openai ? null : ai.error };
  if (ai.provider !== "anthropic") return { claude: null, claudeUsage: deps, claudeOwnKey: false, openai, error: openai ? null : "Chat needs Claude or OpenAI, and this server uses Gemini." };
  return { claude: createAnthropicChat(ai.client), claudeUsage: ai.deps, claudeOwnKey: ai.own, openai, error: null };
}
