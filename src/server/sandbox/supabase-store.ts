/**
 * SandboxStore backed by Supabase. Reads use the signed-in person's client,
 * so Row Level Security decides what they can see; writes call the
 * service-role-only app_* functions, which re-check ownership and limits.
 * System reads (sweeper, preview gateway) use the service role explicitly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SessionState } from "@/core/sandbox/lifecycle";
import {
  EXECUTION_SELECT,
  ExecutionRowSchema,
  SESSION_SELECT,
  SessionRowSchema,
  executionFromRow,
  sessionFromRow,
  type PreviewRecord,
  type ReceiptRecord,
  type RpcResult,
  type SandboxStore,
  type SessionEventRecord,
  type SessionRecord,
} from "./types";

const OPEN_STATES: SessionState[] = ["requested", "provisioning", "ready", "paused", "stopping"];

function fail(what: string, error: { message: string }): never {
  throw new Error(`Couldn't load ${what}: ${error.message}`);
}

const PreviewRow = z.object({
  id: z.string(),
  session_id: z.string().nullable(),
  org_id: z.string(),
  port: z.number().int().nullable(),
  project_id: z.string().nullable().default(null),
  created_by: z.string(),
  expires_at: z.string(),
  launched_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});
const previewFromRow = (r: z.infer<typeof PreviewRow>): PreviewRecord => ({
  id: r.id,
  sessionId: r.session_id,
  orgId: r.org_id,
  port: r.port,
  projectId: r.project_id,
  createdBy: r.created_by,
  expiresAt: r.expires_at,
  launchedAt: r.launched_at,
  revokedAt: r.revoked_at,
  createdAt: r.created_at,
});

export function createSupabaseSandboxStore(user: SupabaseClient | null, admin: SupabaseClient | null): SandboxStore {
  const reader = user ?? admin;
  if (!reader) throw new Error("A Supabase client is required.");

  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    if (!admin) return { ok: false, error: "WRITES_UNAVAILABLE" };
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  const voidResult = z.any().transform(() => null);
  const sessions = (rows: unknown) => z.array(SessionRowSchema).parse(rows).map(sessionFromRow);

  return {
    async getSession(id) {
      if (!z.uuid().safeParse(id).success) return null;
      const { data, error } = await reader.from("sandbox_sessions").select(SESSION_SELECT).eq("id", id).maybeSingle();
      if (error) fail("the session", error);
      return data ? sessionFromRow(SessionRowSchema.parse(data)) : null;
    },

    async getSessionAsSystem(id) {
      if (!admin || !z.uuid().safeParse(id).success) return null;
      const { data, error } = await admin.from("sandbox_sessions").select(SESSION_SELECT).eq("id", id).maybeSingle();
      if (error) fail("the session", error);
      return data ? sessionFromRow(SessionRowSchema.parse(data)) : null;
    },

    async listSessions(orgId, q) {
      let query = reader.from("sandbox_sessions").select(SESSION_SELECT, { count: "exact" }).eq("org_id", orgId);
      if (q.states && q.states.length > 0) query = query.in("state", [...q.states]);
      const search = q.search?.trim().replace(/[%_,()\\]/g, " ").slice(0, 80);
      if (search) query = query.ilike("name", `%${search}%`);
      query =
        q.sort === "oldest"
          ? query.order("created_at", { ascending: true })
          : q.sort === "name"
            ? query.order("name", { ascending: true }).order("created_at", { ascending: false })
            : q.sort === "expiring"
              ? query.order("expires_at", { ascending: true })
              : query.order("created_at", { ascending: false });
      const from = (q.page - 1) * q.pageSize;
      const { data, error, count } = await query.range(from, from + q.pageSize - 1);
      if (error) fail("sessions", error);
      return { rows: sessions(data ?? []), total: count ?? 0 };
    },

    async listExecutions(sessionId, limit) {
      const { data, error } = await reader.from("sandbox_executions").select(EXECUTION_SELECT).eq("session_id", sessionId).order("started_at", { ascending: false }).limit(limit);
      if (error) fail("commands", error);
      return z.array(ExecutionRowSchema).parse(data ?? []).map(executionFromRow);
    },

    async recentExecutions(orgId, limit) {
      const { data, error } = await reader.from("sandbox_executions").select(EXECUTION_SELECT).eq("org_id", orgId).order("started_at", { ascending: false }).limit(limit);
      if (error) fail("recent commands", error);
      return z.array(ExecutionRowSchema).parse(data ?? []).map(executionFromRow);
    },

    async getExecution(id) {
      if (!z.uuid().safeParse(id).success) return null;
      const { data, error } = await reader.from("sandbox_executions").select(EXECUTION_SELECT).eq("id", id).maybeSingle();
      if (error) fail("the command", error);
      return data ? executionFromRow(ExecutionRowSchema.parse(data)) : null;
    },

    async listEvents(sessionId, limit): Promise<SessionEventRecord[]> {
      const { data, error } = await reader
        .from("sandbox_events")
        .select("id, actor_id, event, from_state, to_state, detail, occurred_at")
        .eq("session_id", sessionId)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) fail("session history", error);
      return z
        .array(
          z.object({
            id: z.number(),
            actor_id: z.string().nullable(),
            event: z.string(),
            from_state: z.string().nullable(),
            to_state: z.string().nullable(),
            detail: z.record(z.string(), z.unknown()).catch({}),
            occurred_at: z.string(),
          }),
        )
        .parse(data ?? [])
        .map((r) => ({ id: r.id, actorId: r.actor_id, event: r.event, fromState: r.from_state, toState: r.to_state, detail: r.detail, occurredAt: r.occurred_at }));
    },

    async listPreviews(sessionId) {
      const { data, error } = await reader.from("sandbox_previews").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(20);
      if (error) fail("previews", error);
      return z.array(PreviewRow).parse(data ?? []).map(previewFromRow);
    },

    async getPreview(id) {
      if (!admin || !/^[a-z2-7]{26}$/.test(id)) return null;
      const { data, error } = await admin.from("sandbox_previews").select("*").eq("id", id).maybeSingle();
      if (error) fail("the preview", error);
      return data ? previewFromRow(PreviewRow.parse(data)) : null;
    },

    async listReceipts(filter, limit): Promise<ReceiptRecord[]> {
      let query = reader.from("sandbox_receipts").select("digest, session_id, task_id, status, statement, created_by, created_at");
      if (filter.sessionId) query = query.eq("session_id", filter.sessionId);
      if (filter.taskId) query = query.eq("task_id", filter.taskId);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
      if (error) fail("receipts", error);
      return z
        .array(
          z.object({
            digest: z.string(),
            session_id: z.string(),
            task_id: z.string().nullable(),
            status: z.enum(["verified", "partially_verified", "failed", "unverified"]),
            statement: z.unknown(),
            created_by: z.string(),
            created_at: z.string(),
          }),
        )
        .parse(data ?? [])
        .map((r) => ({ digest: r.digest, sessionId: r.session_id, taskId: r.task_id, status: r.status, statement: r.statement, createdBy: r.created_by, createdAt: r.created_at }));
    },

    async usageSince(orgId, since) {
      const { data, error } = await reader.from("sandbox_sessions").select(SESSION_SELECT).eq("org_id", orgId).gte("created_at", since.toISOString()).limit(1000);
      if (error) fail("usage", error);
      const rows = sessions(data ?? []);
      let activeExecutionMs = 0;
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        for (let i = 0; i < ids.length; i += 200) {
          const { data: ex, error: exError } = await reader.from("sandbox_executions").select("duration_ms").in("session_id", ids.slice(i, i + 200)).not("duration_ms", "is", null).limit(10000);
          if (exError) fail("usage", exError);
          for (const e of z.array(z.object({ duration_ms: z.number() })).parse(ex ?? [])) activeExecutionMs += e.duration_ms;
        }
      }
      return { sessions: rows, activeExecutionMs };
    },

    async projectSnapshot(orgId, projectId, maxFiles, maxBytes) {
      const { data, error } = await reader
        .from("project_files")
        .select("path, revision, sha256, size_bytes")
        .eq("org_id", orgId)
        .eq("project_id", projectId)
        .order("path")
        .limit(maxFiles + 1);
      if (error) fail("project files", error);
      const files = z.array(z.object({ path: z.string(), revision: z.number().int(), sha256: z.string(), size_bytes: z.number().int() })).parse(data ?? []);
      if (files.length > maxFiles || files.reduce((n, f) => n + f.size_bytes, 0) > maxBytes) return "too_large";
      const out: { path: string; sha256: string; content: string }[] = [];
      for (let i = 0; i < files.length; i += 150) {
        const chunk = files.slice(i, i + 150);
        const { data: revs, error: revError } = await reader
          .from("project_file_revisions")
          .select("path, revision, content")
          .eq("org_id", orgId)
          .eq("project_id", projectId)
          .in("path", chunk.map((f) => f.path))
          .not("content", "is", null);
        if (revError) fail("project files", revError);
        const byKey = new Map(z.array(z.object({ path: z.string(), revision: z.number().int(), content: z.string() })).parse(revs ?? []).map((r) => [`${r.path}@${r.revision}`, r.content]));
        for (const f of chunk) {
          const content = byKey.get(`${f.path}@${f.revision}`);
          if (content !== undefined) out.push({ path: f.path, sha256: f.sha256, content });
        }
      }
      return out;
    },

    createSession: (i) =>
      rpc(
        "app_create_sandbox_session",
        {
          p_org: i.orgId,
          p_actor: i.actor,
          p_project: i.projectId,
          p_task: i.taskId,
          p_name: i.name,
          p_template: i.template,
          p_size: i.size,
          p_image: i.image,
          p_network: i.network,
          p_vcpu: i.vcpu,
          p_memory_mib: i.memoryMiB,
          p_provider: i.provider,
          p_isolation: i.isolation,
          p_ttl_seconds: i.ttlSeconds,
          p_idle_seconds: i.idleSeconds,
          p_max_concurrent: i.maxConcurrent,
          p_minutes_allowance: i.minutesAllowance,
          p_period_start: i.periodStart.toISOString(),
          p_idempotency_key: i.idempotencyKey,
        },
        z.array(z.object({ session_id: z.string(), created: z.boolean() })).length(1).transform((r) => ({ sessionId: r[0]!.session_id, created: r[0]!.created })),
      ),

    transition: (sessionId, actor, expectedVersion, event, patch) =>
      rpc("app_transition_sandbox_session", { p_session: sessionId, p_actor: actor, p_expected_version: expectedVersion, p_event: event, p_patch: patch }, z.number().int()),

    recordCleanup: (sessionId, ok, message) => rpc("app_record_sandbox_cleanup", { p_session: sessionId, p_ok: ok, p_message: message }, voidResult),
    recordMetrics: (sessionId, sample) => rpc("app_record_sandbox_metrics", { p_session: sessionId, p_metrics: sample }, voidResult),

    startExecution: (i) =>
      rpc(
        "app_start_sandbox_execution",
        {
          p_session: i.sessionId,
          p_actor: i.actor,
          p_kind: i.kind,
          p_label: i.label,
          p_command: i.command,
          p_timeout_seconds: i.timeoutSeconds,
          p_policy: i.policy,
          p_idempotency_key: i.idempotencyKey,
        },
        z.array(z.object({ execution_id: z.string(), created: z.boolean() })).length(1).transform((r) => ({ executionId: r[0]!.execution_id, created: r[0]!.created })),
      ),

    setExecutionPid: (id, pid) => rpc("app_set_sandbox_execution_pid", { p_execution: id, p_pid: pid }, voidResult),

    finishExecution: (i) =>
      rpc(
        "app_finish_sandbox_execution",
        {
          p_execution: i.executionId,
          p_state: i.state,
          p_exit_code: i.exitCode,
          p_duration_ms: i.durationMs,
          p_stdout: i.stdout,
          p_stderr: i.stderr,
          p_stdout_truncated: i.stdoutTruncated,
          p_stderr_truncated: i.stderrTruncated,
          p_stdout_sha256: i.stdoutSha256,
          p_stderr_sha256: i.stderrSha256,
          p_failure: i.failure,
        },
        voidResult,
      ),

    requestCancel: (id, actor) =>
      rpc(
        "app_request_sandbox_cancel",
        { p_execution: id, p_actor: actor },
        z
          .array(z.object({ pid: z.number().int().nullable(), provider_sandbox_id: z.string().nullable(), already_finished: z.boolean() }))
          .length(1)
          .transform((r) => ({ pid: r[0]!.pid, providerSandboxId: r[0]!.provider_sandbox_id, alreadyFinished: r[0]!.already_finished })),
      ),

    touchSession: (sessionId, actor) => rpc("app_touch_sandbox_session", { p_session: sessionId, p_actor: actor }, voidResult),

    createPreview: (i) => rpc("app_create_sandbox_preview", { p_session: i.sessionId, p_actor: i.actor, p_id: i.id, p_port: i.port, p_ttl_seconds: i.ttlSeconds }, z.string()),

    launchPreview: (id, user) =>
      rpc(
        "app_launch_sandbox_preview",
        { p_id: id, p_user: user },
        z
          .array(z.object({ session_id: z.string().nullable(), port: z.number().int().nullable(), expires_at: z.string() }))
          .length(1)
          .transform((r) => ({ sessionId: r[0]!.session_id, port: r[0]!.port, expiresAt: r[0]!.expires_at })),
      ),

    revokePreview: (id, actor) => rpc("app_revoke_sandbox_preview", { p_id: id, p_actor: actor }, voidResult),

    createProjectPreview: (i) => rpc("app_create_project_preview", { p_project: i.projectId, p_actor: i.actor, p_id: i.id, p_ttl_seconds: i.ttlSeconds }, z.string()),

    async projectFileAsSystem(orgId, projectId, path) {
      if (!admin) return null;
      const current = await admin.from("project_files").select("revision").eq("org_id", orgId).eq("project_id", projectId).eq("path", path).maybeSingle();
      if (current.error) fail("the file", current.error);
      if (!current.data) return null;
      const { data, error } = await admin
        .from("project_file_revisions")
        .select("content")
        .eq("org_id", orgId)
        .eq("project_id", projectId)
        .eq("path", path)
        .eq("revision", z.number().int().parse(current.data.revision))
        .maybeSingle();
      if (error) fail("the file", error);
      return typeof data?.content === "string" ? data.content : null;
    },

    recordReceipt: (i) =>
      rpc("app_record_sandbox_receipt", { p_session: i.sessionId, p_actor: i.actor, p_digest: i.digest, p_status: i.status, p_statement: i.statement }, voidResult),

    async rateLimit(key, windowSeconds, limit) {
      const r = await rpc("app_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit }, z.boolean());
      // Fail closed: if the counter can't be read, the request is refused.
      return r.ok ? r.value : false;
    },

    prune: (before) => rpc("app_prune_sandbox_history", { p_before: before.toISOString() }, z.number().int()),

    async sessionsToSweep(now, limit) {
      if (!admin) return [];
      const { data, error } = await admin
        .from("sandbox_sessions")
        .select(SESSION_SELECT)
        .or(`state.in.(${OPEN_STATES.join(",")}),cleanup_status.in.(pending,failed)`)
        .order("updated_at", { ascending: true })
        .limit(limit);
      if (error) fail("sessions to sweep", error);
      void now;
      return sessions(data ?? []);
    },

    async memberRoleAsSystem(orgId, userId) {
      if (!admin) return null;
      const { data, error } = await admin.from("organization_members").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      if (error) fail("membership", error);
      return z.object({ role: z.string() }).nullable().catch(null).parse(data)?.role ?? null;
    },

    async overdueExecutions(now, limit) {
      if (!admin) return [];
      const { data, error } = await admin.from("sandbox_executions").select(EXECUTION_SELECT).eq("state", "running").lt("deadline_at", now.toISOString()).limit(limit);
      if (error) fail("overdue commands", error);
      return z.array(ExecutionRowSchema).parse(data ?? []).map(executionFromRow);
    },
  } satisfies SandboxStore;
}

export type { SessionRecord };
