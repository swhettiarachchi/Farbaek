import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { IntentContractSchema } from "@/core/realityloop/contract";
import { ORGANIZATION_SELECT, summarizeOrganizations } from "./organizations";
import {
  MemberRow,
  ProjectRowSchema,
  TaskRowSchema,
  TransitionRowSchema,
  type Project,
  type Task,
  type Transition,
  type WorkspaceReader,
} from "./types";

/**
 * Reads with the signed-in user's session. Row Level Security limits every
 * query to organizations the user belongs to; the explicit org_id filters
 * are for correctness, not for security.
 */
export function createSupabaseReader(client: SupabaseClient): WorkspaceReader {
  const toProject = (r: z.infer<typeof ProjectRowSchema>): Project => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
  });

  const TaskWithProject = TaskRowSchema.extend({
    projects: z.union([z.object({ name: z.string() }), z.array(z.object({ name: z.string() }))]).nullable().optional(),
  });
  const toTask = (r: z.infer<typeof TaskWithProject>): Task => {
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    return {
      id: r.id,
      title: r.title,
      state: r.state,
      version: r.version,
      projectId: r.project_id,
      projectName: project?.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  };
  const TASK_SELECT = "id, title, state, version, project_id, created_at, updated_at, projects(name)";

  function fail(what: string, error: { message: string } | null): never {
    throw new Error(`Couldn't load ${what}: ${error?.message ?? "unknown error"}`);
  }

  return {
    mode: "live",

    async listWorkspaces() {
      const { data, error } = await client.from("organizations").select(ORGANIZATION_SELECT).order("created_at");
      if (error) fail("workspaces", error);
      return summarizeOrganizations(data, new Date());
    },

    async listMembers(orgId) {
      const { data, error } = await client.from("organization_members").select("user_id, role, created_at").eq("org_id", orgId).order("created_at");
      if (error) fail("members", error);
      return z
        .array(MemberRow)
        .parse(data)
        .map((m) => ({ userId: m.user_id, role: m.role, joinedAt: m.created_at }));
    },

    async listProjects(orgId) {
      const { data, error } = await client
        .from("projects")
        .select("id, name, description, created_at")
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) fail("projects", error);
      return z.array(ProjectRowSchema).parse(data).map(toProject);
    },

    async getProject(orgId, projectId) {
      if (!z.uuid().safeParse(projectId).success) return null;
      const { data, error } = await client
        .from("projects")
        .select("id, name, description, created_at")
        .eq("org_id", orgId)
        .eq("id", projectId)
        .is("archived_at", null)
        .maybeSingle();
      if (error) fail("the project", error);
      return data ? toProject(ProjectRowSchema.parse(data)) : null;
    },

    async listTasks(orgId, options = {}) {
      let query = client.from("tasks").select(TASK_SELECT).eq("org_id", orgId);
      if (options.projectId) query = query.eq("project_id", options.projectId);
      const { data, error } = await query.order("updated_at", { ascending: false }).limit(options.limit ?? 200);
      if (error) fail("tasks", error);
      return z.array(TaskWithProject).parse(data).map(toTask);
    },

    async getTask(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return null;
      const [{ data: row, error }, { data: rows, error: historyError }] = await Promise.all([
        client.from("tasks").select(TASK_SELECT).eq("org_id", orgId).eq("id", taskId).maybeSingle(),
        client
          .from("task_transitions")
          .select("event_id, event_type, from_state, to_state, actor_kind, actor_id, occurred_at")
          .eq("org_id", orgId)
          .eq("task_id", taskId)
          .order("occurred_at"),
      ]);
      if (error) fail("the task", error);
      if (historyError) fail("the task history", historyError);
      if (!row) return null;
      const history: Transition[] = z
        .array(TransitionRowSchema)
        .parse(rows)
        .map((t) => ({
          eventId: t.event_id,
          eventType: t.event_type,
          from: t.from_state,
          to: t.to_state,
          actorKind: t.actor_kind,
          actorId: t.actor_id,
          at: t.occurred_at,
        }));
      return { task: toTask(TaskWithProject.parse(row)), history };
    },

    async getContract(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return null;
      const { data, error } = await client
        .from("intent_contracts")
        .select("version, status, sha256, body, created_at, approved_at")
        .eq("org_id", orgId)
        .eq("task_id", taskId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("the contract", error);
      if (!data) return null;
      const row = z
        .object({
          version: z.number().int(),
          status: z.enum(["draft", "approved", "superseded"]),
          sha256: z.string(),
          body: IntentContractSchema,
          created_at: z.string(),
          approved_at: z.string().nullable(),
        })
        .parse(data);
      return { version: row.version, status: row.status, sha256: row.sha256, body: row.body, createdAt: row.created_at, approvedAt: row.approved_at };
    },

    async countEvaluations(orgId, from, to) {
      const { count, error } = await client
        .from("evaluation_events")
        .select("org_id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("occurred_at", from.toISOString())
        .lt("occurred_at", to.toISOString());
      if (error) fail("usage", error);
      return count ?? 0;
    },

    async countAiCredits(orgId, from, to) {
      const { data, error } = await client.rpc("ai_credits_used", { p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) fail("AI credit usage", error);
      return z.number().int().nonnegative().parse(data);
    },
  };
}
