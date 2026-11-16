import { createHash } from "node:crypto";
import { checkChatFile, imageSize } from "@/core/chat/files";
import { CHAT_LIMITS, type ChatFile } from "@/core/chat/protocol";
import { createChatWrites } from "@/server/chat/store";
import { chatFailure } from "@/server/chat/turn";
import { readBytesCapped } from "@/server/http/body";
import { sameOrigin } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const refuse = (message: string, status: number) => json({ ok: false, message }, status);

/**
 * A file attached to a question before it's sent (stage 199, ADR 0213): the raw bytes in the body, the name in a header. The bytes
 * decide what it is (checkChatFile), never the name or the type the browser claims. It waits, unattached, until the question is sent,
 * and is removed after a day if it never is.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuse("This request didn't come from Farbaek.", 403);
  const ctx = await loadAppContext();
  if (!ctx) return refuse("You're signed out. Sign in, then try again.", 401);
  if (ctx.mode === "demo") return refuse("The demo workspace is read-only, so attaching is off.", 403);
  if (!ctx.current) return refuse("Create a workspace first.", 403);
  if (!ctx.writes.enabled) return refuse(ctx.writes.reason ?? "Changes are off for this workspace right now.", 403);
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return refuse("Viewers can read the workspace but can't use its AI.", 403);

  let name: string;
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "").slice(0, 400);
  } catch {
    name = "";
  }
  if (!name) return refuse("That file has no name.", 400);
  const bytes = await readBytesCapped(request, CHAT_LIMITS.fileBytes);
  if (bytes === null) return refuse(`That file is larger than 5 MB. Attach a smaller one.`, 413);
  const check = checkChatFile(name, bytes);
  if (!check.ok) return refuse(check.reason, 415);

  const admin = createSupabaseAdminClient();
  if (!admin) return refuse("Chat isn't set up on this server.", 503);
  const limited = await admin.rpc("app_rate_limit", { p_key: `chat-upload:${ctx.user.id}`, p_window_seconds: 3_600, p_limit: 120 });
  if (limited.error) return refuse("Attaching isn't available right now. Try again in a minute.", 503);
  if (limited.data !== true) return refuse("That's many files in an hour. Wait a while, then attach more.", 429);

  const size = check.kind === "image" ? imageSize(bytes) : null;
  // The AI reads pictures up to 8,000 pixels on a side; a larger one would fail every later question that carries it.
  if (check.kind === "image" && (!size || size.width > 8_000 || size.height > 8_000)) return refuse(`${check.name} is over 8,000 pixels on one side, or its size can't be read. Make it smaller, then attach it again.`, 415);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const saved = await createChatWrites(admin).saveFile({
    orgId: ctx.current.id,
    actor: ctx.user.id,
    messageId: null,
    name: check.name,
    kind: check.kind,
    mime: check.mime,
    size: bytes.length,
    sha256,
    content: Buffer.from(bytes).toString("base64"),
    width: size?.width ?? null,
    height: size?.height ?? null,
  });
  if (!saved.ok) {
    const failure = chatFailure(saved.error);
    return refuse(failure.message, failure.status);
  }
  const file: ChatFile = { id: saved.value, name: check.name, kind: check.kind, mime: check.mime, size: bytes.length, width: size?.width ?? null, height: size?.height ?? null, generated: false };
  return json({ ok: true, file });
}
