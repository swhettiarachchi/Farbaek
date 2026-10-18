/**
 * MockSandbox: a test double for the runtime contract. TESTS ONLY.
 *
 * It runs nothing. Commands are answered from a fixed script so service
 * logic (idempotency, timeouts, cancellation, cleanup) can be tested
 * deterministically. It is never resolved by the registry and never shown
 * in the app; real execution only happens on a configured, verified runtime.
 */
import { createHash } from "node:crypto";
import { RuntimeError, type ExecOutcome, type RuntimeCapabilities, type SandboxRuntime } from "@/core/sandbox/runtime";

export interface MockRuntimeState {
  live: Map<string, { image: string; metadata: Record<string, string>; paused: boolean; files: Map<string, string> }>;
  executed: string[];
  killed: number[];
  destroyed: string[];
  failCreate: RuntimeError | null;
  failDestroy: RuntimeError | null;
  failWrite: RuntimeError | null;
}

export const MOCK_CAPABILITIES: RuntimeCapabilities = {
  provider: "MockSandbox (tests only)",
  isolation: "microvm",
  verified: true,
  networkEgress: "allowlist",
  maxDurationSeconds: 3600,
  maxMemoryMb: 2048,
  pauseResume: true,
  metrics: true,
  previews: true,
  outputStreaming: true,
  cancel: true,
  filesystem: true,
};

export function createMockRuntime(capabilities: Partial<RuntimeCapabilities> = {}): SandboxRuntime & { state: MockRuntimeState } {
  const state: MockRuntimeState = { live: new Map(), executed: [], killed: [], destroyed: [], failCreate: null, failDestroy: null, failWrite: null };
  let counter = 0;

  const scripted = (command: string): ExecOutcome & { out?: string; err?: string } => {
    if (command === "echo hello") return { exitCode: 0, timedOut: false, runtimeError: null, out: "hello\n" };
    if (/^exit (\d+)$/.test(command)) return { exitCode: Number(command.split(" ")[1]), timedOut: false, runtimeError: null, err: "failed\n" };
    if (command.startsWith("sleep")) return { exitCode: null, timedOut: true, runtimeError: null };
    if (command === "lost") return { exitCode: null, timedOut: false, runtimeError: { category: "provider_unavailable", message: "connection reset" } };
    if (command === "gone") return { exitCode: null, timedOut: false, runtimeError: { category: "sandbox_gone", message: "not found" } };
    if (command === "noisy") return { exitCode: 0, timedOut: false, runtimeError: null, out: "\u001b[32mok\u001b[0m\n" };
    return { exitCode: 0, timedOut: false, runtimeError: null, out: "" };
  };

  return {
    id: "mock",
    capabilities: { ...MOCK_CAPABILITIES, ...capabilities },
    state,
    async health() {
      return { ok: true, latencyMs: 1 };
    },
    async create(spec) {
      if (state.failCreate) throw state.failCreate;
      const sandboxId = `mock${++counter}`;
      state.live.set(sandboxId, { image: spec.image, metadata: spec.metadata, paused: false, files: new Map() });
      return { sandboxId, vcpu: 1, memoryMiB: 1024 };
    },
    async destroy(sandboxId) {
      if (state.failDestroy) throw state.failDestroy;
      state.destroyed.push(sandboxId);
      return { existed: state.live.delete(sandboxId) };
    },
    async isAlive(sandboxId) {
      return state.live.has(sandboxId);
    },
    async pause(sandboxId) {
      const s = state.live.get(sandboxId);
      if (!s) throw new RuntimeError("sandbox_gone", "gone");
      s.paused = true;
    },
    async resume(sandboxId) {
      const s = state.live.get(sandboxId);
      if (!s) throw new RuntimeError("sandbox_gone", "gone");
      s.paused = false;
    },
    async exec(sandboxId, request, handlers) {
      if (!state.live.has(sandboxId)) return { exitCode: null, timedOut: false, runtimeError: { category: "sandbox_gone", message: "gone" } };
      if (request.command.startsWith("sha256sum -- ")) {
        // Hashes the sandbox's copies of the files, like the real command.
        const files = state.live.get(sandboxId)!.files;
        const paths = [...request.command.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
        const lines = paths.filter((p) => files.has(p)).map((p) => `${createHash("sha256").update(files.get(p)!, "utf8").digest("hex")}  ${p}`);
        if (lines.length) handlers.onStdout?.(`${lines.join("\n")}\n`);
        return { exitCode: 0, timedOut: false, runtimeError: null };
      }
      state.executed.push(request.command);
      await handlers.onStart?.(100 + state.executed.length);
      const r = scripted(request.command);
      if (r.out) handlers.onStdout?.(r.out);
      if (r.err) handlers.onStderr?.(r.err);
      return { exitCode: r.exitCode, timedOut: r.timedOut, runtimeError: r.runtimeError };
    },
    async kill(_sandboxId, pid) {
      state.killed.push(pid);
      return true;
    },
    async listFiles(sandboxId, dir) {
      const files = state.live.get(sandboxId)?.files ?? new Map<string, string>();
      return [...files.keys()]
        .filter((p) => (dir ? p.startsWith(`${dir}/`) : true))
        .map((p) => ({ name: p.split("/").at(-1)!, path: p, type: "file" as const, size: files.get(p)!.length }));
    },
    async readFile(sandboxId, path) {
      const content = state.live.get(sandboxId)?.files.get(path);
      if (content === undefined) throw new RuntimeError("invalid_request", "No such file.");
      return content;
    },
    async writeFiles(sandboxId, files) {
      if (state.failWrite) throw state.failWrite;
      const s = state.live.get(sandboxId);
      if (!s) throw new RuntimeError("sandbox_gone", "gone");
      for (const f of files) s.files.set(f.path, f.content);
    },
    async metrics() {
      return { at: "2026-10-17T10:00:00.000Z", cpuPct: 12.5, cpuCount: 1, memUsedBytes: 100, memTotalBytes: 1000, diskUsedBytes: 10, diskTotalBytes: 100 };
    },
    async previewTarget(sandboxId, port) {
      return { origin: `https://${port}-${sandboxId}.mock.test`, headers: { "e2b-traffic-access-token": "test-token" } };
    },
    async listTagged(metadata) {
      return [...state.live.entries()].filter(([, s]) => Object.entries(metadata).every(([k, v]) => s.metadata[k] === v)).map(([id, s]) => ({ sandboxId: id, metadata: s.metadata }));
    },
  };
}
