/**
 * The E2B adapter (ADR 0013). Each sandbox is a Firecracker microVM run by
 * E2B: either a self-hosted E2B deployment (E2B Embed on a KVM host that
 * Farbaek controls, reached through E2B_DOMAIN or E2B_API_URL) or E2B Cloud,
 * with the same code.
 *
 * What this adapter guarantees on Farbaek's side:
 * - Sandboxes get no environment variables from this server. Nothing from
 *   process.env is passed in; the API key only authenticates the SDK.
 * - Egress is always set explicitly: deny all, plus at most the package
 *   registries. Public URLs are off (allowPublicTraffic: false), so a port is
 *   only reachable through Farbaek's preview gateway, which adds the traffic
 *   token on the server.
 * - The runtime's own timeout is always set, so a sandbox ends even if
 *   Farbaek's sweeper never runs.
 * - A command that times out is killed explicitly, and reported with no exit
 *   code rather than a guessed one.
 */
import {
  AuthenticationError,
  CommandExitError,
  InvalidArgumentError,
  NotEnoughSpaceError,
  NotFoundError,
  RateLimitError,
  Sandbox,
  ServiceBusyError,
  TimeoutError,
  type ConnectionOpts,
} from "e2b";
import { wrapCommand } from "@/core/sandbox/commands";
import type { FailureCategory } from "@/core/sandbox/failures";
import { SANDBOX_WORKSPACE_ROOT, resolveSandboxPath, toWorkspaceRelative } from "@/core/sandbox/paths";
import {
  RuntimeError,
  type ExecHandlers,
  type ExecOutcome,
  type ExecRequest,
  type PreviewTarget,
  type ResourceSample,
  type RuntimeCapabilities,
  type RuntimeFileEntry,
  type RuntimeHealth,
  type RuntimeSandbox,
  type RuntimeSandboxSpec,
  type SandboxRuntime,
} from "@/core/sandbox/runtime";
import { redact } from "@/server/observability/log";
import type { SandboxServerConfig } from "./config";

const REQUEST_TIMEOUT_MS = 30_000;
const PREVIEW_CACHE_MS = 60_000;

function scrub(message: string): string {
  return redact(message).replace(/\s+/g, " ").slice(0, 300);
}

/** Maps SDK errors to categories people can act on. Messages are scrubbed of anything key-like. */
export function toRuntimeError(err: unknown, context: string): RuntimeError {
  if (err instanceof RuntimeError) return err;
  const message = err instanceof Error ? scrub(err.message) : "Unknown error";
  const at = (category: FailureCategory, text: string, retryable = false) => new RuntimeError(category, `${context}: ${text}`, retryable);
  if (err instanceof AuthenticationError) return at("provider_rejected", "the runtime refused the API key. Check E2B_API_KEY.");
  if (err instanceof RateLimitError) return at("provider_rejected", "the runtime's rate limit was reached. Try again shortly.", true);
  if (err instanceof NotEnoughSpaceError) return at("resource_limit", "the sandbox ran out of disk space.");
  if (err instanceof NotFoundError) return at("sandbox_gone", "the runtime no longer has this sandbox.");
  if (err instanceof InvalidArgumentError) return at("provider_rejected", message);
  if (err instanceof ServiceBusyError) return at("provider_unavailable", "the runtime is busy. Try again shortly.", true);
  if (err instanceof TimeoutError) return at("provider_unavailable", "the runtime didn't answer in time.", true);
  return at("provider_unavailable", message, true);
}

