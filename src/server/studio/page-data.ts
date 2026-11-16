/**
 * What a studio page needs on the server (stage 201, ADR 0216): the person's library, and whether making works here, with the
 * reason when it doesn't. The demo workspace has no studio media; its pages explain that instead of pretending.
 */
import type { StudioItem } from "@/core/studio/studio";
import { geminiVideoEngine } from "@/server/ai/gemini-video";
import { imageGeneration } from "@/server/ai/image-config";
import { openAiImageEngine } from "@/server/ai/openai-image";
import { platformPause } from "@/server/platform/state";
import { createSupabaseServerClient } from "@/server/supabase/server";
import type { AppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { listStudioItems } from "./studio";

export async function studioPageData(ctx: AppContext, kind: "image" | "video"): Promise<{ items: StudioItem[]; pictures: StudioItem[]; disabledReason: string | null }> {
  const orgId = ctx.current!.id;
  let disabledReason: string | null = null;
  if (ctx.mode !== "live") disabledReason = "The demo workspace is read-only. Sign in to your own workspace to make pictures and video.";
  else if (!ctx.writes.enabled) disabledReason = ctx.writes.reason ?? "Changes are off for this workspace right now.";
  else if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) disabledReason = "Viewers can see the workspace but can't use its AI.";
  else disabledReason = platformPause("ai_runs");
  if (!disabledReason) {
    const connected = kind === "image" ? openAiImageEngine() !== null || imageGeneration().generator !== null : geminiVideoEngine() !== null;
    if (!connected) disabledReason = kind === "image" ? "Image making isn't connected on this server yet." : "Video making isn't connected on this server yet.";
  }
  if (ctx.mode !== "live") return { items: [], pictures: [], disabledReason };
  const client = await createSupabaseServerClient().catch(() => null);
  if (!client) return { items: [], pictures: [], disabledReason: disabledReason ?? "The studios aren't set up on this server." };
  const [items, pictures] = await Promise.all([
    listStudioItems(client, orgId, kind === "image" ? ["image", "upload"] : ["video"]).then((r) => r ?? []),
    kind === "video" ? listStudioItems(client, orgId, ["image", "upload"], 120).then((r) => r ?? []) : Promise.resolve([]),
  ]);
  return { items, pictures, disabledReason };
}
