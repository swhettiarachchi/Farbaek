/**
 * The Vercel Sandbox adapter (ADR 0016). Each sandbox is a Firecracker
 * microVM run by Vercel, created through the official SDK with an access
 * token scoped to one team and project (or, when Farbaek runs on Vercel, the
 * platform's OIDC token).
 *
 * What this adapter guarantees on Farbaek's side:
 * - Sandboxes get no environment variables from this server. The token only
 *   authenticates the SDK.
 * - Egress is always set explicitly through Vercel's firewall: deny-all, or
 *   the package registries only, with private, link-local and metadata
 *   ranges denied on top.
 * - Vercel serves exposed ports on public addresses with no sign-in, so app
 *   ports are never exposed. Previews go through one exposed port where
 *   Farbaek's signed relay runs (ADR 0023): it forwards to the app only
 *   requests the preview gateway signed with this sandbox's key, so the
 *   public address alone opens nothing. Without a preview secret, no port is
 *   exposed and previews stay off.
 * - Sandboxes aren't persistent: stopping one discards its disk, so nothing
 *   lingers in snapshot storage.
 * - The runtime's own timeout is always set, so a sandbox ends even if
 *   Farbaek's sweeper never runs.
 * - Each command runs in its own process group, so a cancel or a timeout
 *   stops everything it started, and a timed-out command is reported with no
 *   exit code rather than a guessed one.
 */
import { APIError, Sandbox, StreamError, type NetworkPolicy, type SandboxRegion } from "@vercel/sandbox";
import { wrapCommand } from "@/core/sandbox/commands";
import type { FailureCategory } from "@/core/sandbox/failures";
import { ALL_TRAFFIC, type EgressRules } from "@/core/sandbox/network";
import { RELAY_DIR, RELAY_KEY_PATH, RELAY_PORT, RELAY_SCRIPT, RELAY_SCRIPT_PATH, relayKey, signRelayRequest } from "@/core/sandbox/relay";
import { MAX_SANDBOX_FILE_BYTES, SANDBOX_WORKSPACE_ROOT, resolveSandboxPath } from "@/core/sandbox/paths";
import {
  RuntimeError,
  type ExecHandlers,
  type ExecOutcome,
  type ExecRequest,
  type RuntimeCapabilities,
  type RuntimeFileEntry,
  type RuntimeHealth,
  type RuntimeSandbox,
  type RuntimeSandboxSpec,
  type SandboxRuntime,
} from "@/core/sandbox/runtime";
import { redact } from "@/server/observability/log";
import type { SandboxServerConfig } from "./config";

/** Farbaek's scratch folder inside the sandbox, for process-group ids. */
const WORK_DIR = "/tmp/farbaek";
const MAX_LISTED_ENTRIES = 1000;
const WRITE_BATCH = 100;

export const VERCEL_UNAVAILABLE = {
  previews:
    "Previews on Vercel Sandbox need SANDBOX_PREVIEW_SECRET, which keeps them private through Farbaek's signed relay. It isn't set on this server.",
  pauseResume: "Sessions on Vercel Sandbox can't be paused yet. Stop the session and start a new one when you need it.",
  metrics: "Vercel Sandbox doesn't report live CPU and memory samples.",
} as const;

/** Why the Vercel credentials can't be used, or null when they can. */
export function vercelCredentialProblem(config: SandboxServerConfig): string | null {
  const v = config.vercel;
  if (v.token && v.teamId && v.projectId) return null;
  const partial = Boolean(v.token || v.teamId || v.projectId);
  // Running on Vercel itself: the SDK reads the platform's OIDC token.
  if (!partial && v.oidc) return null;
  if (!partial) return "SANDBOX_PROVIDER is vercel, but SANDBOX_VERCEL_TOKEN, SANDBOX_VERCEL_TEAM_ID and SANDBOX_VERCEL_PROJECT_ID aren't set on this server.";
  const missing = [!v.token && "SANDBOX_VERCEL_TOKEN", !v.teamId && "SANDBOX_VERCEL_TEAM_ID", !v.projectId && "SANDBOX_VERCEL_PROJECT_ID"].filter(Boolean) as string[];
  return `SANDBOX_PROVIDER is vercel, but ${missing.join(" and ")} ${missing.length === 1 ? "isn't" : "aren't"} set on this server.`;
}

/**
 * Farbaek's egress rules as a Vercel firewall policy. No allowed hosts means
 * deny-all (DNS included). Otherwise only the listed hosts are reachable, and
 * the always-denied ranges are denied on top, since denied ranges win over
 * allowed domains in Vercel's firewall.
 */
