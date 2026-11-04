/**
 * Helpers for the v1 sandbox API: one JSON error shape, request size limits,
 * idempotency keys, per-user rate limits on reads, and DTOs that leave out
 * runtime internals (provider ids, tokens). Errors never echo stack traces
 * or database messages.
 */
import { SANDBOX_HARD_LIMITS } from "@/config/sandbox";
import { log } from "@/server/observability/log";
import { httpStatusFor, type SandboxResult } from "./service";
import type { ExecutionRecord, ReceiptRecord, SessionRecord } from "./types";
import { sandboxRequest, type SandboxRequest } from "./wiring";
import { readTextCapped } from "@/server/http/body";

export const API_VERSION = "2026-10-17";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-farbaek-api-version": API_VERSION, ...headers },
  });
}

export function problem(status: number, code: string, message: string, category?: string, headers: Record<string, string> = {}): Response {
  return json({ error: { code, message, ...(category ? { category } : {}) } }, status, headers);
}

export function fromResult<T>(result: SandboxResult<T>, map: (v: T) => unknown = (v) => v, okStatus = 200): Response {
  if (result.ok) return json({ data: map(result.value) }, okStatus);
  return problem(httpStatusFor(result.code), result.code, result.message, result.category, result.code === "RATE_LIMITED" ? { "retry-after": "60" } : {});
}

/** A client-supplied Idempotency-Key, or a fresh one. Retrying with the same key never repeats the action. */
export function idempotencyKey(request: Request): string {
  const k = request.headers.get("idempotency-key")?.trim();
  return k && /^[A-Za-z0-9_.:-]{8,100}$/.test(k) ? k : crypto.randomUUID();
}

export async function readJson(request: Request, maxBytes = 640 * 1024): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return { ok: false, response: problem(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON with Content-Type: application/json.") };
  const text = await readTextCapped(request, maxBytes);
  if (text === null) return { ok: false, response: problem(413, "TOO_LARGE", "The request body is too large.") };
  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, response: problem(400, "INVALID_JSON", "The body must be a JSON object.") };
  }
}

/** Authenticates, rate-limits reads, and turns unexpected failures into a plain 500 without details. */
export async function withSandbox(request: Request, handler: (ctx: SandboxRequest) => Promise<Response>): Promise<Response> {
  const correlation = crypto.randomUUID();
  try {
    const ctx = await sandboxRequest(request);
    if (!ctx.ok) return problem(ctx.status, ctx.code, ctx.message);
    if (request.method === "GET" && !(await ctx.value.store.rateLimit(`sandbox:read:${ctx.value.actor.userId}`, 60, SANDBOX_HARD_LIMITS.rateLimits.read))) {
      return problem(429, "RATE_LIMITED", "Too many requests in the last minute.", "quota_exceeded", { "retry-after": "60" });
    }
    const response = await handler(ctx.value);
    response.headers.set("x-request-id", correlation);
    return response;
  } catch (e) {
    log("error", "sandbox.api_error", { request: correlation, path: new URL(request.url).pathname, error: e instanceof Error ? e.message : String(e) });
    return problem(500, "INTERNAL", `Something went wrong. Reference ${correlation}.`, undefined, { "x-request-id": correlation });
  }
}

export function sessionDto(s: SessionRecord) {
  return {
    id: s.id,
    name: s.name,
    state: s.state,
    template: s.template,
    size: s.size,
    network: s.network,
    resources: { requested: { vcpu: s.requestedVcpu, memoryMiB: s.requestedMemoryMiB }, reported: s.vcpu === null ? null : { vcpu: s.vcpu, memoryMiB: s.memoryMiB } },
    isolation: s.isolation,
    provider: s.provider,
    projectId: s.projectId,
    taskId: s.taskId,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    lastActivityAt: s.lastActivityAt,
    endedAt: s.endedAt,
    endReason: s.endReason,
    failure: s.failureCategory ? { category: s.failureCategory, message: s.failureMessage } : null,
    cleanup: { status: s.cleanupStatus, attempts: s.cleanupAttempts },
    snapshot: s.snapshotSha256 ? { sha256: s.snapshotSha256, files: s.snapshotFiles } : null,
    metrics: s.metrics,
    version: s.version,
  };
}

export function executionDto(e: ExecutionRecord) {
  return {
    id: e.id,
    sessionId: e.sessionId,
    kind: e.kind,
    label: e.label,
    command: e.command,
    state: e.state,
    exitCode: e.exitCode,
    failure: e.failureCategory,
    timeoutSeconds: e.timeoutSeconds,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    durationMs: e.durationMs,
    stdout: e.stdout,
    stderr: e.stderr,
    truncated: { stdout: e.stdoutTruncated, stderr: e.stderrTruncated },
    digests: { stdout: e.stdoutSha256, stderr: e.stderrSha256 },
    cancelRequestedAt: e.cancelRequestedAt,
    actorId: e.actorId,
    egress: e.egress,
  };
}

export function receiptDto(r: ReceiptRecord) {
  return { digest: r.digest, sessionId: r.sessionId, taskId: r.taskId, status: r.status, createdAt: r.createdAt, createdBy: r.createdBy, statement: r.statement };
}
