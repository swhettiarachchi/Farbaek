import "server-only";

/**
 * Workspace Capsules on the server (ADR 0037): packing a project for
 * download, opening an uploaded Capsule again (the browser's preview is
 * advisory; this is the decision), applying the person's choices through
 * the ordinary import path, and recording each Capsule.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CAPSULE_LIMITS, WORKSPACE_LIMITS } from "@/config/workspace";
import { buildCapsule, encodeCapsule, fileHash, filesToWrite, manifestDigest, openCapsule, planImport, type CapsuleFile, type CapsuleLimits, type ImportChoice } from "@/core/mesh/capsule";
import { importProjectFiles, saveProjectImage, type FileDeps } from "@/server/workspace/files";
import type { WorkspaceReader } from "@/server/workspace/types";
import { createProject, type WriteDeps } from "@/server/workspace/use-cases";

/** What a Capsule may hold when it's opened here. The upload limit for server actions sits just above. */
export const OPEN_LIMITS: CapsuleLimits = CAPSULE_LIMITS;

export interface PackedCapsule {
  bytes: Uint8Array<ArrayBuffer>;
  digest: string;
  fileName: string;
  files: number;
  totalBytes: number;
  excluded: { path: string; reason: string }[];
}

/** Packs the project's current files. */
export async function packProject(reader: WorkspaceReader, orgId: string, projectId: string): Promise<PackedCapsule | null> {
  const project = await reader.getProject(orgId, projectId);
  if (!project) return null;
  const files = await projectFiles(reader, orgId, projectId);
  const built = buildCapsule({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    files,
    maxFileBytes: WORKSPACE_LIMITS.maxFileBytes,
  });
  const slug = project.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
  return {
    bytes: encodeCapsule(built),
    digest: manifestDigest(built.manifest),
    fileName: `${slug}.capsule.zip`,
    files: built.manifest.totals.files,
    totalBytes: built.manifest.totals.bytes,
    excluded: built.excluded,
  };
}

/** A project's current files: text as text, and images (ADR 0108) as their bytes. */
async function projectFiles(reader: WorkspaceReader, orgId: string, projectId: string): Promise<CapsuleFile[]> {
  const [texts, images] = await Promise.all([reader.getProjectContents(orgId, projectId), reader.getProjectImages(orgId, projectId)]);
  return [...texts, ...images.map((i) => ({ path: i.path, content: new Uint8Array(Buffer.from(i.base64, "base64")) }))];
}

/** The BLAKE3 hash of each current file, for comparing with a Capsule. An image's hash is over its bytes. */
export async function projectHashes(reader: WorkspaceReader, orgId: string, projectId: string): Promise<{ path: string; blake3: string }[]> {
  const files = await projectFiles(reader, orgId, projectId);
  return files.map((f) => ({ path: f.path, blake3: fileHash(f.content) }));
}

export type CapsuleImportResult =
  | { ok: true; projectId: string; written: number; unchanged: number; kept: number; batches: number }
  | { ok: false; message: string; problems?: string[] };

/**
 * Opens the uploaded Capsule again and applies the choices. A new project gets
 * every file; an existing one gets only what the person chose, and differing
 * files default to keeping theirs. Writes go through importProjectFiles,
 * which screens every file again, in batches under the import limit.
 */
