/**
 * Read models and the store contract for sandboxes. Rows are parsed with Zod
 * at the edge, so the rest of the code works with checked values.
 */
import { z } from "zod";
import { EXECUTION_STATES, SESSION_STATES, type EndReason, type ExecutionState, type SessionEvent, type SessionState } from "@/core/sandbox/lifecycle";
import { NETWORK_PROFILES, type NetworkProfile } from "@/core/sandbox/network";
import type { ResourceSample } from "@/core/sandbox/runtime";
import { SIZE_IDS, TEMPLATE_IDS, type SizeId, type TemplateId } from "@/core/sandbox/templates";
import type { MeteredSession } from "@/core/sandbox/usage";

export interface SessionRecord {
  id: string;
  orgId: string;
  projectId: string | null;
  taskId: string | null;
  createdBy: string;
  name: string;
  template: TemplateId;
  size: SizeId;
  image: string;
  network: NetworkProfile;
  requestedVcpu: number;
  requestedMemoryMiB: number;
  vcpu: number | null;
  memoryMiB: number | null;
  provider: string;
  providerSandboxId: string | null;
  isolation: string;
  state: SessionState;
  version: number;
  ttlSeconds: number;
  idleSeconds: number;
  expiresAt: string;
  lastActivityAt: string;
  billedSeconds: number;
  runningSince: string | null;
  endReason: EndReason | null;
  failureCategory: string | null;
  failureMessage: string | null;
  cleanupStatus: "not_needed" | "pending" | "done" | "failed";
  cleanupAttempts: number;
  metrics: ResourceSample | null;
  snapshotSha256: string | null;
  snapshotFiles: number | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

const nullableInt = z.number().int().nullable();

export const SESSION_SELECT =
  "id, org_id, project_id, task_id, created_by, name, template, size, image, network_profile, requested_vcpu, requested_memory_mib, vcpu, memory_mib, provider, provider_sandbox_id, isolation, state, version, ttl_seconds, idle_seconds, expires_at, last_activity_at, billed_seconds, running_since, end_reason, failure_category, failure_message, cleanup_status, cleanup_attempts, metrics, snapshot_sha256, snapshot_files, created_at, updated_at, ended_at";

const MetricsSchema = z
  .object({
    at: z.string(),
    cpuPct: z.number(),
    cpuCount: z.number(),
    memUsedBytes: z.number(),
    memTotalBytes: z.number(),
    diskUsedBytes: z.number(),
    diskTotalBytes: z.number(),
  })
  .nullable()
  .catch(null);

export const SessionRowSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string().nullable(),
  task_id: z.string().nullable(),
  created_by: z.string(),
  name: z.string(),
  template: z.enum(TEMPLATE_IDS),
  size: z.enum(SIZE_IDS),
  image: z.string(),
  network_profile: z.enum(NETWORK_PROFILES),
  requested_vcpu: z.number().int(),
  requested_memory_mib: z.number().int(),
  vcpu: nullableInt,
  memory_mib: nullableInt,
  provider: z.string(),
  provider_sandbox_id: z.string().nullable(),
  isolation: z.string(),
  state: z.enum(SESSION_STATES),
  version: z.number().int(),
  ttl_seconds: z.number().int(),
  idle_seconds: z.number().int(),
  expires_at: z.string(),
  last_activity_at: z.string(),
  billed_seconds: z.number().int(),
  running_since: z.string().nullable(),
  end_reason: z.enum(["user", "ttl", "idle", "provider_gone", "failed"]).nullable(),
  failure_category: z.string().nullable(),
  failure_message: z.string().nullable(),
  cleanup_status: z.enum(["not_needed", "pending", "done", "failed"]),
  cleanup_attempts: z.number().int(),
  metrics: MetricsSchema,
  snapshot_sha256: z.string().nullable(),
  snapshot_files: nullableInt,
  created_at: z.string(),
  updated_at: z.string(),
  ended_at: z.string().nullable(),
});

