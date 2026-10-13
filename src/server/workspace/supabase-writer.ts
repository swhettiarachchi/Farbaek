import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TASK_STATES } from "@/core/realityloop/task-machine";
import { ORGANIZATION_SELECT, billingSnapshotFromRow } from "./organizations";
import { ORG_ROLES } from "./types";
import type { RpcResult, WriteDeps } from "./use-cases";

/**
 * WriteDeps backed by Supabase. Reads use the signed-in user's client (Row
 * Level Security applies); writes call the service-role-only app_* functions.
 */
export function createSupabaseWriteDeps(user: SupabaseClient, admin: SupabaseClient, userId: string): WriteDeps {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }

  return {
    async role(orgId) {
      const { data } = await user.from("organization_members").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      const parsed = z.object({ role: z.enum(ORG_ROLES) }).safeParse(data);
      return parsed.success ? parsed.data.role : null;
    },

    async billing(orgId) {
      const { data, error } = await user.from("organizations").select(ORGANIZATION_SELECT).eq("id", orgId).maybeSingle();
      if (error || !data) return null;
      try {
        return billingSnapshotFromRow(data);
      } catch {
        return null;
      }
    },

    async countActiveProjects(orgId) {
      const { count, error } = await user.from("projects").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null);
      if (error) throw new Error(`Couldn't count projects: ${error.message}`);
      return count ?? 0;
    },

    async loadTask(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return null;
      const [{ data: task }, { data: history }] = await Promise.all([
        user.from("tasks").select("id, project_id, state, version").eq("org_id", orgId).eq("id", taskId).maybeSingle(),
        user.from("task_transitions").select("event_id").eq("org_id", orgId).eq("task_id", taskId),
      ]);
      const parsed = z.object({ id: z.string(), project_id: z.string(), state: z.enum(TASK_STATES), version: z.number().int() }).safeParse(task);
      if (!parsed.success) return null;
      const eventIds = z.array(z.object({ event_id: z.string() })).catch([]).parse(history).map((h) => h.event_id);
      const { project_id, ...rest } = parsed.data;
      return { ...rest, projectId: project_id, eventIds };
    },

    createProject: (i) =>
      rpc("app_create_project", { p_org: i.orgId, p_actor: i.actor, p_name: i.name, p_description: i.description, p_limit: i.limit }, z.string()),

    createTask: (i) => rpc("app_create_task", { p_org: i.orgId, p_actor: i.actor, p_project: i.projectId, p_title: i.title }, z.string()),

    applyTransition: (i) =>
      rpc(
        "app_apply_task_transition",
        {
          p_task: i.taskId,
          p_actor_user: i.actor,
          p_actor_kind: "user",
          p_actor_id: i.actor,
          p_event_id: i.eventId,
          p_event_type: i.eventType,
          p_from: i.from,
          p_to: i.to,
          p_expected_version: i.expectedVersion,
        },
        z.number().int(),
      ),

    saveContract: (i) =>
      rpc(
        "app_save_contract",
        {
          p_task: i.taskId,
          p_actor: i.actor,
          p_body: i.body,
          p_sha256: i.sha256,
          p_based_on: i.basedOn,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
        },
        z.number().int(),
      ),

    approveContract: (i) =>
      rpc(
        "app_approve_contract",
        {
          p_task: i.taskId,
          p_actor: i.actor,
          p_version: i.version,
          p_sha256: i.sha256,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
        },
        z.null().or(z.literal("")).transform(() => null),
      ),

    newEventId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}
