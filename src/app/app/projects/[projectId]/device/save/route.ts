import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readTextCapped } from "@/server/http/body";
import { sameOrigin } from "@/server/sandbox/wiring";
import { DEVICE_SAVE_MAX_BODY, DeviceSaveInput, saveFromDevice } from "@/server/workspace/device-saves";
import { deviceContext, deviceSaveDeps, deviceSignedIn, json } from "@/server/workspace/device-wiring";

export const dynamic = "force-dynamic";

/**
 * Sends one save made on the device (ADR 0192). A stable route rather than a
 * server action, so a page loaded before a deploy can still send its saves.
 * The session cookie makes it a cookie write, so the request must come from
 * Farbaek's own pages. The save names the account that made it and the
 * workspace its copy came from: another account signed in here can't send it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!sameOrigin(request)) return json({ code: "FORBIDDEN", message: "This request didn't come from Farbaek." }, 403);
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return json({ code: "NOT_FOUND", message: "That project doesn't exist or isn't in this workspace." }, 404);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return json({ code: "INVALID_REQUEST", message: "That save couldn't be read." }, 400);

  // Signed in at all, before reading up to 3 MB.
  const refused = await deviceSignedIn();
  if (refused) return json({ code: refused.code, message: refused.message }, refused.status);

  const text = await readTextCapped(request, DEVICE_SAVE_MAX_BODY);
  if (text === null) return json({ code: "FILE_TOO_LARGE", message: "That file is larger than a project file can be." }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const parsed = DeviceSaveInput.safeParse(raw);
  if (!parsed.success) return json({ code: "INVALID_REQUEST", message: "That save couldn't be read." }, 400);

  const who = await deviceContext(parsed.data.orgId);
  if ("status" in who) return json({ code: who.code, message: who.message }, who.status);
  if (parsed.data.owner !== who.ctx.user.id) {
    return json({ code: "OTHER_ACCOUNT", message: "These changes were saved on this device by another account. Sign out, then sign in as that account to send them." }, 409);
  }
  const project = await who.ctx.reader.getProject(who.orgId, projectId);
  if (!project) return json({ code: "NOT_FOUND", message: "That project doesn't exist or isn't in this workspace." }, 404);
  const deps = await deviceSaveDeps(who.ctx, who.orgId, project.id);
  if ("status" in deps) return json({ code: deps.code, message: deps.message }, deps.status);

  const answer = await saveFromDevice(deps, parsed.data);
  if (answer.status === 200) revalidatePath(`/app/projects/${project.id}`, "layout");
  return json(answer.body, answer.status);
}
