/**
 * Sandbox use cases (ADR 0013). Each operation follows the same order:
 *   1. who is asking (role in the workspace) and the per-user rate limit;
 *   2. Guard decides whether this boundary may be crossed;
 *   3. plan limits shape the request (only catalog values, never client ones);
 *   4. the database applies the change atomically and re-checks 1 and 3;
 *   5. the runtime does the work; failures are categorized and compensated
 *      (a sandbox started for a session that can't be recorded is destroyed);
 *   6. the real outcome is recorded.
 *
 * Retried requests carry the same idempotency key and get the first result
 * back instead of a second sandbox or a second run of the command.
 */
import { resolveEffectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import { usagePeriod } from "@/core/billing/usage";
import { BoundedOutput, checkCommand, stripAnsi } from "@/core/sandbox/commands";
import { classifyExit, FAILURE_LABELS, type FailureCategory } from "@/core/sandbox/failures";
import { blockReason, evaluateSandboxAction, type SandboxAction } from "@/core/sandbox/guard";
import { TERMINAL_SESSION_STATES, type SessionState } from "@/core/sandbox/lifecycle";
import { egressRules, validPreviewPort } from "@/core/sandbox/network";
import { MAX_SANDBOX_FILE_BYTES, resolveSandboxPath } from "@/core/sandbox/paths";
import { newPreviewId, previewOrigin, PREVIEW_LAUNCH_PATH, PREVIEW_LAUNCH_SECONDS, signPreviewToken } from "@/core/sandbox/preview";
import { buildSandboxReceipt, sandboxReceiptDigest, snapshotDigest, type ReceiptCheck } from "@/core/sandbox/receipts";
import { commandTimeoutSeconds, sessionSpec } from "@/core/sandbox/request";
import { RuntimeError, type ResourceSample, type RuntimeFileEntry, type RuntimeHealth } from "@/core/sandbox/runtime";
import { addUsage, sessionUsage, wholeMinutes, ZERO_USAGE, type UsageTotals } from "@/core/sandbox/usage";
import { transition as taskTransition, type TaskEventType, type TaskSnapshot, type TaskState } from "@/core/realityloop/task-machine";
import { sha256Hex } from "@/core/trust/canonical-json";
import type { PolicyDecision } from "@/core/trust/policy";
import { SANDBOX_HARD_LIMITS, sandboxLimitsFor, type SandboxPlanLimits } from "@/config/sandbox";
import { log } from "@/server/observability/log";
import { previewUnavailableReason } from "./config";
import { sandboxExecutionMode, type RuntimeResolution } from "./registry";
import { meteredFrom, type ExecutionRecord, type RpcResult, type SandboxStore, type SessionRecord } from "./types";

type OrgRole = "owner" | "admin" | "member" | "viewer";

export type SandboxErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "BLOCKED"
  | "NOT_CONNECTED"
  | "SESSION_NOT_RUNNING"
  | "SESSION_BUSY"
  | "VERSION_CONFLICT"
  | "RUNTIME_FAILED"
  | "PREVIEW_UNAVAILABLE"
  | "PROJECT_ARCHIVED"
  | "PROJECT_TOO_LARGE"
  | "UNKNOWN";

export type SandboxResult<T> = { ok: true; value: T } | { ok: false; code: SandboxErrorCode; message: string; category: FailureCategory };

const HTTP_STATUS: Record<SandboxErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  QUOTA_EXCEEDED: 409,
  RATE_LIMITED: 429,
  BLOCKED: 403,
  NOT_CONNECTED: 503,
  SESSION_NOT_RUNNING: 409,
  SESSION_BUSY: 409,
  VERSION_CONFLICT: 409,
  RUNTIME_FAILED: 502,
  PREVIEW_UNAVAILABLE: 409,
  PROJECT_ARCHIVED: 409,
  PROJECT_TOO_LARGE: 413,
  UNKNOWN: 500,
};
export const httpStatusFor = (code: SandboxErrorCode) => HTTP_STATUS[code];

function err<T>(code: SandboxErrorCode, message: string, category: FailureCategory): SandboxResult<T> {
  return { ok: false, code, message, category };
}

/** Database errors to codes. The database's own message is never shown; it may name internals. */
function fromDb<T>(error: string): SandboxResult<T> {
  if (/FORBIDDEN/.test(error)) return err("FORBIDDEN", "Only the person who started this session, or an owner or admin, can do that.", "not_authorized");
  if (/NOT_FOUND/.test(error)) return err("NOT_FOUND", "That session, project or task doesn't exist in this workspace.", "invalid_request");
  if (/PROJECT_ARCHIVED/.test(error)) return err("PROJECT_ARCHIVED", "That project is archived, so it can't be copied into a new session.", "invalid_request");
  if (/SANDBOX_CONCURRENCY_LIMIT/.test(error)) return err("QUOTA_EXCEEDED", "Your workspace already has as many sessions as your plan allows. Stop one first.", "quota_exceeded");
  if (/SANDBOX_MINUTES_EXHAUSTED/.test(error)) return err("QUOTA_EXCEEDED", "Your workspace has used its sandbox minutes for this period.", "quota_exceeded");
  if (/SESSION_NOT_RUNNING/.test(error)) return err("SESSION_NOT_RUNNING", "The session isn't running.", "invalid_request");
  if (/SESSION_BUSY/.test(error)) return err("SESSION_BUSY", "A command is already running in this session. Wait for it or cancel it.", "invalid_request");
  if (/VERSION_CONFLICT|INVALID_TRANSITION/.test(error)) return err("VERSION_CONFLICT", "The session changed while you were working. Reload and try again.", "invalid_request");
  if (/PREVIEW_UNAVAILABLE/.test(error)) return err("PREVIEW_UNAVAILABLE", "This preview link has been used, expired or closed. Open the preview again.", "not_authorized");
  if (/PREVIEW_LIMIT/.test(error)) return err("QUOTA_EXCEEDED", "This session already has 10 open previews. Close one first.", "quota_exceeded");
  if (/WRITES_UNAVAILABLE/.test(error)) return err("NOT_CONNECTED", "The server key for writes isn't set in this environment.", "provider_rejected");
  return err("UNKNOWN", "Something went wrong saving that. Nothing was run twice; try again.", "control_plane_interrupted");
}

