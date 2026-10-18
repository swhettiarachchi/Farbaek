"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sandboxForPage } from "@/server/sandbox/page-context";
import { loadAppContext } from "@/server/workspace/context";

export type CreateSessionState = { status: "idle" } | { status: "error"; message: string; field?: string };

/**
 * Starts a session from the create form. The idempotency key is fixed when
 * the form renders, so a double submit or a retry after a network error
 * returns the same session instead of starting a second sandbox.
 */
export async function createSandboxSessionAction(_previous: CreateSessionState, form: FormData): Promise<CreateSessionState> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  const sandbox = await sandboxForPage(ctx);
  if (!sandbox.ok) return { status: "error", message: sandbox.reason };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };

  const text = (k: string) => String(form.get(k) ?? "").trim();
  const include = text("include")
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const key = text("idempotencyKey");
  const result = await sandbox.value.service.createSession(
    sandbox.value.actor,
    {
      name: text("name"),
      template: text("template"),
      size: text("size"),
      network: text("network"),
      minutes: Number(text("minutes")),
      projectId: text("projectId") || null,
      taskId: text("taskId") || null,
      include,
    },
    /^[A-Za-z0-9_.:-]{8,100}$/.test(key) ? key : crypto.randomUUID(),
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app/sandbox");
  redirect(`/app/sandbox/${result.value.sessionId}`);
}
