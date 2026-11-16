/**
 * "Refine with Farbaek AI" (stage 201, ADR 0216): the chat's model turns a short idea into the brief a photographer, art director
 * or cinematographer would write, for the person to read and change before anything is made. Two kinds of model working
 * together: one writes, another renders. Metered as a chat message, settled to its real cost.
 */
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { route } from "@/core/agent/routing";
import { OPENAI_CHAT_MODEL } from "@/core/chat/models";
import type { ChatModel } from "@/server/ai/chat-model";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type UsageContext } from "@/server/workspace/ai-usage";

const SYSTEM = {
  image:
    "You turn a person's idea for a picture into a brief for an image model, the way a professional photographer, illustrator or art director would write it: the subject and what it's doing, the setting, composition and framing, the lens or medium, the light and its direction, materials and textures, colour palette and mood. Keep the person's intent and every detail they gave; add only what makes it look professionally made. No real people's names or brands they didn't give. Write one paragraph of 50 to 120 words of plain prose: no lists, quotes, headings or preamble.",
  video:
    "You turn a person's idea for a short video into a brief for a video model, the way a cinematographer would: the subject and action from start to end, the setting, the camera's framing and movement, lens feel, light and colour grade, pacing, and the sound (ambience, music or dialogue). Keep the person's intent and every detail they gave. No real people's names or brands they didn't give. Write one paragraph of 50 to 120 words of plain prose: no lists, quotes, headings or preamble.",
} as const;

export interface RefineDeps {
  usage: UsageContext & AiUsageDeps;
  /** Metering for Claude: the workspace's own key's log when it has one. */
  claudeUsage: UsageContext & AiUsageDeps;
  claude: ChatModel | null;
  openai: ChatModel | null;
}

export async function refinePrompt(deps: RefineDeps, input: { orgId: string; userId: string; prompt: string; kind: "image" | "video" }): Promise<{ ok: true; prompt: string } | { ok: false; message: string }> {
  const plan = await resolvePlan(deps.usage, input.orgId);
  if (!plan.ok) return { ok: false, message: plan.message };
  const claude = deps.claude;
  const model = claude ? route({ plan: plan.value.plan, family: "anthropic", step: "write", effort: "fast" }).model : deps.openai ? OPENAI_CHAT_MODEL : null;
  const chat = claude ?? deps.openai;
  if (!model || !chat) return { ok: false, message: "Farbaek AI isn't connected on this server yet." };
  const meter = claude ? deps.claudeUsage : deps.usage;
  const system = SYSTEM[input.kind];
  const reserved = await reserveUsage(meter, { orgId: input.orgId, userId: input.userId, taskId: null, operation: "chat", units: reserveUnits(model, approxTokens(system + input.prompt) + 50, 400), manual: "Your words are unchanged.", billing: plan.value });
  if (!reserved.ok) return { ok: false, message: reserved.message };
  let text = "";
  const outcome = await chat
    .stream(
      { model, thinking: "low", system, messages: [{ role: "user", parts: [{ type: "text", text: input.prompt }] }], maxOutputTokens: 400 },
      { onThinking() {}, onText: (d) => void (text += d) },
      AbortSignal.timeout(45_000),
    )
    .catch(() => ({ ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null, aborted: false }));
  const brief = text.replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim().slice(0, 2_000);
  if (!outcome.ok || brief.length < 20) {
    await refundUsage(meter, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return { ok: false, message: "Farbaek AI couldn't refine that just now, so it wasn't counted. Your words are unchanged." };
  }
  await settleUsage(meter, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage });
  return { ok: true, prompt: brief };
}