export function networkPolicyFor(egress: EgressRules): NetworkPolicy {
  if (egress.allowOut.length === 0) return "deny-all";
  return {
    allow: [...egress.allowOut],
    subnets: { deny: egress.denyOut.filter((c) => c !== ALL_TRAFFIC) },
  };
}

/** Labels as Vercel tags: at most 5, short, plain characters. */
export function vercelTags(metadata: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata).slice(0, 5)) {
    const key = k.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    const value = v.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 63);
    if (key && value) out[key] = value;
  }
  return out;
}

/** A sandbox name that's unique within the project and says nothing about its tenant. */
export function newSandboxName(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return `fb-${[...bytes].map((b) => alphabet[b % alphabet.length]).join("")}`;
}

/** Parses `find -printf '%y\t%s\t%f\0'` output into workspace entries. */
export function parseFindOutput(output: string, relativeDir: string): RuntimeFileEntry[] {
  const out: RuntimeFileEntry[] = [];
  for (const record of output.split("\0")) {
    if (out.length >= MAX_LISTED_ENTRIES) break;
    const first = record.indexOf("\t");
    const second = first < 0 ? -1 : record.indexOf("\t", first + 1);
    if (second < 0) continue;
    const type = record.slice(0, first);
    const size = Number(record.slice(first + 1, second));
    const name = record.slice(second + 1);
    const path = relativeDir ? `${relativeDir}/${name}` : name;
    const checked = resolveSandboxPath(path);
    if (!name || !checked.ok || checked.relative !== path) continue;
    out.push({ name, path, type: type === "d" ? "dir" : "file", size: type === "d" || !Number.isFinite(size) ? null : size });
  }
  return out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

function scrub(message: string): string {
  return redact(message).replace(/\s+/g, " ").slice(0, 300);
}

function statusOf(err: unknown): number | null {
  if (!(err instanceof APIError)) return null;
  const status = (err as { response?: { status?: unknown } }).response?.status;
  return typeof status === "number" ? status : null;
}

/** Maps SDK errors to categories people can act on. Messages are scrubbed of anything key-like. */
export function toRuntimeError(err: unknown, context: string): RuntimeError {
  if (err instanceof RuntimeError) return err;
  const at = (category: FailureCategory, text: string, retryable = false) => new RuntimeError(category, `${context}: ${text}`, retryable);
  if (err instanceof StreamError) return at("sandbox_gone", "the sandbox stopped while Farbaek was reading from it.");
  const status = statusOf(err);
  const message = err instanceof Error ? scrub(err.message) : "Unknown error";
  if (status === 401 || status === 403) return at("provider_rejected", "Vercel refused the credentials. Check SANDBOX_VERCEL_TOKEN, and that it can reach the team and project.");
  if (status === 402) return at("quota_exceeded", "the Vercel account's sandbox allowance is used up. On Hobby, new sandboxes are paused until the next cycle.");
  if (status === 404 || status === 410) return at("sandbox_gone", "Vercel no longer has this sandbox.");
  if (status === 429) return at("provider_rejected", "Vercel's rate or concurrency limit was reached. Try again shortly.", true);
  if (status !== null && status >= 400 && status < 500) return at("provider_rejected", message);
  if (err instanceof Error && err.name === "AbortError") return at("provider_unavailable", "Vercel didn't answer in time.", true);
  return at("provider_unavailable", message, true);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createVercelRuntime(config: SandboxServerConfig): SandboxRuntime {
  const problem = vercelCredentialProblem(config);
  if (problem) throw new RuntimeError("provider_rejected", problem);
  // An explicit access token, or nothing so the SDK uses the platform's OIDC token.
  const creds =
    config.vercel.token && config.vercel.teamId && config.vercel.projectId
      ? { token: config.vercel.token, teamId: config.vercel.teamId, projectId: config.vercel.projectId }
      : {};
  const maxTimeoutMs = config.runtimeMaxSessionMinutes * 60 * 1000;

  const capabilities: RuntimeCapabilities = {
    provider: "Vercel Sandbox",
    isolation: "microvm",
    verified: config.isolationVerifiedAt !== null,
    networkEgress: "allowlist",
    maxDurationSeconds: config.runtimeMaxSessionMinutes * 60,
    maxMemoryMb: 4096,
    pauseResume: false,
    metrics: false,
    previews: Boolean(config.preview.secret),
    outputStreaming: true,
    cancel: true,
    filesystem: true,
    unavailable: config.preview.secret ? { pauseResume: VERCEL_UNAVAILABLE.pauseResume, metrics: VERCEL_UNAVAILABLE.metrics } : { ...VERCEL_UNAVAILABLE },
  };

  // Sandboxes whose relay is running, so it's started once per sandbox.
  const relays = new Map<string, { until: number; ready: Promise<void> }>();

  async function relayListening(sandbox: Sandbox): Promise<boolean> {
    const r = await sandbox.runCommand("bash", ["-c", `(exec 3<>/dev/tcp/127.0.0.1/${RELAY_PORT}) 2>/dev/null`]);
    return r.exitCode === 0;
  }

  /** Starts the signed relay inside the sandbox and exposes its one port. */
  async function startRelay(sandbox: Sandbox, sandboxId: string): Promise<void> {
    if (!(await relayListening(sandbox))) {
      const key = await relayKey(config.preview.secret!, sandboxId);
      await sandbox.runCommand("mkdir", ["-p", RELAY_DIR]);
      await sandbox.writeFiles([
        { path: RELAY_SCRIPT_PATH, content: RELAY_SCRIPT },
        { path: RELAY_KEY_PATH, content: key },
      ]);
      await sandbox.runCommand("chmod", ["600", RELAY_KEY_PATH]);
      await sandbox.runCommand({
        cmd: "setsid",
        args: ["bash", "-c", `FARBAEK_RELAY_PORT=${RELAY_PORT} nohup node ${RELAY_SCRIPT_PATH} > ${RELAY_DIR}/relay.log 2>&1 &`],
        env: {},
      });
      for (let i = 0; i < 20 && !(await relayListening(sandbox)); i += 1) await sleep(250);
      if (!(await relayListening(sandbox))) throw new RuntimeError("provider_rejected", "The preview relay didn't start in the sandbox.");
    }
    await sandbox.update({ ports: [RELAY_PORT] });
  }

  async function get(sandboxId: string): Promise<Sandbox> {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(sandboxId)) throw new RuntimeError("invalid_request", "That isn't a sandbox id.");
    try {
      return await Sandbox.get({ name: sandboxId, ...creds });
    } catch (err) {
      throw toRuntimeError(err, "Connecting to the sandbox");
    }
  }

  /** Reads the process-group id a command wrote when it started. */
  async function readPid(sandbox: Sandbox, pidFile: string): Promise<number | null> {
    for (let i = 0; i < 12; i++) {
      const buf = await sandbox.readFileToBuffer({ path: pidFile }).catch(() => null);
      const n = buf ? Number(buf.toString("utf8").trim()) : Number.NaN;
      if (Number.isInteger(n) && n > 1) return n;
      await sleep(150);
    }
    return null;
  }

  async function killGroup(sandbox: Sandbox, pid: number, signal: "TERM" | "KILL"): Promise<boolean> {
    const r = await sandbox.runCommand("bash", ["-c", `kill -${signal} -- -${pid} 2>/dev/null || kill -${signal} ${pid} 2>/dev/null`]);
    return r.exitCode === 0;
  }

  return {
    id: "vercel",
    capabilities,

    async health(): Promise<RuntimeHealth> {
      const started = Date.now();
      try {
        await Sandbox.list({ ...creds, limit: 1 });
        return { ok: true, latencyMs: Date.now() - started };
      } catch (err) {
        const e = toRuntimeError(err, "Checking the runtime");
        return { ok: false, category: e.category, reason: e.message };
      }
    },

    async create(spec: RuntimeSandboxSpec): Promise<RuntimeSandbox> {
      const name = newSandboxName();
      let sandbox: Sandbox;
      try {
        sandbox = await Sandbox.create({
          ...creds,
          name,
          image: spec.image,
          resources: { vcpus: spec.vcpu === 1 ? 1 : Math.max(2, Math.round(spec.vcpu / 2) * 2) },
          timeout: Math.min(spec.ttlSeconds * 1000, maxTimeoutMs),
          networkPolicy: networkPolicyFor(spec.egress),
          persistent: false,
          ports: [],
          env: {},
          tags: vercelTags(spec.metadata),
          ...(config.vercel.region ? { region: config.vercel.region as SandboxRegion } : {}),
        });
      } catch (err) {
        throw toRuntimeError(err, "Starting the sandbox");
      }
      try {
        // The project folder lives where every runtime puts it, owned by the sandbox's default user.
        const user = await sandbox.getDefaultUser();
        const made = await sandbox.runCommand({ cmd: "mkdir", args: ["-p", SANDBOX_WORKSPACE_ROOT, WORK_DIR], sudo: true });
        const owned = await sandbox.runCommand({ cmd: "chown", args: ["-R", `${user.username}:${user.group}`, "/home/user", WORK_DIR], sudo: true });
        if (made.exitCode !== 0 || owned.exitCode !== 0) throw new RuntimeError("provider_rejected", "Starting the sandbox: the project folder couldn't be prepared.");
      } catch (err) {
        await sandbox.delete().catch(() => undefined);
        throw toRuntimeError(err, "Preparing the sandbox");
      }
      const vcpu = sandbox.vcpus ?? null;
      return { sandboxId: name, vcpu, memoryMiB: sandbox.memory ?? (vcpu ? vcpu * 2048 : null) };
    },

    async destroy(sandboxId) {
      let sandbox: Sandbox;
      try {
        sandbox = await get(sandboxId);
      } catch (err) {
        if (err instanceof RuntimeError && err.category === "sandbox_gone") return { existed: false };
        throw err;
      }
      try {
        await sandbox.delete();
        return { existed: true };
      } catch (err) {
        const e = toRuntimeError(err, "Stopping the sandbox");
        if (e.category === "sandbox_gone") return { existed: false };
        throw e;
      }
    },

    async isAlive(sandboxId) {
      try {
        const sandbox = await get(sandboxId);
        return sandbox.status === "running" || sandbox.status === "pending";
      } catch (err) {
        if (err instanceof RuntimeError && err.category === "sandbox_gone") return false;
        throw err;
      }
    },

    async pause() {
      throw new RuntimeError("provider_rejected", VERCEL_UNAVAILABLE.pauseResume);
    },

    async resume() {
      throw new RuntimeError("provider_rejected", VERCEL_UNAVAILABLE.pauseResume);
    },

    async exec(sandboxId: string, request: ExecRequest, handlers: ExecHandlers): Promise<ExecOutcome> {
      const sandbox = await get(sandboxId);
      const pidFile = `${WORK_DIR}/run-${newSandboxName().slice(3)}.pid`;
      // setsid makes the command its own process group (its pid is the group id), so killing the group stops everything it started.
      const script = `echo $$ > ${pidFile}\n${wrapCommand(request.command, undefined, request.prelude)}`;
      const abort = new AbortController();
      let timedOut = false;
      let pid: number | null = null;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const cmd = await sandbox.runCommand({ cmd: "setsid", args: ["-w", "bash", "-c", script], detached: true, env: {} });
        const started = readPid(sandbox, pidFile).then(async (found) => {
          pid = found;
          if (found !== null) await handlers.onStart?.(found);
        });
        deadline = setTimeout(() => {
          timedOut = true;
          abort.abort();
          void (pid !== null ? killGroup(sandbox, pid, "KILL").catch(() => false) : Promise.resolve(false)).then(() => cmd.kill("SIGKILL").catch(() => undefined));
        }, request.timeoutSeconds * 1000);
        try {
          for await (const line of cmd.logs({ signal: abort.signal })) {
            if (line.stream === "stdout") handlers.onStdout?.(line.data);
            else handlers.onStderr?.(line.data);
          }
        } catch (err) {
          if (!timedOut) throw err;
        }
        await started.catch(() => undefined);
        if (timedOut) return { exitCode: null, timedOut: true, runtimeError: null };
        const done = await cmd.wait();
        return { exitCode: done.exitCode, timedOut: false, runtimeError: null };
      } catch (err) {
        if (timedOut) return { exitCode: null, timedOut: true, runtimeError: null };
        const e = toRuntimeError(err, "Running the command");
        return { exitCode: null, timedOut: false, runtimeError: { category: e.category, message: e.message } };
      } finally {
        if (deadline) clearTimeout(deadline);
      }
    },

    async kill(sandboxId, pid) {
      if (!Number.isInteger(pid) || pid < 2) return false;
      const sandbox = await get(sandboxId);
      try {
        return await killGroup(sandbox, pid, "TERM");
      } catch (err) {
        throw toRuntimeError(err, "Stopping the command");
      }
    },

    async listFiles(sandboxId, relativeDir): Promise<RuntimeFileEntry[]> {
      const dir = resolveSandboxPath(relativeDir);
      if (!dir.ok) throw new RuntimeError("invalid_request", dir.reason);
      const sandbox = await get(sandboxId);
      try {
        const r = await sandbox.runCommand({ cmd: "find", args: [dir.absolute, "-mindepth", "1", "-maxdepth", "1", "-printf", "%y\\t%s\\t%f\\0"] });
        const out = await r.stdout();
        // A folder that doesn't exist yet is empty, as on every runtime.
        if (r.exitCode !== 0 && out === "") return [];
        return parseFindOutput(out, dir.relative);
      } catch (err) {
        throw toRuntimeError(err, "Listing files");
      }
    },

    async readFile(sandboxId, relativePath) {
      const p = resolveSandboxPath(relativePath);
      if (!p.ok || p.relative === "") throw new RuntimeError("invalid_request", p.ok ? "Choose a file." : p.reason);
      const sandbox = await get(sandboxId);
      let buf: Buffer | null;
      try {
        buf = await sandbox.readFileToBuffer({ path: p.absolute });
      } catch (err) {
        throw toRuntimeError(err, "Reading the file");
      }
      if (buf === null) throw new RuntimeError("invalid_request", "That file doesn't exist in the sandbox.");
      if (buf.length > MAX_SANDBOX_FILE_BYTES) throw new RuntimeError("resource_limit", "The file is larger than 512 KB, so it isn't shown here.");
      return buf.toString("utf8");
    },

    async writeFiles(sandboxId, files) {
      const entries: { path: string; content: string | Uint8Array }[] = [];
      const dirs = new Set<string>([SANDBOX_WORKSPACE_ROOT]);
      for (const f of files) {
        const p = resolveSandboxPath(f.path);
        if (!p.ok || p.relative === "") throw new RuntimeError("invalid_request", p.ok ? "Choose a file." : p.reason);
        entries.push({ path: p.absolute, content: f.content });
        dirs.add(p.absolute.slice(0, p.absolute.lastIndexOf("/")));
      }
      if (entries.length === 0) return;
      const sandbox = await get(sandboxId);
      try {
        const all = [...dirs];
        for (let i = 0; i < all.length; i += 500) {
          const made = await sandbox.runCommand("mkdir", ["-p", ...all.slice(i, i + 500)]);
          if (made.exitCode !== 0) throw new RuntimeError("provider_rejected", "Writing files: a folder couldn't be created.");
        }
        // Bounded batches keep each upload small.
        for (let i = 0; i < entries.length; i += WRITE_BATCH) await sandbox.writeFiles(entries.slice(i, i + WRITE_BATCH));
      } catch (err) {
        throw toRuntimeError(err, "Writing files");
      }
    },

    async metrics() {
      return null;
    },

    async listTagged(metadata, limit) {
      const [first] = Object.entries(vercelTags(metadata));
      if (!first) return [];
      try {
        const result = await Sandbox.list({ ...creds, tags: { [first[0]]: first[1] } as Record<string, string>, limit: Math.min(Math.max(limit, 1), 100) });
        const out: { sandboxId: string; metadata: Record<string, string> }[] = [];
        for await (const s of result) {
          if (out.length >= limit) break;
          const tags = (s as { tags?: Record<string, string> }).tags ?? {};
          if (Object.entries(vercelTags(metadata)).every(([k, v]) => tags[k] === v)) out.push({ sandboxId: s.name, metadata: tags });
        }
        return out;
      } catch (err) {
        throw toRuntimeError(err, "Listing sandboxes");
      }
    },

    async previewTarget(sandboxId, port, request) {
      if (!config.preview.secret) throw new RuntimeError("provider_rejected", VERCEL_UNAVAILABLE.previews);
      let sandbox = await get(sandboxId);
      let relay = relays.get(sandboxId);
      if (!relay || relay.until < Date.now()) {
        relay = { until: Date.now() + 5 * 60_000, ready: startRelay(sandbox, sandboxId) };
        relays.set(sandboxId, relay);
        if (relays.size > 500) relays.clear();
      }
      try {
        await relay.ready;
      } catch (err) {
        relays.delete(sandboxId);
        throw toRuntimeError(err, "Starting the preview relay");
      }
      let origin: string;
      try {
        origin = sandbox.domain(RELAY_PORT);
      } catch {
        // The port was just exposed: read the sandbox again for its new route.
        sandbox = await get(sandboxId);
        origin = sandbox.domain(RELAY_PORT);
      }
      origin = origin.replace(/\/$/, "");
      if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(origin)) throw new RuntimeError("provider_rejected", "The runtime returned an unexpected preview address.");
      const key = await relayKey(config.preview.secret, sandboxId);
      return { origin, headers: await signRelayRequest(key, { method: request.method, path: request.path, port }) };
    },
  };
}