export function createE2bRuntime(config: SandboxServerConfig): SandboxRuntime {
  const apiKey = config.e2b.apiKey;
  if (!apiKey) throw new RuntimeError("provider_rejected", "E2B_API_KEY isn't set on this server.");

  // Only connection settings. No envs, no secrets beyond the key that authenticates the SDK itself.
  const conn: ConnectionOpts = {
    apiKey,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    ...(config.e2b.domain ? { domain: config.e2b.domain } : {}),
    ...(config.e2b.apiUrl ? { apiUrl: config.e2b.apiUrl } : {}),
  };

  const capabilities: RuntimeCapabilities = {
    provider: config.e2b.domain || config.e2b.apiUrl ? "E2B (self-hosted)" : "E2B Cloud",
    isolation: "microvm",
    verified: config.isolationVerifiedAt !== null,
    networkEgress: "allowlist",
    maxDurationSeconds: config.runtimeMaxSessionMinutes * 60,
    maxMemoryMb: 2048,
    pauseResume: true,
    metrics: true,
    previews: true,
    outputStreaming: true,
    cancel: true,
    filesystem: true,
  };

  const previewCache = new Map<string, { target: PreviewTarget; until: number }>();

  async function connect(sandboxId: string): Promise<Sandbox> {
    try {
      return await Sandbox.connect(sandboxId, conn);
    } catch (err) {
      throw toRuntimeError(err, "Connecting to the sandbox");
    }
  }

  return {
    id: "e2b",
    capabilities,

    async health(): Promise<RuntimeHealth> {
      const started = Date.now();
      try {
        await Sandbox.list({ ...conn, limit: 1 }).nextItems();
        return { ok: true, latencyMs: Date.now() - started };
      } catch (err) {
        const e = toRuntimeError(err, "Checking the runtime");
        return { ok: false, category: e.category, reason: e.message };
      }
    },

    async create(spec: RuntimeSandboxSpec): Promise<RuntimeSandbox> {
      let sandbox: Sandbox;
      try {
        sandbox = await Sandbox.create(spec.image, {
          ...conn,
          timeoutMs: spec.ttlSeconds * 1000,
          metadata: spec.metadata,
          envs: {},
          network: {
            allowOut: spec.egress.allowOut,
            denyOut: spec.egress.denyOut,
            allowPublicTraffic: false,
          },
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new RuntimeError("provider_rejected", `The runtime image "${spec.image}" isn't built on this runtime. Build it with pnpm sandbox:templates.`);
        }
        throw toRuntimeError(err, "Starting the sandbox");
      }
      try {
        const info = await sandbox.getInfo();
        return { sandboxId: sandbox.sandboxId, vcpu: info.cpuCount ?? null, memoryMiB: info.memoryMB ?? null };
      } catch {
        return { sandboxId: sandbox.sandboxId, vcpu: null, memoryMiB: null };
      }
    },

    async destroy(sandboxId) {
      previewCache.forEach((_, k) => k.startsWith(`${sandboxId}:`) && previewCache.delete(k));
      try {
        return { existed: await Sandbox.kill(sandboxId, conn) };
      } catch (err) {
        if (err instanceof NotFoundError) return { existed: false };
        throw toRuntimeError(err, "Stopping the sandbox");
      }
    },

    async isAlive(sandboxId) {
      try {
        const info = await Sandbox.getInfo(sandboxId, conn);
        return info.state === "running" || info.state === "paused";
      } catch (err) {
        if (err instanceof NotFoundError) return false;
        throw toRuntimeError(err, "Checking the sandbox");
      }
    },

    async pause(sandboxId) {
      try {
        await Sandbox.pause(sandboxId, conn);
      } catch (err) {
        throw toRuntimeError(err, "Pausing the sandbox");
      }
    },

    async resume(sandboxId, ttlSeconds) {
      try {
        await Sandbox.connect(sandboxId, { ...conn, timeoutMs: ttlSeconds * 1000 });
      } catch (err) {
        throw toRuntimeError(err, "Resuming the sandbox");
      }
    },

    async exec(sandboxId: string, request: ExecRequest, handlers: ExecHandlers): Promise<ExecOutcome> {
      const sandbox = await connect(sandboxId);
      let pid: number | null = null;
      try {
        const handle = await sandbox.commands.run(wrapCommand(request.command), {
          background: true,
          timeoutMs: request.timeoutSeconds * 1000,
          envs: {},
          onStdout: (d) => handlers.onStdout?.(d),
          onStderr: (d) => handlers.onStderr?.(d),
        });
        pid = handle.pid;
        await handlers.onStart?.(handle.pid);
        const result = await handle.wait();
        return { exitCode: result.exitCode, timedOut: false, runtimeError: null };
      } catch (err) {
        if (err instanceof CommandExitError) return { exitCode: err.exitCode, timedOut: false, runtimeError: null };
        if (err instanceof TimeoutError) {
          // The stream ended at the deadline; make sure the process is gone too.
          if (pid !== null) await sandbox.commands.kill(pid).catch(() => false);
          return { exitCode: null, timedOut: true, runtimeError: null };
        }
        const e = toRuntimeError(err, "Running the command");
        return { exitCode: null, timedOut: false, runtimeError: { category: e.category, message: e.message } };
      }
    },

    async kill(sandboxId, pid) {
      const sandbox = await connect(sandboxId);
      try {
        return await sandbox.commands.kill(pid);
      } catch (err) {
        throw toRuntimeError(err, "Stopping the command");
      }
    },

    async listFiles(sandboxId, relativeDir): Promise<RuntimeFileEntry[]> {
      const dir = resolveSandboxPath(relativeDir);
      if (!dir.ok) throw new RuntimeError("invalid_request", dir.reason);
      const sandbox = await connect(sandboxId);
      try {
        if (!(await sandbox.files.exists(dir.absolute))) return [];
        const entries = await sandbox.files.list(dir.absolute, { depth: 1 });
        const out: RuntimeFileEntry[] = [];
        for (const e of entries) {
          const rel = toWorkspaceRelative(e.path);
          if (rel === null || rel === "") continue;
          out.push({ name: e.name, path: rel, type: String(e.type) === "dir" ? "dir" : "file", size: typeof e.size === "number" ? e.size : null });
        }
        return out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
      } catch (err) {
        throw toRuntimeError(err, "Listing files");
      }
    },

    async readFile(sandboxId, relativePath) {
      const p = resolveSandboxPath(relativePath);
      if (!p.ok || p.relative === "") throw new RuntimeError("invalid_request", p.ok ? "Choose a file." : p.reason);
      const sandbox = await connect(sandboxId);
      try {
        return await sandbox.files.read(p.absolute);
      } catch (err) {
        throw toRuntimeError(err, "Reading the file");
      }
    },

    async writeFiles(sandboxId, files) {
      const entries: { path: string; data: string }[] = [];
      for (const f of files) {
        const p = resolveSandboxPath(f.path);
        if (!p.ok || p.relative === "") throw new RuntimeError("invalid_request", p.ok ? "Choose a file." : p.reason);
        entries.push({ path: p.absolute, data: f.content });
      }
      if (entries.length === 0) return;
      const sandbox = await connect(sandboxId);
      try {
        await sandbox.files.makeDir(SANDBOX_WORKSPACE_ROOT);
        // Bounded batches keep each request small.
        for (let i = 0; i < entries.length; i += 100) await sandbox.files.write(entries.slice(i, i + 100));
      } catch (err) {
        throw toRuntimeError(err, "Writing files");
      }
    },

    async metrics(sandboxId): Promise<ResourceSample | null> {
      try {
        const samples = await Sandbox.getMetrics(sandboxId, conn);
        const m = samples.at(-1);
        if (!m) return null;
        return {
          at: new Date(m.timestamp).toISOString(),
          cpuPct: Math.round(m.cpuUsedPct * 10) / 10,
          cpuCount: m.cpuCount,
          memUsedBytes: m.memUsed,
          memTotalBytes: m.memTotal,
          diskUsedBytes: m.diskUsed,
          diskTotalBytes: m.diskTotal,
        };
      } catch (err) {
        if (err instanceof NotFoundError) return null;
        throw toRuntimeError(err, "Reading metrics");
      }
    },

    async listTagged(metadata, limit) {
      try {
        const paginator = Sandbox.list({ ...conn, query: { metadata } });
        const out: { sandboxId: string; metadata: Record<string, string> }[] = [];
        while (paginator.hasNext && out.length < limit) {
          for (const s of await paginator.nextItems()) out.push({ sandboxId: s.sandboxId, metadata: s.metadata ?? {} });
        }
        return out.slice(0, limit);
      } catch (err) {
        throw toRuntimeError(err, "Listing sandboxes");
      }
    },

    async previewTarget(sandboxId, port): Promise<PreviewTarget> {
      const key = `${sandboxId}:${port}`;
      const cached = previewCache.get(key);
      if (cached && cached.until > Date.now()) return cached.target;
      const sandbox = await connect(sandboxId);
      const host = sandbox.getHost(port);
      if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) throw new RuntimeError("provider_rejected", "The runtime returned an unexpected preview host.");
      const token = sandbox.trafficAccessToken;
      if (!token) throw new RuntimeError("provider_rejected", "The runtime didn't return a traffic token, so the preview can't be reached privately.");
      const target: PreviewTarget = { origin: `${config.e2b.previewProtocol}://${host}`, headers: { "e2b-traffic-access-token": token } };
      if (previewCache.size > 200) previewCache.clear();
      previewCache.set(key, { target, until: Date.now() + PREVIEW_CACHE_MS });
      return target;
    },
  };
}