export async function importCapsule(
  deps: WriteDeps & FileDeps,
  reader: WorkspaceReader,
  input: { orgId: string; userId: string; data: Uint8Array; destination: { kind: "new"; name: string } | { kind: "existing"; projectId: string }; choices: Record<string, ImportChoice> },
): Promise<CapsuleImportResult & { digest?: string; files?: number; bytes?: number; excluded?: number }> {
  const opened = await openCapsule(input.data, OPEN_LIMITS);
  if (!opened.ok) return { ok: false, message: "This Capsule didn't pass its checks, so nothing was written.", problems: opened.problems };
  const { manifest, files } = opened;

  let projectId: string;
  let toWrite: CapsuleFile[];
  let unchanged = 0;
  let kept = 0;
  // Each image is saved over the revision it replaces; a new path starts at 0.
  let revisions = new Map<string, number>();
  if (input.destination.kind === "new") {
    const created = await createProject(deps, { orgId: input.orgId, userId: input.userId, name: input.destination.name, description: "Opened from a Workspace Capsule." });
    if (!created.ok) return { ok: false, message: created.message };
    projectId = created.value;
    toWrite = files;
  } else {
    const project = await reader.getProject(input.orgId, input.destination.projectId);
    if (!project) return { ok: false, message: "That project isn't in this workspace." };
    if (project.archivedAt) return { ok: false, message: "That project is archived. Restore it first, or open the Capsule as a new project." };
    projectId = project.id;
    const current = await projectFiles(reader, input.orgId, projectId);
    const plan = planImport(manifest, current.map((f) => ({ path: f.path, blake3: fileHash(f.content) })));
    toWrite = filesToWrite(files, plan, input.choices, current.map((f) => f.path));
    revisions = new Map((await reader.listFiles(input.orgId, projectId)).map((f) => [f.path, f.revision]));
    unchanged = plan.filter((p) => p.status === "unchanged").length;
    kept = plan.filter((p) => p.status === "differs" && (input.choices[p.path] ?? p.choice) === "keep_mine").length;
  }

  let written = 0;
  const texts = toWrite.filter((f): f is { path: string; content: string } => typeof f.content === "string");
  const images = toWrite.filter((f): f is { path: string; content: Uint8Array } => typeof f.content !== "string");
  const batches = batch(texts, WORKSPACE_LIMITS.maxImportBytes);
  for (const files of batches) {
    const stored = await importProjectFiles(deps, { orgId: input.orgId, userId: input.userId, projectId, files });
    if (!stored.ok) {
      return written === 0 && input.destination.kind === "existing"
        ? { ok: false, message: stored.message }
        : { ok: false, message: `${written} files were written before this stopped: ${stored.message} Open the project to see where it got to.` };
    }
    written += stored.value.created + stored.value.updated;
  }
  // Images one at a time, each checked again by its bytes and saved through the same path as an upload.
  for (const image of images) {
    const saved = await saveProjectImage(deps, { orgId: input.orgId, userId: input.userId, projectId, path: image.path, bytes: image.content, expectedRevision: revisions.get(image.path) ?? 0 });
    if (!saved.ok) {
      return written === 0 && input.destination.kind === "existing"
        ? { ok: false, message: `${image.path}: ${saved.message}` }
        : { ok: false, message: `${written} files were written before this stopped at ${image.path}: ${saved.message} Open the project to see where it got to.` };
    }
    written += 1;
  }
  return {
    ok: true,
    projectId,
    written,
    unchanged,
    kept,
    batches: batches.length,
    digest: opened.digest,
    files: manifest.totals.files,
    bytes: manifest.totals.bytes,
    excluded: manifest.excluded.length,
  };
}

/** Groups files so each import stays under the byte limit. */
function batch(files: readonly { path: string; content: string }[], maxBytes: number): { path: string; content: string }[][] {
  const out: { path: string; content: string }[][] = [];
  let current: { path: string; content: string }[] = [];
  let size = 0;
  for (const f of files) {
    const bytes = new TextEncoder().encode(f.content).length;
    if (current.length > 0 && size + bytes > maxBytes) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += bytes;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Records one Capsule through the service-role function. A failed record never undoes the transfer; it's reported. */
export async function recordCapsule(
  admin: SupabaseClient,
  input: { orgId: string; userId: string; projectId: string | null; direction: "export" | "import"; digest: string; projectName: string; files: number; bytes: number; excluded: number },
): Promise<boolean> {
  const { error } = await admin.rpc("app_record_capsule", {
    p_org: input.orgId,
    p_actor: input.userId,
    p_project: input.projectId,
    p_direction: input.direction,
    p_digest: input.digest,
    p_project_name: input.projectName,
    p_files: input.files,
    p_bytes: input.bytes,
    p_excluded: input.excluded,
  });
  return !error;
}

const HistoryRow = z.object({
  id: z.number(),
  direction: z.enum(["export", "import"]),
  digest: z.string(),
  project_id: z.string().nullable(),
  project_name: z.string(),
  files: z.number(),
  bytes: z.number(),
  excluded: z.number(),
  created_at: z.string(),
});

export interface CapsuleRecord {
  id: number;
  direction: "export" | "import";
  digest: string;
  projectId: string | null;
  projectName: string;
  files: number;
  bytes: number;
  excluded: number;
  createdAt: string;
}

/** The workspace's recent Capsules, read as the person under RLS. */
export async function listCapsules(client: SupabaseClient, orgId: string, limit = 20): Promise<CapsuleRecord[]> {
  const { data, error } = await client
    .from("workspace_capsules")
    .select("id, direction, digest, project_id, project_name, files, bytes, excluded, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const rows = z.array(HistoryRow).safeParse(data);
  if (!rows.success) return [];
  return rows.data.map((r) => ({
    id: r.id,
    direction: r.direction,
    digest: r.digest,
    projectId: r.project_id,
    projectName: r.project_name,
    files: r.files,
    bytes: r.bytes,
    excluded: r.excluded,
    createdAt: r.created_at,
  }));
}
