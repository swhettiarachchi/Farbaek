/**
 * What a person may ask for when starting a session, checked against their
 * plan. Only ids are accepted from the client (template, size, network
 * profile); CPU, memory and disk come from the catalog, so a forged request
 * can't ask for more than a size allows.
 */
import { z } from "zod";
import { NETWORK_PROFILES, type NetworkProfile } from "./network";
import { SANDBOX_SIZES, SIZE_IDS, TEMPLATE_IDS, type SizeId, type TemplateId } from "./templates";

export interface SessionLimits {
  maxSessionMinutes: number;
  idleMinutes: number;
  sizes: readonly SizeId[];
  networkProfiles: readonly NetworkProfile[];
}

export const CreateSessionSchema = z.object({
  name: z.string().trim().min(1, "Give the session a name.").max(80, "Use 80 characters or fewer."),
  template: z.enum(TEMPLATE_IDS),
  size: z.enum(SIZE_IDS),
  network: z.enum(NETWORK_PROFILES),
  minutes: z.coerce.number().int("Use whole minutes.").min(5, "Sessions last at least 5 minutes.").max(24 * 60),
  projectId: z.uuid().nullable(),
  taskId: z.uuid().nullable(),
  /** Workspace-relative folder prefixes to copy in; empty means the whole project. */
  include: z.array(z.string().max(512)).max(50).default([]),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

export interface SessionSpec {
  name: string;
  template: TemplateId;
  size: SizeId;
  vcpu: number;
  memoryMiB: number;
  diskMiB: number;
  network: NetworkProfile;
  ttlSeconds: number;
  idleSeconds: number;
  projectId: string | null;
  taskId: string | null;
  include: string[];
}

export type SpecResult = { ok: true; spec: SessionSpec } | { ok: false; field: string; reason: string };

export function sessionSpec(input: unknown, limits: SessionLimits): SpecResult {
  const parsed = CreateSessionSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, field: String(issue?.path[0] ?? "request"), reason: issue?.message ?? "The request isn't valid." };
  }
  const v = parsed.data;
  if (!limits.sizes.includes(v.size)) return { ok: false, field: "size", reason: `Your plan doesn't include the ${SANDBOX_SIZES[v.size].label} size.` };
  if (!limits.networkProfiles.includes(v.network)) return { ok: false, field: "network", reason: "Your plan doesn't include that network setting." };
  if (v.minutes > limits.maxSessionMinutes) {
    return { ok: false, field: "minutes", reason: `Your plan allows sessions of up to ${limits.maxSessionMinutes} minutes.` };
  }
  const include = [...new Set(v.include.map((p) => p.trim().replace(/^\/+|\/+$/g, "")).filter((p) => p.length > 0))];
  if (include.some((p) => p.split("/").includes("..") || p.includes("\\"))) return { ok: false, field: "include", reason: "Folder filters must stay inside the project." };
  const size = SANDBOX_SIZES[v.size];
  return {
    ok: true,
    spec: {
      name: v.name,
      template: v.template,
      size: v.size,
      vcpu: size.vcpu,
      memoryMiB: size.memoryMiB,
      diskMiB: size.diskMiB,
      network: v.network,
      ttlSeconds: v.minutes * 60,
      idleSeconds: limits.idleMinutes * 60,
      projectId: v.projectId,
      taskId: v.taskId,
      include,
    },
  };
}

/** Clamps a requested command timeout to the plan's limit. */
export function commandTimeoutSeconds(requested: unknown, maxSeconds: number): number {
  const n = typeof requested === "number" && Number.isFinite(requested) ? Math.floor(requested) : 120;
  return Math.max(1, Math.min(n, maxSeconds));
}

/** Whether a project path falls under one of the include prefixes (all paths when there are none). */
export function included(path: string, include: readonly string[]): boolean {
  return include.length === 0 || include.some((p) => path === p || path.startsWith(`${p}/`));
}
