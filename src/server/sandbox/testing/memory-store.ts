/**
 * An in-memory SandboxStore for service tests. TESTS ONLY. It follows the
 * same rules as the SQL functions in migration 10 (ownership, idempotency,
 * version checks, one running command, launch-once previews); the database
 * itself is tested separately in tests/db/sandboxes.test.ts.
 */
import { nextSessionState, TERMINAL_SESSION_STATES, type SessionEvent } from "@/core/sandbox/lifecycle";
import { runningSeconds } from "@/core/sandbox/usage";
import type { ExecutionRecord, PreviewRecord, ReceiptRecord, RpcResult, SandboxStore, SessionRecord } from "../types";

type Role = "owner" | "admin" | "member" | "viewer";

export interface MemoryStore extends SandboxStore {
  sessions: Map<string, SessionRecord>;
  executions: Map<string, ExecutionRecord & { pid: number | null; idem: string }>;
  previews: Map<string, PreviewRecord>;
  receipts: Map<string, ReceiptRecord>;
  events: { session: string; event: string; actor: string | null }[];
  members: Map<string, Map<string, Role>>;
  files: Map<string, { path: string; sha256: string; content: string; encoding?: "base64" }[]>;
  /** Which workspace each project belongs to, for project previews. */
  projectOrgs: Map<string, string>;
  rateHits: Map<string, number>;
  rateLimitOverride: number | null;
}

const ok = <T>(value: T): RpcResult<T> => ({ ok: true, value });
const no = <T>(error: string): RpcResult<T> => ({ ok: false, error });

