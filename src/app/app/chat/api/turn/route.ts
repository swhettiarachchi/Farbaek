import { after } from "next/server";
import { turnRequestSchema, type TurnEvent } from "@/core/chat/protocol";
import { encodeEvent, encodeKeepAlive } from "@/core/chat/sse";
import { imageGeneration } from "@/server/ai/image-config";
import { openAiKey } from "@/server/ai/openai-second-checker";
import { chatModels } from "@/server/chat/setup";
import { createChatWrites, readConversation, readFiles, readMemories, readPath, readPendingFiles, readSummaries } from "@/server/chat/store";
import { prepareTurn, type TurnDeps } from "@/server/chat/turn";
import { readTextCapped } from "@/server/http/body";
import { log } from "@/server/observability/log";
import { platformModels } from "@/server/platform/state";
import { sameOrigin } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { providerHealth, recordProviderResult } from "@/server/ai/provider-health";
import { webResearch } from "@/server/web/wiring";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const dynamic = "force-dynamic";
// A thorough answer can take minutes; a picture up to 90 seconds.
export const maxDuration = 600;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const refuse = (message: string, status: number) => json({ ok: false, message }, status);

/** What one person may send in a minute and in a day, on top of the plan's AI usage: keeps a stuck script from emptying it. */
const LIMITS = { minute: 20, day: 800, imagesMinute: 6, imagesDay: 80 } as const;

/**
 * One chat turn (stage 199, ADR 0213): a question answered as a stream of Server-Sent Events. Everything that can refuse it (sign
 * in, role, the request, the limits, the plan's usage) answers as JSON before the stream opens; once it opens, the answer streams
 * and is saved as it goes. Stop in the browser aborts the request, which stops the model; what was written is kept.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuse("This request didn't come from Farbaek.", 403);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return refuse("That message couldn't be read.", 400);

  const ctx = await loadAppContext();
  if (!ctx) return refuse("You're signed out. Sign in, then try again.", 401);
  if (ctx.mode === "demo") return refuse("The demo workspace is read-only, so sending is off.", 403);
  if (!ctx.current) return refuse("Create a workspace first.", 403);
  if (!ctx.writes.enabled) return refuse(ctx.writes.reason ?? "Changes are off for this workspace right now.", 403);
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return refuse("Viewers can read the workspace but can't use its AI.", 403);

  const text = await readTextCapped(request, 200_000);
  if (text === null) return refuse("That message is too long to send.", 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const parsed = turnRequestSchema.safeParse(raw);
  if (!parsed.success) return refuse("That message couldn't be read.", 400);
  const body = parsed.data;

  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return refuse("Chat isn't set up on this server.", 503);
  const orgId = ctx.current.id;
  const userId = ctx.user.id;

  const image = body.action !== "continue" && body.mode === "image";
  const limit = async (key: string, seconds: number, max: number) => {
    const r = await admin.rpc("app_rate_limit", { p_key: key, p_window_seconds: seconds, p_limit: max });
    return r.error ? null : r.data === true;
  };
  const minute = await limit(`chat:${userId}`, 60, image ? LIMITS.imagesMinute : LIMITS.minute);
  if (minute === null) return refuse("Chat isn't available right now. Try again in a minute.", 503);
  if (!minute) return refuse("That's a lot of messages in a minute. Wait a moment, then carry on.", 429);
  const day = await limit(image ? `chat-images-day:${userId}` : `chat-day:${userId}`, 86_400, image ? LIMITS.imagesDay : LIMITS.day);
  if (day === null) return refuse("Chat isn't available right now. Try again in a minute.", 503);
  if (!day) return refuse(image ? `That's ${LIMITS.imagesDay} pictures today, the most for one person in a day. It's back tomorrow.` : `That's ${LIMITS.day} messages today, the most for one person in a day. It's back tomorrow.`, 429);

  const base = createSupabaseWriteDeps(user, admin, userId);
  const models = await chatModels(orgId, base);
  const images = imageGeneration();
  const deps: TurnDeps = {
    claudeUsage: models.claudeUsage,
    usage: base,
    writes: createChatWrites(admin),
    reads: {
      path: (conversationId, leaf, n) => readPath(user, conversationId, leaf, n),
      files: (ids) => readFiles(user, ids),
      pendingFiles: (ids) => readPendingFiles(user, ids),
      conversation: (id) => readConversation(user, orgId, id),
      projectExists: async (id) => {
        const { data } = await user.from("projects").select("id").eq("id", id).eq("org_id", orgId).maybeSingle();
        return Boolean(data);
      },
      // A long conversation's saved summaries and what the person asked to be remembered (stage 207, ADR 0224): their own, read as them.
      summaries: (ids) => readSummaries(user, ids),
      memories: async () => ((await readMemories(user, orgId)) ?? []).map((m) => m.content),
    },
    claude: models.claude,
    openai: models.openai,
    images: images.generator,
    imagesOff: images.reason,
    openaiConnected: openAiKey() !== null,
    claudeOwnKey: models.claudeOwnKey,
    health: () => providerHealth(),
    recordHealth: recordProviderResult,
    overrides: platformModels(),
    // Live web search when a question needs it (stage 205, ADR 0222; stage 206, ADR 0223).
    research: webResearch(),
    // Work for after the answer has been sent: the response is done, and this still runs.
    later: (work) => after(work),
    now: () => Date.now(),
  };
  if (!models.claude && !models.openai && !image) return refuse(models.error ?? "AI isn't connected on this server yet.", 503);

  const prepared = await prepareTurn(deps, { orgId, userId, request: body });
  if (!prepared.ok) return refuse(prepared.message, prepared.status);

  // The model call follows the browser's request: Stop (or closing the page) aborts it.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  // The browser may have gone while the turn was prepared: then the event has already fired, and the answer stops at once.
  if (request.signal.aborted) abort.abort();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (bytes: Uint8Array) => {
        if (!open) return;
        try {
          controller.enqueue(bytes);
        } catch {
          open = false;
        }
      };
      const emit = (e: TurnEvent) => send(encodeEvent(e.type, e));
      const keepAlive = setInterval(() => send(encodeKeepAlive()), 15_000);
      prepared
        .run(emit, abort.signal)
        .catch((error: unknown) => log("error", "chat.turn_failed", { reason: error instanceof Error ? error.name : "unknown" }))
        .finally(() => {
          clearInterval(keepAlive);
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {
              // Already closed.
            }
          }
        });
    },
    cancel() {
      open = false;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // Caddy and Nginx pass each event on at once.
      "x-accel-buffering": "no",
      "x-conversation-id": prepared.conversationId,
    },
  });
}
