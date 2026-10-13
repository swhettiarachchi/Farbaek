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

    async listFiles(orgId, projectId) {
      if (!z.uuid().safeParse(projectId).success) return [];
      const Row = z.object({ path: z.string(), revision: z.number().int(), size_bytes: z.number().int(), sha256: z.string(), updated_at: z.string() });
      // PostgREST returns at most 1,000 rows per request, so read in pages.
      const PAGE = 1000;
      const rows: z.infer<typeof Row>[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from("project_files")
          .select("path, revision, size_bytes, sha256, updated_at")
          .eq("org_id", orgId)
          .eq("project_id", projectId)
          .order("path")
          .range(from, from + PAGE - 1);
        if (error) fail("files", error);
        const page = z.array(Row).parse(data);
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      return rows.map((r) => ({ path: r.path, revision: r.revision, sizeBytes: r.size_bytes, sha256: r.sha256, updatedAt: r.updated_at }));
    },

    async getFile(orgId, projectId, path) {
      if (!z.uuid().safeParse(projectId).success) return null;
      const project = await client.from("projects").select("id").eq("org_id", orgId).eq("id", projectId).maybeSingle();
      if (project.error) fail("project", project.error);
      if (!project.data) return null;
      const { data, error } = await client.rpc("get_project_file", { p_project: projectId, p_path: path });
      if (error) fail("file", error);
      const Row = z.object({ path: z.string(), revision: z.number().int(), size_bytes: z.number().int(), sha256: z.string(), content: z.string(), updated_at: z.string() });
      const row = z.array(Row).parse(data)[0];
      return row ? { path: row.path, revision: row.revision, sizeBytes: row.size_bytes, sha256: row.sha256, content: row.content, updatedAt: row.updated_at } : null;
    },

    async listFileRevisions(orgId, projectId, path) {
      if (!z.uuid().safeParse(projectId).success) return [];
      const { data, error } = await client
        .from("project_file_revisions")
        .select("revision, change, size_bytes, sha256, created_at")
        .eq("org_id", orgId)
        .eq("project_id", projectId)
        .eq("path", path)
        .order("revision", { ascending: false })
        .limit(200);
      if (error) fail("file history", error);
      return z
        .array(z.object({ revision: z.number().int(), change: z.enum(["import", "edit", "delete"]), size_bytes: z.number().int().nullable(), sha256: z.string().nullable(), created_at: z.string() }))
        .parse(data)
        .map((r) => ({ revision: r.revision, change: r.change, sizeBytes: r.size_bytes, sha256: r.sha256, createdAt: r.created_at }));
    },

    async getFileRevision(orgId, projectId, path, revision) {
      if (!z.uuid().safeParse(projectId).success || !Number.isInteger(revision) || revision < 1) return null;
      const { data, error } = await client
        .from("project_file_revisions")
        .select("content")
        .eq("org_id", orgId)
        .eq("project_id", projectId)
        .eq("path", path)
        .eq("revision", revision)
        .maybeSingle();
      if (error) fail("file revision", error);
      return z.object({ content: z.string().nullable() }).nullable().parse(data)?.content ?? null;
    },

    async searchFiles(orgId, projectId, query) {
      const q = query.trim();
      if (!q || q.length > 200 || !z.uuid().safeParse(projectId).success) return [];
      const project = await client.from("projects").select("id").eq("org_id", orgId).eq("id", projectId).maybeSingle();
      if (project.error) fail("project", project.error);
      if (!project.data) return [];
      const { data, error } = await client.rpc("search_project_files", { p_project: projectId, p_query: q });
      if (error) fail("search results", error);
      return z.array(z.object({ path: z.string(), line: z.number().int(), text: z.string() })).parse(data);
    },

    async countAiCredits(orgId, from, to) {
      const { data, error } = await client.rpc("ai_credits_used", { p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) fail("AI credit usage", error);
      return z.number().int().nonnegative().parse(data);
    },
  };
}
