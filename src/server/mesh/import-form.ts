import "server-only";

/**
 * Opening an uploaded Capsule from the Move projects page (ADR 0037). The
 * upload goes to its own route (stage 179) rather than a server action, so a
 * Capsule with images can be larger than server actions accept; the checks
 * are the same either way, and the server opens the Capsule again whatever
 * the browser's preview said.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { ImportChoice } from "@/core/mesh/capsule";
import { importCapsule, OPEN_LIMITS, recordCapsule } from "@/server/mesh/capsules";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { formatBytes } from "@/core/workspace/files";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

export type CapsuleImportState =
  | { status: "idle" }
  | { status: "done"; projectId: string; written: number; unchanged: number; kept: number; recorded: boolean }
  | { status: "error"; message: string; problems?: string[] };

/** The largest upload accepted: the Capsule limit and room for the zip's own headers. */
export const MAX_UPLOAD_BYTES = OPEN_LIMITS.maxTotalBytes + 512 * 1024;

const Choice = z.enum(["take", "keep_mine", "keep_both", "skip"]);
const Fields = z.object({
  destination: z.string().min(1).max(64),
  name: z.string().trim().max(80).optional(),
  choices: z.string().max(400_000).optional(),
});

export async function importCapsuleForm(form: FormData): Promise<CapsuleImportState> {
  const file = form.get("capsule");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a Capsule file first." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { status: "error", message: `Capsules up to ${formatBytes(OPEN_LIMITS.maxTotalBytes)} can be opened here. Larger ones arrive with nearby transfer.` };
  }
  const fields = Fields.safeParse({ destination: form.get("destination"), name: form.get("name") ?? undefined, choices: form.get("choices") ?? undefined });
  if (!fields.success) return { status: "error", message: "Choose where the Capsule's files should go." };

  let choices: Record<string, ImportChoice> = {};
  if (fields.data.choices) {
    const parsed = z.record(z.string().max(300), Choice).safeParse(safeJson(fields.data.choices));
    if (!parsed.success) return { status: "error", message: "The choices for the differing files couldn't be read. Try again." };
    choices = parsed.data;
  }

  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Sign in and choose a workspace first." };
  if (ctx.mode === "demo") return { status: "error", message: "The demo workspace is read-only. Sign in to open a Capsule into your own workspace." };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  if (!ctx.role) return { status: "error", message: "Create or join a workspace first." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { status: "error", message: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." };

  const destination =
    fields.data.destination === "new"
      ? { kind: "new" as const, name: (fields.data.name ?? "").trim() || "Opened Capsule" }
      : { kind: "existing" as const, projectId: fields.data.destination };

  const result = await importCapsule(createSupabaseWriteDeps(user, admin, ctx.user.id), ctx.reader, {
    orgId: ctx.current.id,
    userId: ctx.user.id,
    data: new Uint8Array(await file.arrayBuffer()),
    destination,
    choices,
  });
  if (!result.ok) return { status: "error", message: result.message, problems: result.problems };

  const project = await ctx.reader.getProject(ctx.current.id, result.projectId);
  const recorded = await recordCapsule(admin, {
    orgId: ctx.current.id,
    userId: ctx.user.id,
    projectId: result.projectId,
    direction: "import",
    digest: result.digest!,
    projectName: project?.name ?? "Opened Capsule",
    files: result.files ?? 0,
    bytes: result.bytes ?? 0,
    excluded: result.excluded ?? 0,
  });
  revalidatePath("/app", "layout");
  return { status: "done", projectId: result.projectId, written: result.written, unchanged: result.unchanged, kept: result.kept, recorded };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
