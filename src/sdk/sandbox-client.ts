/**
 * Farbaek Sandbox SDK: a small typed client for the v1 sandbox API.
 * Framework-free; works in Node 20+, Deno, Bun and browsers.
 *
 *   const fb = new FarbaekSandboxClient({ baseUrl: "https://app.example", accessToken, workspaceId });
 *   const session = await fb.create({ name: "Try", template: "node-ts", size: "small", network: "none", minutes: 20 });
 *   for await (const event of fb.runStream(session.id, "npm test")) { ... }
 *   await fb.stop(session.id);
 *
 * Authentication is the person's own Supabase access token (Bearer), so the
 * client can do exactly what that person can do and nothing more. There are
 * no administrative or runtime-level endpoints in this SDK. Calls that start
 * something send an Idempotency-Key: pass the same `idempotencyKey` when you
 * retry, and the server returns the first result instead of starting a
 * second session or running the command again.
 */

export type SessionState = "requested" | "provisioning" | "ready" | "paused" | "stopping" | "terminated" | "expired" | "failed";
export type ExecutionState = "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | "error";

export interface SandboxSession {
  id: string;
  name: string;
  state: SessionState;
  template: "node-ts" | "python";
  size: "small" | "standard";
  network: "none" | "package_registries";
  resources: { requested: { vcpu: number; memoryMiB: number }; reported: { vcpu: number; memoryMiB: number | null } | null };
  isolation: string;
  provider: string;
  projectId: string | null;
  taskId: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  endedAt: string | null;
  endReason: string | null;
  failure: { category: string; message: string | null } | null;
  cleanup: { status: string; attempts: number };
  snapshot: { sha256: string; files: number | null } | null;
  metrics: ResourceSample | null;
  version: number;
}

export interface Execution {
  id: string;
  sessionId: string;
  kind: "command" | "check" | "setup";
  label: string | null;
  command: string;
  state: ExecutionState;
  exitCode: number | null;
  failure: string | null;
  timeoutSeconds: number;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  stdout: string;
  stderr: string;
  truncated: { stdout: boolean; stderr: boolean };
  digests: { stdout: string | null; stderr: string | null };
  cancelRequestedAt: string | null;
  actorId: string;
  /** What the command asked to reach on the network, recorded by Farbaek's proxy in the sandbox; null when it wasn't recorded. */
  egress: { allowed: EgressHost[]; blocked: EgressHost[]; unreadable: number; truncated: boolean } | null;
}

export interface EgressHost {
  host: string;
  port: number;
  attempts: number;
}

export interface ResourceSample {
  at: string;
  cpuPct: number;
  cpuCount: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number | null;
}

export interface CreateSessionInput {
  name: string;
  template: "node-ts" | "python";
  size: "small" | "standard";
  network: "none" | "package_registries";
  minutes: number;
  projectId?: string | null;
  taskId?: string | null;
  include?: string[];
}

export type StreamEvent =
  | { type: "start"; executionId: string }
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "end"; execution: Execution };

export class FarbaekApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly category: string | null,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "FarbaekApiError";
  }

  /** True for failures where the same call may succeed later (rate limits, runtime outages). */
  get retryable(): boolean {
    return this.status === 429 || this.status === 502 || this.status === 503;
  }
}

export interface ClientOptions {
  baseUrl: string;
  /**
   * The person's Supabase access token. Leave it out only in Farbaek's own
   * pages, where the session cookie authenticates same-origin requests.
   */
  accessToken?: string;
  /** Workspace (organization) id. Defaults to the person's first workspace. */
  workspaceId?: string;
  fetch?: typeof fetch;
  newKey?: () => string;
}