export function sessionFromRow(r: z.infer<typeof SessionRowSchema>): SessionRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    taskId: r.task_id,
    createdBy: r.created_by,
    name: r.name,
    template: r.template,
    size: r.size,
    image: r.image,
    network: r.network_profile,
    requestedVcpu: r.requested_vcpu,
    requestedMemoryMiB: r.requested_memory_mib,
    vcpu: r.vcpu,
    memoryMiB: r.memory_mib,
    provider: r.provider,
    providerSandboxId: r.provider_sandbox_id,
    isolation: r.isolation,
    state: r.state,
    version: r.version,
    ttlSeconds: r.ttl_seconds,
    idleSeconds: r.idle_seconds,
    expiresAt: r.expires_at,
    lastActivityAt: r.last_activity_at,
    billedSeconds: r.billed_seconds,
    runningSince: r.running_since,
    endReason: r.end_reason,
    failureCategory: r.failure_category,
    failureMessage: r.failure_message,
    cleanupStatus: r.cleanup_status,
    cleanupAttempts: r.cleanup_attempts,
    metrics: r.metrics,
    snapshotSha256: r.snapshot_sha256,
    snapshotFiles: r.snapshot_files,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    endedAt: r.ended_at,
  };
}

export function meteredFrom(s: SessionRecord): MeteredSession {
  return { billedSeconds: s.billedSeconds, runningSince: s.runningSince, expiresAt: s.expiresAt, vcpu: s.vcpu ?? s.requestedVcpu, memoryMiB: s.memoryMiB ?? s.requestedMemoryMiB };
}

export interface ExecutionRecord {
  id: string;
  sessionId: string;
  actorId: string;
  kind: "command" | "check" | "setup";
  label: string | null;
  command: string;
  state: ExecutionState;
  exitCode: number | null;
  timeoutSeconds: number;
  startedAt: string;
  deadlineAt: string;
  endedAt: string | null;
  durationMs: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdoutSha256: string | null;
  stderrSha256: string | null;
  failureCategory: string | null;
  cancelRequestedAt: string | null;
}

export const EXECUTION_SELECT =
  "id, session_id, actor_id, kind, label, command, state, exit_code, timeout_seconds, started_at, deadline_at, ended_at, duration_ms, stdout, stderr, stdout_truncated, stderr_truncated, stdout_sha256, stderr_sha256, failure_category, cancel_requested_at";

export const ExecutionRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  actor_id: z.string(),
  kind: z.enum(["command", "check", "setup"]),
  label: z.string().nullable(),
  command: z.string(),
  state: z.enum(EXECUTION_STATES),
  exit_code: nullableInt,
  timeout_seconds: z.number().int(),
  started_at: z.string(),
  deadline_at: z.string(),
  ended_at: z.string().nullable(),
  duration_ms: nullableInt,
  stdout: z.string(),
  stderr: z.string(),
  stdout_truncated: z.boolean(),
  stderr_truncated: z.boolean(),
  stdout_sha256: z.string().nullable(),
  stderr_sha256: z.string().nullable(),
  failure_category: z.string().nullable(),
  cancel_requested_at: z.string().nullable(),
});

export function executionFromRow(r: z.infer<typeof ExecutionRowSchema>): ExecutionRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    actorId: r.actor_id,
    kind: r.kind,
    label: r.label,
    command: r.command,
    state: r.state,
    exitCode: r.exit_code,
    timeoutSeconds: r.timeout_seconds,
    startedAt: r.started_at,
    deadlineAt: r.deadline_at,
    endedAt: r.ended_at,
    durationMs: r.duration_ms,
    stdout: r.stdout,
    stderr: r.stderr,
    stdoutTruncated: r.stdout_truncated,
    stderrTruncated: r.stderr_truncated,
    stdoutSha256: r.stdout_sha256,
    stderrSha256: r.stderr_sha256,
    failureCategory: r.failure_category,
    cancelRequestedAt: r.cancel_requested_at,
  };
}