export function createMemoryStore(now: () => Date, viewer: () => string | null = () => null): MemoryStore {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const sessions = new Map<string, SessionRecord>();
  const executions = new Map<string, ExecutionRecord & { pid: number | null; idem: string }>();
  const previews = new Map<string, PreviewRecord>();
  const receipts = new Map<string, ReceiptRecord>();
  const events: { session: string; event: string; actor: string | null }[] = [];
  const members = new Map<string, Map<string, Role>>();
  const files = new Map<string, { path: string; sha256: string; content: string; encoding?: "base64" }[]>();
  const projectOrgs = new Map<string, string>();
  const rateHits = new Map<string, number>();
  const idem = new Map<string, string>();

  const roleOf = (org: string, user: string) => members.get(org)?.get(user) ?? null;
  const contributor = (org: string, user: string) => ["owner", "admin", "member"].includes(roleOf(org, user) ?? "");
  const operator = (s: SessionRecord, user: string) => contributor(s.orgId, user) && (s.createdBy === user || ["owner", "admin"].includes(roleOf(s.orgId, user) ?? ""));
  /** Row Level Security stand-in: the current viewer sees only their workspaces. */
  const visible = (org: string) => {
    const v = viewer();
    return v === null || roleOf(org, v) !== null;
  };
  const iso = () => now().toISOString();

  const store: MemoryStore = {
    sessions,
    executions,
    previews,
    receipts,
    events,
    members,
    files,
    projectOrgs,
    rateHits,
    rateLimitOverride: null,

    async getSession(sid) {
      const s = sessions.get(sid);
      return s && visible(s.orgId) ? { ...s } : null;
    },
    async getSessionAsSystem(sid) {
      const s = sessions.get(sid);
      return s ? { ...s } : null;
    },
    async listSessions(orgId, q) {
      let rows = [...sessions.values()].filter((s) => s.orgId === orgId && visible(orgId));
      if (q.states?.length) rows = rows.filter((s) => q.states!.includes(s.state));
      if (q.search) rows = rows.filter((s) => s.name.toLowerCase().includes(q.search!.toLowerCase()));
      rows.sort((a, b) => (q.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
      return { rows: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: rows.length };
    },
    async listExecutions(sid, limit) {
      return [...executions.values()].filter((e) => e.sessionId === sid).slice(-limit).reverse();
    },
    async recentExecutions(orgId, limit) {
      return [...executions.values()].filter((e) => sessions.get(e.sessionId)?.orgId === orgId).slice(-limit).reverse();
    },
    async getExecution(eid) {
      const e = executions.get(eid);
      if (!e) return null;
      const s = sessions.get(e.sessionId);
      return s && visible(s.orgId) ? { ...e } : null;
    },
    async listEvents() {
      return [];
    },
    async listPreviews(sid) {
      return [...previews.values()].filter((p) => p.sessionId === sid);
    },
    async getPreview(pid) {
      return previews.get(pid) ?? null;
    },
    async listReceipts(filter) {
      return [...receipts.values()].filter((r) => (!filter.sessionId || r.sessionId === filter.sessionId) && (!filter.taskId || r.taskId === filter.taskId));
    },
    async usageSince(orgId, since) {
      const rows = [...sessions.values()].filter((s) => s.orgId === orgId && Date.parse(s.createdAt) >= since.getTime());
      const ms = [...executions.values()].filter((e) => rows.some((s) => s.id === e.sessionId)).reduce((n, e) => n + (e.durationMs ?? 0), 0);
      return { sessions: rows, activeExecutionMs: ms };
    },
    async projectSnapshot(_org, projectId, maxFiles, maxBytes) {
      const list = files.get(projectId) ?? [];
      if (list.length > maxFiles || list.reduce((n, f) => n + f.content.length, 0) > maxBytes) return "too_large";
      return list;
    },

    async createSession(i) {
      if (!contributor(i.orgId, i.actor)) return no("FORBIDDEN");
      const key = `${i.orgId}:${i.actor}:${i.idempotencyKey}`;
      const existing = idem.get(key);
      if (existing) return ok({ sessionId: existing, created: false });
      const active = [...sessions.values()].filter((s) => s.orgId === i.orgId && !TERMINAL_SESSION_STATES.has(s.state)).length;
      if (active >= i.maxConcurrent) return no("SANDBOX_CONCURRENCY_LIMIT");
      const used = [...sessions.values()].filter((s) => s.orgId === i.orgId).reduce((n, s) => n + runningSeconds(s, now()), 0);
      if (used >= i.minutesAllowance * 60) return no("SANDBOX_MINUTES_EXHAUSTED");
      const sid = id();
      sessions.set(sid, {
        id: sid,
        orgId: i.orgId,
        projectId: i.projectId,
        taskId: i.taskId,
        createdBy: i.actor,
        name: i.name,
        template: i.template,
        size: i.size,
        image: i.image,
        network: i.network,
        requestedVcpu: i.vcpu,
        requestedMemoryMiB: i.memoryMiB,
        vcpu: null,
        memoryMiB: null,
        provider: i.provider,
        providerSandboxId: null,
        isolation: i.isolation,
        state: "requested",
        version: 0,
        ttlSeconds: i.ttlSeconds,
        idleSeconds: i.idleSeconds,
        expiresAt: new Date(now().getTime() + i.ttlSeconds * 1000).toISOString(),
        lastActivityAt: iso(),
        billedSeconds: 0,
        runningSince: null,
        endReason: null,
        failureCategory: null,
        failureMessage: null,
        cleanupStatus: "not_needed",
        cleanupAttempts: 0,
        metrics: null,
        snapshotSha256: null,
        snapshotFiles: null,
        createdAt: iso(),
        updatedAt: iso(),
        endedAt: null,
      });
      idem.set(key, sid);
      events.push({ session: sid, event: "session.requested", actor: i.actor });
      return ok({ sessionId: sid, created: true });
    },

    async transition(sid, actor, version, event: SessionEvent, patch) {
      const s = sessions.get(sid);
      if (!s) return no("NOT_FOUND");
      if (actor !== null && !operator(s, actor)) return no("FORBIDDEN");
      if (s.version !== version) return no("VERSION_CONFLICT");
      const to = nextSessionState(s.state, event);
      if (!to) return no("INVALID_TRANSITION");
      const closed = runningSeconds(s, now());
      if (event === "provisioned") {
        if (!patch.provider_sandbox_id) return no("INVALID_PATCH");
        Object.assign(s, {
          providerSandboxId: patch.provider_sandbox_id,
          vcpu: patch.vcpu ?? null,
          memoryMiB: patch.memory_mib ?? null,
          snapshotSha256: patch.snapshot_sha256 ?? null,
          snapshotFiles: patch.snapshot_files ?? null,
          runningSince: iso(),
          lastActivityAt: iso(),
        });
      } else if (event === "pause") Object.assign(s, { billedSeconds: closed, runningSince: null });
      else if (event === "resume") Object.assign(s, { runningSince: iso(), lastActivityAt: iso() });
      else if (event === "stop" || event === "expire") {
        Object.assign(s, {
          billedSeconds: closed,
          runningSince: null,
          endReason: event === "stop" ? "user" : (patch.end_reason ?? "ttl"),
          cleanupStatus: s.providerSandboxId ? "pending" : "not_needed",
        });
      } else if (event === "finish_termination" || event === "finish_expiry") {
        Object.assign(s, { cleanupStatus: s.cleanupStatus === "not_needed" ? "not_needed" : "done", endedAt: iso() });
      } else if (event === "fail") {
        const provider = s.providerSandboxId ?? (patch.provider_sandbox_id as string | null) ?? null;
        Object.assign(s, {
          billedSeconds: closed,
          runningSince: null,
          endReason: "failed",
          endedAt: iso(),
          failureCategory: patch.failure_category ?? "provider_unavailable",
          failureMessage: patch.failure_message ?? "",
          providerSandboxId: provider,
          cleanupStatus: provider === null ? "not_needed" : patch.cleaned_up === true ? "done" : "pending",
        });
      }
      s.state = to;
      s.version += 1;
      s.updatedAt = iso();
      events.push({ session: sid, event: `session.${event}`, actor });
      return ok(s.version);
    },

    async recordCleanup(sid, success) {
      const s = sessions.get(sid);
      if (!s) return no("NOT_FOUND");
      if (s.cleanupStatus !== "pending" && s.cleanupStatus !== "failed") return ok(null);
      s.cleanupStatus = success ? "done" : "failed";
      s.cleanupAttempts += 1;
      events.push({ session: sid, event: success ? "cleanup.done" : "cleanup.failed", actor: null });
      return ok(null);
    },
    async recordMetrics(sid, sample) {
      const s = sessions.get(sid);
      if (s && s.state === "ready") s.metrics = sample;
      return ok(null);
    },

    async startExecution(i) {
      const s = sessions.get(i.sessionId);
      if (!s) return no("NOT_FOUND");
      if (!operator(s, i.actor)) return no("FORBIDDEN");
      const prior = [...executions.values()].find((e) => e.sessionId === i.sessionId && e.idem === i.idempotencyKey);
      if (prior) return ok({ executionId: prior.id, created: false });
      if (s.state !== "ready") return no("SESSION_NOT_RUNNING");
      if ([...executions.values()].some((e) => e.sessionId === i.sessionId && e.state === "running")) return no("SESSION_BUSY");
      const eid = id();
      executions.set(eid, {
        id: eid,
        sessionId: i.sessionId,
        actorId: i.actor,
        kind: i.kind,
        label: i.label,
        command: i.command,
        state: "running",
        exitCode: null,
        timeoutSeconds: i.timeoutSeconds,
        startedAt: iso(),
        deadlineAt: new Date(now().getTime() + (i.timeoutSeconds + 30) * 1000).toISOString(),
        endedAt: null,
        durationMs: null,
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        stdoutSha256: null,
        stderrSha256: null,
        failureCategory: null,
        cancelRequestedAt: null,
        pid: null,
        idem: i.idempotencyKey,
      });
      s.lastActivityAt = iso();
      return ok({ executionId: eid, created: true });
    },
    async setExecutionPid(eid, pid) {
      const e = executions.get(eid);
      if (e && e.state === "running") e.pid = pid;
      return ok(null);
    },
    async finishExecution(i) {
      const e = executions.get(i.executionId);
      if (!e) return no("NOT_FOUND");
      if (e.state !== "running") return ok(null);
      if ((i.state === "succeeded" && i.exitCode !== 0) || (i.state === "failed" && (i.exitCode === null || i.exitCode === 0))) return no("INVALID_OUTCOME");
      Object.assign(e, {
        state: i.state,
        exitCode: i.exitCode,
        durationMs: i.durationMs,
        endedAt: iso(),
        stdout: i.stdout,
        stderr: i.stderr,
        stdoutTruncated: i.stdoutTruncated,
        stderrTruncated: i.stderrTruncated,
        stdoutSha256: i.stdoutSha256,
        stderrSha256: i.stderrSha256,
        failureCategory: i.state === "succeeded" ? null : i.failure,
      });
      return ok(null);
    },
    async requestCancel(eid, actor) {
      const e = executions.get(eid);
      if (!e) return no("NOT_FOUND");
      const s = sessions.get(e.sessionId)!;
      if (e.actorId !== actor && !operator(s, actor)) return no("FORBIDDEN");
      if (e.state !== "running") return ok({ pid: e.pid, providerSandboxId: s.providerSandboxId, alreadyFinished: true });
      e.cancelRequestedAt ??= iso();
      return ok({ pid: e.pid, providerSandboxId: s.providerSandboxId, alreadyFinished: false });
    },
    async touchSession(sid, actor) {
      const s = sessions.get(sid);
      if (!s) return no("NOT_FOUND");
      if (!operator(s, actor)) return no("FORBIDDEN");
      if (s.state !== "ready") return no("SESSION_NOT_RUNNING");
      s.lastActivityAt = iso();
      return ok(null);
    },
    async createPreview(i) {
      const s = sessions.get(i.sessionId);
      if (!s) return no("NOT_FOUND");
      if (!operator(s, i.actor)) return no("FORBIDDEN");
      if (s.state !== "ready") return no("SESSION_NOT_RUNNING");
      const expiresAt = new Date(Math.min(now().getTime() + i.ttlSeconds * 1000, Date.parse(s.expiresAt))).toISOString();
      previews.set(i.id, { id: i.id, sessionId: i.sessionId, orgId: s.orgId, port: i.port, projectId: null, createdBy: i.actor, expiresAt, launchedAt: null, revokedAt: null, createdAt: iso() });
      return ok(expiresAt);
    },
    async createProjectPreview(i) {
      const org = projectOrgs.get(i.projectId);
      if (!org) return no("NOT_FOUND");
      if (!roleOf(org, i.actor)) return no("FORBIDDEN");
      const expiresAt = new Date(now().getTime() + i.ttlSeconds * 1000).toISOString();
      previews.set(i.id, { id: i.id, sessionId: null, orgId: org, port: null, projectId: i.projectId, createdBy: i.actor, expiresAt, launchedAt: null, revokedAt: null, createdAt: iso() });
      return ok(expiresAt);
    },
    async projectFileAsSystem(org, projectId, path) {
      if (projectOrgs.get(projectId) !== org) return null;
      return files.get(projectId)?.find((f) => f.path === path)?.content ?? null;
    },
    async launchPreview(pid, user) {
      const p = previews.get(pid);
      const s = p?.sessionId ? sessions.get(p.sessionId) : undefined;
      const targetOpen = p?.projectId ? projectOrgs.has(p.projectId) : s?.state === "ready";
      if (!p || !targetOpen || p.createdBy !== user || p.revokedAt || Date.parse(p.expiresAt) <= now().getTime() || p.launchedAt || !roleOf(p.orgId, user)) {
        return no("PREVIEW_UNAVAILABLE");
      }
      p.launchedAt = iso();
      return ok({ sessionId: p.sessionId, port: p.port, expiresAt: p.expiresAt });
    },
    async revokePreview(pid, actor) {
      const p = previews.get(pid);
      if (!p) return no("NOT_FOUND");
      const manager = ["owner", "admin"].includes(roleOf(p.orgId, actor) ?? "");
      if (p.createdBy !== actor && !(p.sessionId ? operator(sessions.get(p.sessionId)!, actor) : manager)) return no("FORBIDDEN");
      p.revokedAt ??= iso();
      return ok(null);
    },
    async recordReceipt(i) {
      const s = sessions.get(i.sessionId);
      if (!s) return no("NOT_FOUND");
      if (!operator(s, i.actor)) return no("FORBIDDEN");
      const st = i.statement as { predicate?: { status?: string; session?: { id?: string; organizationId?: string } } };
      if (st.predicate?.session?.id !== s.id || st.predicate?.session?.organizationId !== s.orgId || st.predicate?.status !== i.status) return no("INVALID_RECEIPT");
      if (!receipts.has(i.digest)) {
        receipts.set(i.digest, { digest: i.digest, sessionId: s.id, taskId: s.taskId, status: i.status as ReceiptRecord["status"], statement: i.statement, createdBy: i.actor, createdAt: iso() });
      }
      return ok(null);
    },
    async rateLimit(key, _window, limit) {
      const hits = (rateHits.get(key) ?? 0) + 1;
      rateHits.set(key, hits);
      return hits <= (store.rateLimitOverride ?? limit);
    },
    async prune() {
      return ok(0);
    },
    async sessionsToSweep() {
      return [...sessions.values()].filter((s) => !TERMINAL_SESSION_STATES.has(s.state) || s.cleanupStatus === "pending" || s.cleanupStatus === "failed").map((s) => ({ ...s }));
    },
    async memberRoleAsSystem(orgId, userId) {
      return roleOf(orgId, userId);
    },
    async overdueExecutions(at) {
      return [...executions.values()].filter((e) => e.state === "running" && Date.parse(e.deadlineAt) < at.getTime());
    },
  };
  return store;
}