function fromRuntime<T>(e: unknown): SandboxResult<T> {
  if (e instanceof RuntimeError) return err(e.category === "invalid_request" ? "INVALID_REQUEST" : "RUNTIME_FAILED", e.message, e.category);
  return err("RUNTIME_FAILED", "The sandbox runtime failed unexpectedly.", "provider_unavailable");
}

export interface SandboxActor {
  userId: string;
  orgId: string;
}

export interface TaskBridge {
  loadTask(orgId: string, taskId: string): Promise<{ id: string; projectId: string; state: TaskState; version: number; eventIds: string[] } | null>;
  requiredChecks(orgId: string, taskId: string): Promise<string[] | null>;
  latestProofPackDigest(orgId: string, taskId: string): Promise<string | null>;
  applyTransition(input: { taskId: string; actor: string; eventId: string; eventType: TaskEventType; from: TaskState; to: TaskState; expectedVersion: number }): Promise<RpcResult<number>>;
  newEventId(): string;
}

export interface SandboxServiceDeps {
  store: SandboxStore;
  resolution: RuntimeResolution;
  role(orgId: string): Promise<OrgRole | null>;
  billing(orgId: string): Promise<BillingSnapshot | null>;
  tasks?: TaskBridge;
  now(): Date;
  randomKey(): string;
}

export interface OutputSink {
  onStart?(executionId: string): void;
  onStdout?(chunk: string): void;
  onStderr?(chunk: string): void;
}

export interface LimitsView {
  limits: SandboxPlanLimits;
  periodStart: Date;
  periodEnd: Date;
  periodKind: "trial" | "month";
}

export interface SandboxOverview {
  execution: ReturnType<typeof sandboxExecutionMode>;
  provider: string | null;
  connectedReason: string | null;
  capabilities: SandboxServiceCapabilities;
  previewReason: string | null;
  limits: LimitsView;
  usage: UsageTotals;
  minutesUsed: number;
  activeSessions: number;
}

export interface SandboxServiceCapabilities {
  pauseResume: boolean;
  metrics: boolean;
  previews: boolean;
  cancel: boolean;
  filesystem: boolean;
}