export interface SessionEventRecord {
  id: number;
  actorId: string | null;
  event: string;
  fromState: string | null;
  toState: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface PreviewRecord {
  id: string;
  /** An app running in a sandbox: its session and port. Null for a project preview. */
  sessionId: string | null;
  orgId: string;
  port: number | null;
  /** A project preview (migration 17): the project whose current files are served. */
  projectId: string | null;
  createdBy: string;
  expiresAt: string;
  launchedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ReceiptRecord {
  digest: string;
  sessionId: string;
  taskId: string | null;
  status: "verified" | "partially_verified" | "failed" | "unverified";
  statement: unknown;
  createdBy: string;
  createdAt: string;
}

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SessionListQuery {
  states?: readonly SessionState[];
  search?: string;
  sort: "newest" | "oldest" | "name" | "expiring";
  page: number;
  pageSize: number;
}

export interface ProjectSnapshotFile {
  path: string;
  sha256: string;
  content: string;
  /** "base64" for an image (ADR 0108): written into the sandbox as its bytes. */
  encoding?: "base64";
}

/** Everything sandbox code needs from the database. Reads respect Row Level Security; writes call app_* functions. */
export interface SandboxStore {
  getSession(id: string): Promise<SessionRecord | null>;
  listSessions(orgId: string, query: SessionListQuery): Promise<{ rows: SessionRecord[]; total: number }>;
  listExecutions(sessionId: string, limit: number): Promise<ExecutionRecord[]>;
  /** Latest commands across the workspace, for the dashboard. */
  recentExecutions(orgId: string, limit: number): Promise<ExecutionRecord[]>;
  getExecution(id: string): Promise<ExecutionRecord | null>;
  listEvents(sessionId: string, limit: number): Promise<SessionEventRecord[]>;
  listPreviews(sessionId: string): Promise<PreviewRecord[]>;
  listReceipts(filter: { sessionId?: string; taskId?: string }, limit: number): Promise<ReceiptRecord[]>;
  /** Sessions created since `since`, for usage totals, with their summed execution time. */
  usageSince(orgId: string, since: Date): Promise<{ sessions: SessionRecord[]; activeExecutionMs: number }>;
  projectSnapshot(orgId: string, projectId: string, maxFiles: number, maxBytes: number): Promise<ProjectSnapshotFile[] | "too_large">;

  createSession(input: {
    orgId: string;
    actor: string;
    projectId: string | null;
    taskId: string | null;
    name: string;
    template: TemplateId;
    size: SizeId;
    image: string;
    network: NetworkProfile;
    vcpu: number;
    memoryMiB: number;
    provider: string;
    isolation: string;
    ttlSeconds: number;
    idleSeconds: number;
    maxConcurrent: number;
    minutesAllowance: number;
    periodStart: Date;
    idempotencyKey: string;
  }): Promise<RpcResult<{ sessionId: string; created: boolean }>>;
  transition(sessionId: string, actor: string | null, expectedVersion: number, event: SessionEvent, patch: Record<string, unknown>): Promise<RpcResult<number>>;
  recordCleanup(sessionId: string, ok: boolean, message: string | null): Promise<RpcResult<null>>;
  recordMetrics(sessionId: string, sample: ResourceSample): Promise<RpcResult<null>>;
  startExecution(input: {
    sessionId: string;
    actor: string;
    kind: "command" | "check" | "setup";
    label: string | null;
    command: string;
    timeoutSeconds: number;
    policy: unknown;
    idempotencyKey: string;
  }): Promise<RpcResult<{ executionId: string; created: boolean }>>;
  setExecutionPid(executionId: string, pid: number): Promise<RpcResult<null>>;
  finishExecution(input: {
    executionId: string;
    state: Exclude<ExecutionState, "running">;
    exitCode: number | null;
    durationMs: number;
    stdout: string;
    stderr: string;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
    stdoutSha256: string | null;
    stderrSha256: string | null;
    failure: string | null;
  }): Promise<RpcResult<null>>;
  requestCancel(executionId: string, actor: string): Promise<RpcResult<{ pid: number | null; providerSandboxId: string | null; alreadyFinished: boolean }>>;
  touchSession(sessionId: string, actor: string): Promise<RpcResult<null>>;
  createPreview(input: { sessionId: string; actor: string; id: string; port: number; ttlSeconds: number }): Promise<RpcResult<string>>;
  launchPreview(id: string, user: string): Promise<RpcResult<{ sessionId: string | null; port: number | null; expiresAt: string }>>;
  createProjectPreview(input: { projectId: string; actor: string; id: string; ttlSeconds: number }): Promise<RpcResult<string>>;
  /** One current file of a project, for previews. Read with the server key; the caller has checked the preview. */
  projectFileAsSystem(orgId: string, projectId: string, path: string): Promise<string | null>;
  revokePreview(id: string, actor: string): Promise<RpcResult<null>>;
  recordReceipt(input: { sessionId: string; actor: string; digest: string; status: string; statement: unknown }): Promise<RpcResult<null>>;
  rateLimit(key: string, windowSeconds: number, limit: number): Promise<boolean>;
  prune(before: Date): Promise<RpcResult<number>>;

  /** System reads for the sweeper and gateway (service role). */
  sessionsToSweep(now: Date, limit: number): Promise<SessionRecord[]>;
  overdueExecutions(now: Date, limit: number): Promise<ExecutionRecord[]>;
  getPreview(id: string): Promise<PreviewRecord | null>;
  getSessionAsSystem(id: string): Promise<SessionRecord | null>;
  /** A person's current role in a workspace, read with the service role (for the preview gateway). */
  memberRoleAsSystem(orgId: string, userId: string): Promise<string | null>;
}
