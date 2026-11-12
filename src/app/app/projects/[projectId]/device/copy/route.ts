import { z } from "zod";
import { readDeviceCopy } from "@/server/workspace/device-saves";
import { deviceContext, json, saveReason } from "@/server/workspace/device-wiring";

export const dynamic = "force-dynamic";

/**
 * The whole project for "Keep on this device" (ADR 0192): every current file
 * with its revision and hash, read as the person through Row Level Security,
 * and whether they may change it. Nothing is kept on the server; the browser
 * stores it for this account only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return json({ code: "NOT_FOUND", message: "That project doesn't exist or isn't in this workspace." }, 404);
  const who = await deviceContext();
  if ("status" in who) return json({ code: who.code, message: who.message }, who.status);
  const read = await readDeviceCopy(who.ctx.reader, { orgId: who.orgId, projectId, userId: who.ctx.user.id, saveReason: (project) => saveReason(who.ctx, project) });
  if (!read.ok) return json({ code: read.status === 404 ? "NOT_FOUND" : "CHANGED", message: read.message }, read.status);
  return json({ data: read.copy });
}
