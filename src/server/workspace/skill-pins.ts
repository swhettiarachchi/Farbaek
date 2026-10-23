import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SkillPin } from "@/core/agent/skill-pins";
import { isProjectSkillPath } from "@/core/agent/skills";
import { codeFromDatabaseError, fail, MESSAGES, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

const PinRow = z.object({
  path: z.string(),
  revision: z.number().int(),
  sha256: z.string(),
  pinned_by: z.string().nullable(),
  pinned_at: z.string(),
});

export interface SkillPinRecord extends SkillPin {
  path: string;
  /** Null for skills pinned when pinning began, which were already in use. */
  pinnedBy: string | null;
  pinnedAt: string;
}

/**
 * A project's skill pins (ADR 0043). With the person's client, Row Level
 * Security limits it to their workspaces; with the server's, the org filter does.
 */
export async function readSkillPins(client: SupabaseClient, orgId: string, projectId: string): Promise<SkillPinRecord[]> {
  if (!z.uuid().safeParse(projectId).success) return [];
  const { data, error } = await client
    .from("project_skill_pins")
    .select("path, revision, sha256, pinned_by, pinned_at")
    .eq("org_id", orgId)
    .eq("project_id", projectId);
  if (error) throw new Error(`Couldn't read the skill approvals: ${error.message}`);
  return z
    .array(PinRow)
    .parse(data)
    .map((r) => ({ path: r.path, revision: r.revision, sha256: r.sha256, pinnedBy: r.pinned_by, pinnedAt: r.pinned_at }));
}

export const pinMap = (pins: readonly SkillPinRecord[]): Map<string, SkillPin> => new Map(pins.map((p) => [p.path, { revision: p.revision, sha256: p.sha256 }]));

export interface SkillPinDeps {
  pinSkill(input: { projectId: string; actor: string; path: string; revision: number; sha256: string }): Promise<RpcResult<null>>;
  unpinSkill(input: { projectId: string; actor: string; path: string }): Promise<RpcResult<null>>;
}

/**
 * Approves a project skill at the exact revision and hash the person
 * reviewed. The database checks again that the file is still that version.
 */
export async function pinProjectSkill(
  deps: WriteDeps & SkillPinDeps,
  input: { orgId: string; userId: string; projectId: string; path: string; revision: number; sha256: string },
): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  if (!isProjectSkillPath(input.path)) return fail("INVALID_PATH", "Only a project's skill files can be approved.");
  const result = await deps.pinSkill({ projectId: input.projectId, actor: input.userId, path: input.path, revision: input.revision, sha256: input.sha256 });
  if (result.ok) return result;
  const code = codeFromDatabaseError(result.error);
  return fail(code, code === "FILE_CHANGED" ? "This skill changed again since you opened it, so it wasn't approved. Reload to review the latest version." : MESSAGES[code]);
}

/** Withdraws a skill's approval, for example when its file is removed. */
export async function unpinProjectSkill(deps: WriteDeps & SkillPinDeps, input: { orgId: string; userId: string; projectId: string; path: string }): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  if (!isProjectSkillPath(input.path)) return fail("INVALID_PATH");
  const result = await deps.unpinSkill({ projectId: input.projectId, actor: input.userId, path: input.path });
  return result.ok ? result : fail(codeFromDatabaseError(result.error));
}
