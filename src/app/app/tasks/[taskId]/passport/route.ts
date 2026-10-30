import { z } from "zod";
import { loadAppContext } from "@/server/workspace/context";
import { loadPassport } from "@/server/workspace/context-readiness";

export const dynamic = "force-dynamic";

const text = (status: number, message: string) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * GET /app/tasks/:taskId/passport (ADR 0116): the task's Context Passport as
 * JSON, to keep or hand on with the task. Read through the person's own
 * session, so it holds only what they can open; it carries paths and hashes,
 * never file contents or secret values.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!z.uuid().safeParse(taskId).success) return text(404, "That task doesn't exist.");
  const ctx = await loadAppContext();
  if (!ctx) return text(401, "Sign in to download this.");
  if (!ctx.current) return text(404, "That task doesn't exist or isn't in this workspace.");
  const passport = await loadPassport(ctx.reader, ctx.current.id, taskId);
  if (!passport) return text(404, "That task doesn't exist or isn't in this workspace.");
  return new Response(`${JSON.stringify(passport, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="context-passport-${taskId.slice(0, 8)}.json"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