export function createSandboxService(deps: SandboxServiceDeps) {
  const { store, resolution } = deps;
  const runtime = resolution.runtime;
  const config = resolution.config;

  async function limitsFor(orgId: string): Promise<LimitsView> {
    const snapshot = await deps.billing(orgId);
    const now = deps.now();
    const plan = snapshot ? resolveEffectivePlan(snapshot, now) : null;
    const base = sandboxLimitsFor(plan ? { planId: plan.planId, source: plan.source } : null);
    const limits = { ...base, maxSessionMinutes: Math.min(base.maxSessionMinutes, config.runtimeMaxSessionMinutes, SANDBOX_HARD_LIMITS.maxSessionMinutes) };
    const period = usagePeriod(plan?.source === "trial" ? snapshot?.trial : undefined, null, now);
    return { limits, periodStart: period.start, periodEnd: period.end, periodKind: period.kind };
  }

  async function guard(action: SandboxAction, actor: SandboxActor, role: OrgRole | null, session: SessionRecord | null, extra: { network?: SessionRecord["network"]; command?: string } = {}) {
    return evaluateSandboxAction({
      action,
      execution: sandboxExecutionMode(resolution),
      role,
      isSessionOwner: session ? session.createdBy === actor.userId : true,
      sessionState: session?.state ?? null,
      network: extra.network ?? session?.network ?? "none",
      command: extra.command,
    });
  }

  function blocked<T>(decision: PolicyDecision): SandboxResult<T> | null {
    const reason = blockReason(decision);
    if (!reason) return null;
    const rule = decision.findings.find((f) => f.outcome === "BLOCK")?.rule;
    if (rule === "isolation") return err("NOT_CONNECTED", reason, "provider_rejected");
    if (rule === "session_state") return err("SESSION_NOT_RUNNING", reason, "invalid_request");
    return err("BLOCKED", reason, "not_authorized");
  }

  async function rateLimited(actor: SandboxActor, kind: keyof typeof SANDBOX_HARD_LIMITS.rateLimits): Promise<boolean> {
    return !(await store.rateLimit(`sandbox:${kind}:${actor.userId}`, 60, SANDBOX_HARD_LIMITS.rateLimits[kind]));
  }

  /** Loads a session the actor can see. RLS decides visibility; another workspace's session is "not found". */
  async function visibleSession(actor: SandboxActor, sessionId: string): Promise<SessionRecord | null> {
    const s = await store.getSession(sessionId);
    return s && s.orgId === actor.orgId ? s : null;
  }

  async function overview(actor: SandboxActor): Promise<SandboxOverview> {
    const lv = await limitsFor(actor.orgId);
    const { sessions, activeExecutionMs } = await store.usageSince(actor.orgId, lv.periodStart);
    const now = deps.now();
    let usage = ZERO_USAGE;
    for (const s of sessions) usage = addUsage(usage, sessionUsage(meteredFrom(s), 0, now));
    usage = { ...usage, activeExecutionSeconds: Math.round(activeExecutionMs / 100) / 10 };
    const active = (await store.listSessions(actor.orgId, { states: ["requested", "provisioning", "ready", "paused", "stopping"], sort: "newest", page: 1, pageSize: 1 })).total;
    const caps = runtime?.capabilities;
    return {
      execution: sandboxExecutionMode(resolution),
      provider: caps?.provider ?? null,
      connectedReason: resolution.reason,
      capabilities: {
        pauseResume: Boolean(caps?.pauseResume),
        metrics: Boolean(caps?.metrics),
        previews: Boolean(caps?.previews) && previewUnavailableReason(config) === null,
        cancel: Boolean(caps?.cancel),
        filesystem: Boolean(caps?.filesystem),
      },
      previewReason: !caps?.previews ? "This runtime doesn't support previews." : previewUnavailableReason(config),
      limits: lv,
      usage,
      minutesUsed: wholeMinutes(usage.runningSeconds),
      activeSessions: active,
    };
  }

  let healthCache: { at: number; value: RuntimeHealth } | null = null;
  async function health(): Promise<RuntimeHealth | null> {
    if (!runtime) return null;
    if (healthCache && Date.now() - healthCache.at < 30_000) return healthCache.value;
    const value = await runtime.health();
    healthCache = { at: Date.now(), value };
    if (!value.ok) log("warn", "sandbox.runtime_unhealthy", { category: value.category, reason: value.reason });
    return value;
  }

  async function createSession(actor: SandboxActor, input: unknown, idempotencyKey: string): Promise<SandboxResult<{ sessionId: string; created: boolean }>> {
    const role = await deps.role(actor.orgId);
    const lv = await limitsFor(actor.orgId);
    const spec = sessionSpec(input, lv.limits);
    if (!spec.ok) return err("INVALID_REQUEST", spec.reason, "invalid_request");
    const decision = await guard("session.create", actor, role, null, { network: spec.spec.network });
    const refused = blocked<{ sessionId: string; created: boolean }>(decision);
    if (refused) return refused;
    if (!runtime) return err("NOT_CONNECTED", resolution.reason ?? "No runtime is connected.", "provider_rejected");
    if (await rateLimited(actor, "create")) return err("RATE_LIMITED", "Too many sessions started in the last minute. Try again shortly.", "quota_exceeded");

    let snapshot: { path: string; sha256: string; content: string }[] = [];
    if (spec.spec.projectId) {
      const files = await store.projectSnapshot(actor.orgId, spec.spec.projectId, SANDBOX_HARD_LIMITS.maxUploadFiles, SANDBOX_HARD_LIMITS.maxUploadBytes);
      if (files === "too_large") return err("PROJECT_TOO_LARGE", "The project is larger than a session can copy in (3,000 files or 25 MB). Choose folders to include.", "invalid_request");
      snapshot = spec.spec.include.length ? files.filter((f) => spec.spec.include.some((p) => f.path === p || f.path.startsWith(`${p}/`))) : files;
    }

    const image = config.images[spec.spec.template][spec.spec.size];
    const created = await store.createSession({
      orgId: actor.orgId,
      actor: actor.userId,
      projectId: spec.spec.projectId,
      taskId: spec.spec.taskId,
      name: spec.spec.name,
      template: spec.spec.template,
      size: spec.spec.size,
      image,
      network: spec.spec.network,
      vcpu: spec.spec.vcpu,
      memoryMiB: spec.spec.memoryMiB,
      provider: runtime.id,
      isolation: runtime.capabilities.isolation,
      ttlSeconds: spec.spec.ttlSeconds,
      idleSeconds: spec.spec.idleSeconds,
      maxConcurrent: lv.limits.maxConcurrentSessions,
      minutesAllowance: lv.limits.minutesPerPeriod,
      periodStart: lv.periodStart,
      idempotencyKey,
    });
    if (!created.ok) return fromDb(created.error);
    const sessionId = created.value.sessionId;
    if (!created.value.created) return { ok: true, value: created.value };

    const provision = await store.transition(sessionId, actor.userId, 0, "provision", {});
    if (!provision.ok) return fromDb(provision.error);

    let sandboxId: string | null = null;
    try {
      const sandbox = await runtime.create({
        image,
        ttlSeconds: spec.spec.ttlSeconds,
        egress: egressRules(spec.spec.network),
        metadata: { farbaek: config.deploymentId, session: sessionId, org: actor.orgId },
      });
      sandboxId = sandbox.sandboxId;
      if (snapshot.length) await runtime.writeFiles(sandbox.sandboxId, snapshot.map((f) => ({ path: f.path, content: f.content })));
      const digest = snapshot.length ? await snapshotDigest(snapshot) : null;
      const ready = await store.transition(sessionId, actor.userId, 1, "provisioned", {
        provider_sandbox_id: sandbox.sandboxId,
        vcpu: sandbox.vcpu,
        memory_mib: sandbox.memoryMiB,
        snapshot_sha256: digest,
        snapshot_files: snapshot.length || null,
      });
      if (!ready.ok) {
        // The session was stopped or changed while starting: don't leave the sandbox running.
        const destroyed = await runtime.destroy(sandbox.sandboxId).then(() => true, () => false);
        log("warn", "sandbox.provision_superseded", { session: sessionId, destroyed });
        return fromDb(ready.error);
      }
      log("info", "sandbox.session_ready", { session: sessionId, org: actor.orgId, image, files: snapshot.length });
      return { ok: true, value: { sessionId, created: true } };
    } catch (e) {
      const failure = e instanceof RuntimeError ? e : new RuntimeError("provider_unavailable", "Starting the sandbox failed.");
      let cleanedUp = sandboxId === null;
      if (sandboxId) cleanedUp = await runtime.destroy(sandboxId).then(() => true, () => false);
      await store.transition(sessionId, actor.userId, 1, "fail", {
        failure_category: failure.category,
        failure_message: failure.message,
        provider_sandbox_id: sandboxId,
        cleaned_up: cleanedUp,
      });
      log("error", "sandbox.provision_failed", { session: sessionId, category: failure.category, message: failure.message, cleanedUp });
      return fromRuntime(failure);
    }
  }

  async function runCommand(
    actor: SandboxActor,
    sessionId: string,
    input: { command: unknown; timeoutSeconds?: unknown; kind?: "command" | "check" | "setup"; label?: string | null },
    idempotencyKey: string,
    sink: OutputSink = {},
  ): Promise<SandboxResult<ExecutionRecord>> {
    const session = await visibleSession(actor, sessionId);
    if (!session) return err("NOT_FOUND", "That session doesn't exist in this workspace.", "invalid_request");
    const cmd = checkCommand(input.command);
    if (!cmd.ok) return err("INVALID_REQUEST", cmd.reason, "invalid_request");
    const role = await deps.role(actor.orgId);
    const decision = await guard("command.run", actor, role, session, { command: cmd.command });
    const refused = blocked<ExecutionRecord>(decision);
    if (refused) return refused;
    if (!runtime || !session.providerSandboxId) return err("NOT_CONNECTED", resolution.reason ?? "The session has no sandbox.", "provider_rejected");
    if (await rateLimited(actor, "exec")) return err("RATE_LIMITED", "Too many commands in the last minute. Try again shortly.", "quota_exceeded");

    const lv = await limitsFor(actor.orgId);
    const timeoutSeconds = commandTimeoutSeconds(input.timeoutSeconds, Math.min(lv.limits.maxCommandSeconds, SANDBOX_HARD_LIMITS.maxCommandSeconds));
    const started = await store.startExecution({
      sessionId,
      actor: actor.userId,
      kind: input.kind ?? "command",
      label: input.label ?? null,
      command: cmd.command,
      timeoutSeconds,
      policy: { outcome: decision.outcome, version: decision.policyVersion, findings: decision.findings },
      idempotencyKey,
    });
    if (!started.ok) return fromDb(started.error);
    const executionId = started.value.executionId;
    if (!started.value.created) {
      // A retry of a request that already ran: return what happened, never run it again.
      const existing = await store.getExecution(executionId);
      return existing ? { ok: true, value: existing } : err("NOT_FOUND", "That command record isn't visible.", "invalid_request");
    }
    sink.onStart?.(executionId);

    const stdout = new BoundedOutput();
    const stderr = new BoundedOutput();
    const t0 = Date.now();
    const outcome = await runtime.exec(
      session.providerSandboxId,
      { command: cmd.command, timeoutSeconds },
      {
        onStart: async (pid) => {
          await store.setExecutionPid(executionId, pid);
        },
        onStdout: (chunk) => {
          const clean = stripAnsi(chunk);
          stdout.push(clean);
          sink.onStdout?.(clean);
        },
        onStderr: (chunk) => {
          const clean = stripAnsi(chunk);
          stderr.push(clean);
          sink.onStderr?.(clean);
        },
      },
    );
    const durationMs = Date.now() - t0;
    const latest = await store.getExecution(executionId);
    const cancelled = Boolean(latest?.cancelRequestedAt);
    const category = outcome.runtimeError?.category ?? classifyExit({ exitCode: outcome.exitCode, timedOut: outcome.timedOut, cancelled });
    const state = outcome.runtimeError
      ? "error"
      : cancelled
        ? "cancelled"
        : outcome.timedOut
          ? "timed_out"
          : outcome.exitCode === 0
            ? "succeeded"
            : outcome.exitCode === null
              ? "error"
              : "failed";
    const [outText, errText] = [stdout.text(), stderr.text()];
    const finished = await store.finishExecution({
      executionId,
      state,
      exitCode: state === "succeeded" || state === "failed" ? outcome.exitCode : cancelled || outcome.timedOut ? null : outcome.exitCode,
      durationMs,
      stdout: outText,
      stderr: outcome.runtimeError ? `${errText}${errText ? "\n" : ""}[farbaek: ${outcome.runtimeError.message}]` : errText,
      stdoutTruncated: stdout.truncated,
      stderrTruncated: stderr.truncated,
      stdoutSha256: outText ? await sha256Hex(outText) : null,
      stderrSha256: errText ? await sha256Hex(errText) : null,
      failure: state === "succeeded" ? null : category,
    });
    if (!finished.ok) log("error", "sandbox.execution_record_failed", { execution: executionId, error: finished.error });
    if (outcome.runtimeError?.category === "sandbox_gone") {
      await store.transition(sessionId, null, session.version, "fail", { failure_category: "sandbox_gone", failure_message: FAILURE_LABELS.sandbox_gone.title, cleaned_up: true });
    }
    log(state === "succeeded" ? "info" : "warn", "sandbox.execution_finished", { session: sessionId, execution: executionId, state, exitCode: outcome.exitCode, durationMs, category });
    const record = await store.getExecution(executionId);
    return record ? { ok: true, value: record } : err("UNKNOWN", "The command ran, but its record couldn't be read back.", "control_plane_interrupted");
  }

  async function cancelExecution(actor: SandboxActor, executionId: string): Promise<SandboxResult<{ alreadyFinished: boolean; killed: boolean }>> {
    const execution = await store.getExecution(executionId);
    if (!execution) return err("NOT_FOUND", "That command doesn't exist in this workspace.", "invalid_request");
    const session = await visibleSession(actor, execution.sessionId);
    if (!session) return err("NOT_FOUND", "That command doesn't exist in this workspace.", "invalid_request");
    const requested = await store.requestCancel(executionId, actor.userId);
    if (!requested.ok) return fromDb(requested.error);
    if (requested.value.alreadyFinished) return { ok: true, value: { alreadyFinished: true, killed: false } };
    if (!runtime || !requested.value.pid || !requested.value.providerSandboxId) return { ok: true, value: { alreadyFinished: false, killed: false } };
    try {
      const killed = await runtime.kill(requested.value.providerSandboxId, requested.value.pid);
      log("info", "sandbox.execution_cancelled", { execution: executionId, killed });
      return { ok: true, value: { alreadyFinished: false, killed } };
    } catch (e) {
      return fromRuntime(e);
    }
  }

  /** Stops a session: stopping first, then the runtime destroys the sandbox, then terminated. A failed destroy is retried by the sweeper. */
  async function stopSession(actor: SandboxActor, sessionId: string): Promise<SandboxResult<{ state: SessionState }>> {
    const session = await visibleSession(actor, sessionId);
    if (!session) return err("NOT_FOUND", "That session doesn't exist in this workspace.", "invalid_request");
    if (TERMINAL_SESSION_STATES.has(session.state)) return { ok: true, value: { state: session.state } };
    const role = await deps.role(actor.orgId);
    const refused = blocked<{ state: SessionState }>(await guard("session.stop", actor, role, session));
    if (refused) return refused;
    let version = session.version;
    if (session.state !== "stopping") {
      const stopped = await store.transition(sessionId, actor.userId, version, "stop", {});
      if (!stopped.ok) return fromDb(stopped.error);
      version = stopped.value;
    }
    return finishStop({ ...session, version, state: "stopping", endReason: session.endReason ?? "user" });
  }

  async function finishStop(session: SessionRecord): Promise<SandboxResult<{ state: SessionState }>> {
    if (session.providerSandboxId && runtime) {
      try {
        await runtime.destroy(session.providerSandboxId);
        await store.recordCleanup(session.id, true, null);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Cleanup failed.";
        await store.recordCleanup(session.id, false, message);
        log("error", "sandbox.cleanup_failed", { session: session.id, message });
        return { ok: true, value: { state: "stopping" } };
      }
    } else if (session.providerSandboxId && !runtime) {
      await store.recordCleanup(session.id, false, "No runtime is configured to destroy this sandbox.");
      return { ok: true, value: { state: "stopping" } };
    }
    const event = session.endReason === "user" || session.endReason === null ? "finish_termination" : "finish_expiry";
    const done = await store.transition(session.id, null, session.version, event, {});
    if (!done.ok) return fromDb(done.error);
    log("info", "sandbox.session_ended", { session: session.id, reason: session.endReason ?? "user" });
    return { ok: true, value: { state: event === "finish_termination" ? "terminated" : "expired" } };
  }

  async function pauseOrResume(actor: SandboxActor, sessionId: string, action: "pause" | "resume"): Promise<SandboxResult<{ state: SessionState }>> {
    const session = await visibleSession(actor, sessionId);
    if (!session) return err("NOT_FOUND", "That session doesn't exist in this workspace.", "invalid_request");
    if (!runtime?.capabilities.pauseResume) return err("BLOCKED", "This runtime can't pause sessions.", "provider_rejected");
    const role = await deps.role(actor.orgId);
    const decision = await guard("session.pause", actor, role, session);
    const refused = blocked<{ state: SessionState }>(decision);
    if (refused) return refused;
    if (!session.providerSandboxId) return err("SESSION_NOT_RUNNING", "The session has no sandbox yet.", "invalid_request");
    if (action === "pause" && session.state !== "ready") return err("SESSION_NOT_RUNNING", "Only a running session can be paused.", "invalid_request");
    if (action === "resume" && session.state !== "paused") return err("SESSION_NOT_RUNNING", "Only a paused session can be resumed.", "invalid_request");
    const remaining = Math.floor((Date.parse(session.expiresAt) - deps.now().getTime()) / 1000);
    if (action === "resume" && remaining < 60) return err("SESSION_NOT_RUNNING", "The session has reached its time limit. Start a new one.", "timeout");
    try {
      if (action === "pause") await runtime.pause(session.providerSandboxId);
      else await runtime.resume(session.providerSandboxId, remaining);
    } catch (e) {
      return fromRuntime(e);
    }
    const t = await store.transition(sessionId, actor.userId, session.version, action, {});
    if (!t.ok) return fromDb(t.error);
    return { ok: true, value: { state: action === "pause" ? "paused" : "ready" } };
  }

  async function fileAccess(actor: SandboxActor, sessionId: string, action: "files.read" | "files.write"): Promise<SandboxResult<SessionRecord>> {
    const session = await visibleSession(actor, sessionId);
    if (!session) return err("NOT_FOUND", "That session doesn't exist in this workspace.", "invalid_request");
    const role = await deps.role(actor.orgId);
    const refused = blocked<SessionRecord>(await guard(action, actor, role, session));
    if (refused) return refused;
    if (!runtime || !session.providerSandboxId) return err("NOT_CONNECTED", resolution.reason ?? "The session has no sandbox.", "provider_rejected");
    if (await rateLimited(actor, "files")) return err("RATE_LIMITED", "Too many file requests in the last minute.", "quota_exceeded");
    return { ok: true, value: session };
  }

  async function listFiles(actor: SandboxActor, sessionId: string, dir: unknown): Promise<SandboxResult<RuntimeFileEntry[]>> {
    const p = resolveSandboxPath(dir ?? "");
    if (!p.ok) return err("INVALID_REQUEST", p.reason, "invalid_request");
    const access = await fileAccess(actor, sessionId, "files.read");
    if (!access.ok) return access;
    try {
      return { ok: true, value: await runtime!.listFiles(access.value.providerSandboxId!, p.relative) };
    } catch (e) {
      return fromRuntime(e);
    }
  }

  async function readFile(actor: SandboxActor, sessionId: string, path: unknown): Promise<SandboxResult<{ path: string; content: string }>> {
    const p = resolveSandboxPath(path);
    if (!p.ok || p.relative === "") return err("INVALID_REQUEST", p.ok ? "Choose a file." : p.reason, "invalid_request");
    const access = await fileAccess(actor, sessionId, "files.read");
    if (!access.ok) return access;
    try {
      const content = await runtime!.readFile(access.value.providerSandboxId!, p.relative);
      if (content.length > MAX_SANDBOX_FILE_BYTES * 2) return err("INVALID_REQUEST", "That file is too large to open here.", "invalid_request");
      return { ok: true, value: { path: p.relative, content } };
    } catch (e) {
      return fromRuntime(e);
    }
  }

  async function writeFile(actor: SandboxActor, sessionId: string, path: unknown, content: unknown): Promise<SandboxResult<{ path: string; bytes: number }>> {
    const p = resolveSandboxPath(path);
    if (!p.ok || p.relative === "") return err("INVALID_REQUEST", p.ok ? "Choose a file." : p.reason, "invalid_request");
    if (typeof content !== "string") return err("INVALID_REQUEST", "File content must be text.", "invalid_request");
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_SANDBOX_FILE_BYTES) return err("INVALID_REQUEST", "Files are limited to 512 KB here.", "invalid_request");
    if (content.includes("\u0000")) return err("INVALID_REQUEST", "Only text files can be edited here.", "invalid_request");
    const access = await fileAccess(actor, sessionId, "files.write");
    if (!access.ok) return access;
    const touched = await store.touchSession(sessionId, actor.userId);
    if (!touched.ok) return fromDb(touched.error);
    try {
      await runtime!.writeFiles(access.value.providerSandboxId!, [{ path: p.relative, content }]);
      return { ok: true, value: { path: p.relative, bytes } };
    } catch (e) {
      return fromRuntime(e);
    }
  }

  async function openPreview(actor: SandboxActor, sessionId: string, port: unknown): Promise<SandboxResult<{ url: string; previewId: string; expiresAt: string }>> {
    if (!validPreviewPort(port)) return err("INVALID_REQUEST", "Use a port from 1024 to 65535 that your app listens on.", "invalid_request");
    const session = await visibleSession(actor, sessionId);
    if (!session) return err("NOT_FOUND", "That session doesn't exist in this workspace.", "invalid_request");
    const unavailable = !runtime?.capabilities.previews ? "This runtime doesn't support previews." : previewUnavailableReason(config);
    if (unavailable) return err("PREVIEW_UNAVAILABLE", unavailable, "provider_rejected");
    const role = await deps.role(actor.orgId);
    const refused = blocked<{ url: string; previewId: string; expiresAt: string }>(await guard("preview.open", actor, role, session));
    if (refused) return refused;
    if (await rateLimited(actor, "preview")) return err("RATE_LIMITED", "Too many previews opened in the last minute.", "quota_exceeded");
    const lv = await limitsFor(actor.orgId);
    const previewId = newPreviewId();
    const created = await store.createPreview({ sessionId, actor: actor.userId, id: previewId, port, ttlSeconds: lv.limits.previewMinutes * 60 });
    if (!created.ok) return fromDb(created.error);
    const exp = Math.floor(deps.now().getTime() / 1000) + PREVIEW_LAUNCH_SECONDS;
    const token = await signPreviewToken({ kind: "launch", p: previewId, u: actor.userId, exp, n: deps.randomKey() }, config.preview.secret!);
    const origin = previewOrigin(previewId, config.preview.domain!, config.preview.protocol);
    log("info", "sandbox.preview_opened", { session: sessionId, port });
    return { ok: true, value: { url: `${origin}${PREVIEW_LAUNCH_PATH}?t=${encodeURIComponent(token)}`, previewId, expiresAt: created.value } };
  }

  async function revokePreview(actor: SandboxActor, previewId: string): Promise<SandboxResult<null>> {
    if (!/^[a-z2-7]{26}$/.test(previewId)) return err("NOT_FOUND", "That preview doesn't exist.", "invalid_request");
    const r = await store.revokePreview(previewId, actor.userId);
    return r.ok ? { ok: true, value: null } : fromDb(r.error);
  }

  async function sampleMetrics(actor: SandboxActor, sessionId: string): Promise<SandboxResult<ResourceSample | null>> {
    const session = await visibleSession(actor, sessionId);
    if (!session) return err("NOT_FOUND", "That session doesn't exist in this workspace.", "invalid_request");
    if (!runtime?.capabilities.metrics || session.state !== "ready" || !session.providerSandboxId) return { ok: true, value: null };
    if (await rateLimited(actor, "read")) return err("RATE_LIMITED", "Too many requests in the last minute.", "quota_exceeded");
    try {
      const sample = await runtime.metrics(session.providerSandboxId);
      if (sample) await store.recordMetrics(sessionId, sample);
      return { ok: true, value: sample };
    } catch (e) {
      return fromRuntime(e);
    }
  }

  /**
   * Runs the task contract's required checks in the session, records a
   * receipt, and, when the task is waiting for verification, applies the
   * event the real exit codes support. A partial or failed run is recorded
   * as such; nothing here authorizes a deployment.
   */
  async function runChecks(actor: SandboxActor, sessionId: string, baseKey: string): Promise<SandboxResult<{ digest: string; status: string; taskEvent: string | null; applied: boolean }>> {
    const session = await visibleSession(actor, sessionId);
    if (!session) return err("NOT_FOUND", "That session doesn't exist in this workspace.", "invalid_request");
    if (!session.taskId || !deps.tasks) return err("INVALID_REQUEST", "Link the session to a task to run its contract's checks.", "invalid_request");
    const checksList = await deps.tasks.requiredChecks(actor.orgId, session.taskId);
    if (!checksList || checksList.length === 0) return err("INVALID_REQUEST", "The task's approved contract lists no required checks.", "invalid_request");

    const results: ReceiptCheck[] = [];
    for (const [i, command] of checksList.entries()) {
      const run = await runCommand(actor, sessionId, { command, kind: "check", label: command }, `${baseKey}:check:${i}`);
      if (!run.ok) {
        // A refused or failed-to-start check is recorded as not run, and the rest still run.
        results.push({ name: command, command, exitCode: null, durationMs: null, failure: run.category, stdoutSha256: null, stderrSha256: null });
        if (run.code === "NOT_CONNECTED" || run.code === "SESSION_NOT_RUNNING" || run.code === "BLOCKED") break;
        continue;
      }
      const e = run.value;
      results.push({
        name: command,
        command,
        exitCode: e.state === "succeeded" || e.state === "failed" ? e.exitCode : null,
        durationMs: e.durationMs,
        failure: (e.failureCategory as FailureCategory | null) ?? null,
        stdoutSha256: e.stdoutSha256,
        stderrSha256: e.stderrSha256,
      });
    }
    while (results.length < checksList.length) {
      const command = checksList[results.length]!;
      results.push({ name: command, command, exitCode: null, durationMs: null, failure: "control_plane_interrupted", stdoutSha256: null, stderrSha256: null });
    }

    const role = await deps.role(actor.orgId);
    const decision = await guard("command.run", actor, role, session);
    const proofPackDigest = await deps.tasks.latestProofPackDigest(actor.orgId, session.taskId);
    const statement = buildSandboxReceipt({
      session: { id: session.id, organizationId: session.orgId, projectId: session.projectId, taskId: session.taskId },
      runtime: {
        provider: runtime?.capabilities.provider ?? session.provider,
        isolation: session.isolation,
        template: session.template,
        image: session.image,
        vcpu: session.vcpu,
        memoryMiB: session.memoryMiB,
        egress: egressRules(session.network),
      },
      policy: { version: decision.policyVersion, outcome: decision.outcome },
      snapshot: session.snapshotSha256 ? { sha256: session.snapshotSha256, files: session.snapshotFiles ?? 0 } : null,
      checks: results,
      proofPackDigest,
      createdAt: deps.now().toISOString(),
    });
    const digest = await sandboxReceiptDigest(statement);
    const recorded = await store.recordReceipt({ sessionId, actor: actor.userId, digest, status: statement.predicate.status, statement });
    if (!recorded.ok) return fromDb(recorded.error);

    let applied = false;
    const taskEvent = statement.predicate.verdict.taskEvent;
    if (taskEvent) {
      const task = await deps.tasks.loadTask(actor.orgId, session.taskId);
      if (task && task.state === "VERIFYING") {
        const snap: TaskSnapshot = { id: task.id, orgId: actor.orgId, state: task.state, version: task.version, history: [] };
        const eventId = deps.tasks.newEventId();
        const decided = taskTransition(
          snap,
          {
            id: eventId,
            type: taskEvent,
            at: deps.now(),
            actor: { kind: "system", id: "sandbox" },
            evidence: { checks: results.map((r) => ({ name: r.name, command: r.command, exitCode: r.exitCode })), proofPackDigest: proofPackDigest ?? undefined },
          },
          task.version,
        );
        if (decided.ok && decided.applied) {
          const r = await deps.tasks.applyTransition({ taskId: task.id, actor: actor.userId, eventId, eventType: taskEvent, from: task.state, to: decided.task.state, expectedVersion: task.version });
          applied = r.ok;
          if (!r.ok) log("warn", "sandbox.task_transition_failed", { task: task.id, error: r.error });
        }
      }
    }
    log("info", "sandbox.receipt_recorded", { session: sessionId, digest, status: statement.predicate.status, taskEvent, applied });
    return { ok: true, value: { digest, status: statement.predicate.status, taskEvent, applied } };
  }

  /**
   * The sweeper: ends sessions past their time or idle limits, finishes
   * stopping sessions, retries failed cleanups, closes commands Farbaek lost
   * track of, destroys runtime sandboxes no session owns, and prunes old
   * history. Safe to run concurrently: every change goes through a version
   * check, and destroy is idempotent.
   */
  async function sweep(): Promise<{ expired: number; finished: number; cleanupRetried: number; cleanupFailed: number; interrupted: number; orphans: number; pruned: number }> {
    const now = deps.now();
    const summary = { expired: 0, finished: 0, cleanupRetried: 0, cleanupFailed: 0, interrupted: 0, orphans: 0, pruned: 0 };

    for (const e of await store.overdueExecutions(now, 100)) {
      const r = await store.finishExecution({
        executionId: e.id,
        state: "error",
        exitCode: null,
        durationMs: Math.max(0, now.getTime() - Date.parse(e.startedAt)),
        stdout: e.stdout,
        stderr: `${e.stderr}${e.stderr ? "\n" : ""}[farbaek: ${FAILURE_LABELS.control_plane_interrupted.title}]`,
        stdoutTruncated: e.stdoutTruncated,
        stderrTruncated: e.stderrTruncated,
        stdoutSha256: null,
        stderrSha256: null,
        failure: "control_plane_interrupted",
      });
      if (r.ok) summary.interrupted++;
    }

    const sessions = await store.sessionsToSweep(now, 200);
    for (const s of sessions) {
      try {
        const expired = Date.parse(s.expiresAt) <= now.getTime();
        const idle = s.state === "ready" && Date.parse(s.lastActivityAt) + s.idleSeconds * 1000 <= now.getTime();
        const stuck = (s.state === "requested" || s.state === "provisioning") && Date.parse(s.updatedAt) + 10 * 60_000 <= now.getTime();
        if ((s.state === "ready" || s.state === "paused") && (expired || idle)) {
          const t = await store.transition(s.id, null, s.version, "expire", { end_reason: expired ? "ttl" : "idle" });
          if (!t.ok) continue;
          summary.expired++;
          const done = await finishStop({ ...s, version: t.value, state: "stopping", endReason: expired ? "ttl" : "idle" });
          if (done.ok && done.value.state !== "stopping") summary.finished++;
        } else if (stuck) {
          await store.transition(s.id, null, s.version, "fail", { failure_category: "control_plane_interrupted", failure_message: FAILURE_LABELS.control_plane_interrupted.title });
          summary.expired++;
        } else if (s.state === "stopping") {
          const done = await finishStop(s);
          if (done.ok && done.value.state !== "stopping") summary.finished++;
        } else if (TERMINAL_SESSION_STATES.has(s.state) && (s.cleanupStatus === "pending" || s.cleanupStatus === "failed") && s.cleanupAttempts < 10) {
          summary.cleanupRetried++;
          if (!s.providerSandboxId || !runtime) continue;
          try {
            await runtime.destroy(s.providerSandboxId);
            await store.recordCleanup(s.id, true, null);
          } catch (e) {
            summary.cleanupFailed++;
            await store.recordCleanup(s.id, false, e instanceof Error ? e.message : "Cleanup failed.");
            log("error", "sandbox.cleanup_failed", { session: s.id, attempts: s.cleanupAttempts + 1 });
          }
        }
      } catch (e) {
        log("error", "sandbox.sweep_session_failed", { session: s.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (runtime) {
      try {
        const tagged = await runtime.listTagged({ farbaek: config.deploymentId }, 200);
        for (const t of tagged) {
          const sessionId = t.metadata.session;
          const owner = sessionId ? await store.getSessionAsSystem(sessionId) : null;
          const live = owner && !TERMINAL_SESSION_STATES.has(owner.state) && (owner.providerSandboxId === null || owner.providerSandboxId === t.sandboxId);
          if (!live) {
            await runtime.destroy(t.sandboxId).catch(() => undefined);
            summary.orphans++;
            log("warn", "sandbox.orphan_destroyed", { sandbox: t.sandboxId, session: sessionId ?? null });
          }
        }
      } catch (e) {
        log("error", "sandbox.orphan_scan_failed", { error: e instanceof Error ? e.message : String(e) });
      }
    }

    const pruned = await store.prune(new Date(now.getTime() - SANDBOX_HARD_LIMITS.historyRetentionDays * 86_400_000));
    if (pruned.ok) summary.pruned = pruned.value;
    log("info", "sandbox.sweep", summary);
    return summary;
  }

  return {
    limitsFor,
    overview,
    health,
    createSession,
    runCommand,
    cancelExecution,
    stopSession,
    pauseSession: (a: SandboxActor, id: string) => pauseOrResume(a, id, "pause"),
    resumeSession: (a: SandboxActor, id: string) => pauseOrResume(a, id, "resume"),
    listFiles,
    readFile,
    writeFile,
    openPreview,
    revokePreview,
    sampleMetrics,
    runChecks,
    sweep,
  };
}

export type SandboxService = ReturnType<typeof createSandboxService>;