export class FarbaekSandboxClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly newKey: () => string;

  constructor(private readonly options: ClientOptions) {
    this.base = options.baseUrl.replace(/\/+$/, "");
    this.doFetch = options.fetch ?? fetch.bind(globalThis);
    this.newKey = options.newKey ?? (() => crypto.randomUUID());
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      ...(this.options.accessToken ? { authorization: `Bearer ${this.options.accessToken}` } : {}),
      ...(this.options.workspaceId ? { "x-farbaek-workspace": this.options.workspaceId } : {}),
      ...extra,
    };
  }

  /** A key to reuse when retrying a call that starts something. */
  newIdempotencyKey(): string {
    return this.newKey();
  }

  private async request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const res = await this.doFetch(`${this.base}${path}`, {
      method,
      headers: this.headers({
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: { data?: T; error?: { code: string; message: string; category?: string } } = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      // fall through to the generic error below
    }
    if (!res.ok || parsed.error) {
      throw new FarbaekApiError(res.status, parsed.error?.code ?? "HTTP_ERROR", parsed.error?.message ?? `Request failed with ${res.status}.`, parsed.error?.category ?? null, res.headers.get("x-request-id"));
    }
    return parsed.data as T;
  }

  health() {
    return this.request<{ execution: { mode: string; reason?: string }; runtime: { reachable: boolean }; capabilities: Record<string, boolean> }>("GET", "/api/v1/sandbox/health");
  }

  async list(query: { state?: SessionState[]; q?: string; sort?: "newest" | "oldest" | "name" | "expiring"; page?: number; pageSize?: number } = {}) {
    const p = new URLSearchParams();
    if (query.state?.length) p.set("state", query.state.join(","));
    if (query.q) p.set("q", query.q);
    if (query.sort) p.set("sort", query.sort);
    if (query.page) p.set("page", String(query.page));
    if (query.pageSize) p.set("pageSize", String(query.pageSize));
    const res = await this.doFetch(`${this.base}/api/v1/sandboxes?${p}`, { headers: this.headers({ accept: "application/json" }) });
    const body = (await res.json()) as { data: SandboxSession[]; total: number; page: number; pageSize: number; error?: { code: string; message: string } };
    if (!res.ok || body.error) throw new FarbaekApiError(res.status, body.error?.code ?? "HTTP_ERROR", body.error?.message ?? "Request failed.", null, res.headers.get("x-request-id"));
    return body;
  }

  create(input: CreateSessionInput, options: { idempotencyKey?: string } = {}) {
    return this.request<SandboxSession>("POST", "/api/v1/sandboxes", { projectId: null, taskId: null, include: [], ...input }, options.idempotencyKey ?? this.newKey());
  }
  get(id: string) {
    return this.request<SandboxSession>("GET", `/api/v1/sandboxes/${encodeURIComponent(id)}`);
  }
  stop(id: string) {
    return this.request<{ state: SessionState }>("DELETE", `/api/v1/sandboxes/${encodeURIComponent(id)}`);
  }
  pause(id: string) {
    return this.request<{ state: SessionState }>("POST", `/api/v1/sandboxes/${encodeURIComponent(id)}/pause`);
  }
  resume(id: string) {
    return this.request<{ state: SessionState }>("POST", `/api/v1/sandboxes/${encodeURIComponent(id)}/resume`);
  }
  run(id: string, command: string, options: { timeoutSeconds?: number; idempotencyKey?: string } = {}) {
    return this.request<Execution>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(id)}/executions`,
      { command, timeoutSeconds: options.timeoutSeconds },
      options.idempotencyKey ?? this.newKey(),
    );
  }
  executions(id: string, limit = 30) {
    return this.request<Execution[]>("GET", `/api/v1/sandboxes/${encodeURIComponent(id)}/executions?limit=${limit}`);
  }
  execution(id: string, executionId: string) {
    return this.request<Execution>("GET", `/api/v1/sandboxes/${encodeURIComponent(id)}/executions/${encodeURIComponent(executionId)}`);
  }
  cancel(id: string, executionId: string) {
    return this.request<{ alreadyFinished: boolean; killed: boolean }>("DELETE", `/api/v1/sandboxes/${encodeURIComponent(id)}/executions/${encodeURIComponent(executionId)}`);
  }
  listFiles(id: string, path = "") {
    return this.request<FileEntry[]>("GET", `/api/v1/sandboxes/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`);
  }
  readFile(id: string, path: string) {
    return this.request<{ path: string; content: string }>("GET", `/api/v1/sandboxes/${encodeURIComponent(id)}/files?read=1&path=${encodeURIComponent(path)}`);
  }
  writeFile(id: string, path: string, content: string) {
    return this.request<{ path: string; bytes: number }>("PUT", `/api/v1/sandboxes/${encodeURIComponent(id)}/files`, { path, content });
  }
  openPreview(id: string, port: number) {
    return this.request<{ url: string; previewId: string; expiresAt: string }>("POST", `/api/v1/sandboxes/${encodeURIComponent(id)}/previews`, { port });
  }
  closePreview(id: string, previewId: string) {
    return this.request<null>("DELETE", `/api/v1/sandboxes/${encodeURIComponent(id)}/previews/${encodeURIComponent(previewId)}`);
  }
  runChecks(id: string, options: { idempotencyKey?: string } = {}) {
    return this.request<{ digest: string; status: string; taskEvent: string | null; applied: boolean }>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(id)}/checks`,
      undefined,
      options.idempotencyKey ?? this.newKey(),
    );
  }
  receipts(id: string) {
    return this.request<{ digest: string; status: string; createdAt: string; statement: unknown }[]>("GET", `/api/v1/sandboxes/${encodeURIComponent(id)}/receipts`);
  }
  metrics(id: string) {
    return this.request<ResourceSample | null>("GET", `/api/v1/sandboxes/${encodeURIComponent(id)}/metrics`);
  }

  /** Runs a command and yields its output as it happens, ending with the recorded result. */
  async *runStream(id: string, command: string, options: { timeoutSeconds?: number; signal?: AbortSignal; idempotencyKey?: string } = {}): AsyncGenerator<StreamEvent> {
    const res = await this.doFetch(`${this.base}/api/v1/sandboxes/${encodeURIComponent(id)}/executions`, {
      method: "POST",
      headers: this.headers({ accept: "text/event-stream", "content-type": "application/json", "idempotency-key": options.idempotencyKey ?? this.newKey() }),
      body: JSON.stringify({ command, timeoutSeconds: options.timeoutSeconds }),
      signal: options.signal,
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; category?: string } };
      throw new FarbaekApiError(res.status, body.error?.code ?? "HTTP_ERROR", body.error?.message ?? "Request failed.", body.error?.category ?? null, res.headers.get("x-request-id"));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const event = block.match(/^event: (.+)$/m)?.[1];
        const data = block.match(/^data: (.*)$/m)?.[1];
        if (!event || data === undefined) continue;
        const payload = JSON.parse(data) as Record<string, unknown>;
        if (event === "start") yield { type: "start", executionId: String(payload.executionId) };
        else if (event === "stdout" || event === "stderr") yield { type: event, data: String(payload.data) };
        else if (event === "end") yield { type: "end", execution: payload.data as Execution };
        else if (event === "error") {
          const e = payload.error as { code: string; message: string; category?: string };
          throw new FarbaekApiError(200, e.code, e.message, e.category ?? null, res.headers.get("x-request-id"));
        }
      }
      if (done) break;
    }
  }
}
