import { beforeEach, describe, expect, it, vi } from "vitest";
import { egressRules } from "@/core/sandbox/network";
import { RuntimeError } from "@/core/sandbox/runtime";
import type { SandboxServerConfig } from "./config";

/** A stand-in for the SDK: records what Farbaek asks for and plays back scripted results. */
const fake = vi.hoisted(() => {
  type Run = { cmd: string; args: string[]; sudo?: boolean; detached?: boolean; env?: Record<string, string> };
  const state = {
    created: [] as Record<string, unknown>[],
    runs: [] as Run[],
    written: [] as { path: string; content: string }[],
    deleted: [] as string[],
    files: new Map<string, string>(),
    status: "running" as string,
    missing: false,
    logs: [] as { stream: "stdout" | "stderr"; data: string }[],
    exitCode: 0 as number,
    hang: false,
    findOutput: "",
    killed: [] as string[],
    ports: [] as number[],
    relayUp: false,
    relayStarts: true,
  };

  class APIError extends Error {
    response: { status: number };
    constructor(status: number, message = `HTTP ${status}`) {
      super(message);
      this.response = { status };
    }
  }
  class StreamError extends Error {}

  function finished(exitCode: number, stdout = "") {
    return { exitCode, stdout: async () => stdout, stderr: async () => "" };
  }

  class FakeSandbox {
    name: string;
    vcpus: number;
    memory: number;
    constructor(params: Record<string, unknown>) {
      this.name = String(params.name);
      const vcpus = (params.resources as { vcpus: number } | undefined)?.vcpus ?? 2;
      this.vcpus = vcpus;
      this.memory = vcpus * 2048;
    }
    get status() {
      return state.status;
    }
    static async create(params: Record<string, unknown>) {
      state.created.push(params);
      return new FakeSandbox(params);
    }
    static async get(params: { name: string }) {
      if (state.missing) throw new APIError(404);
      return new FakeSandbox({ name: params.name, resources: { vcpus: 1 } });
    }
    static async list() {
      return { [Symbol.asyncIterator]: async function* () {} };
    }
    async getDefaultUser() {
      return { username: "vercel-sandbox", group: "vercel-sandbox" };
    }
    async delete() {
      state.deleted.push(this.name);
    }
    async readFileToBuffer({ path }: { path: string }) {
      const v = state.files.get(path);
      return v === undefined ? null : Buffer.from(v, "utf8");
    }
    async writeFiles(files: { path: string; content: string }[]) {
      state.written.push(...files);
    }
    async update(params: { ports?: number[] }) {
      if (params.ports) state.ports = params.ports;
    }
    domain(port: number) {
      if (!state.ports.includes(port)) throw new Error(`No route for port ${port}`);
      return `https://sb-${port}.vercel.run/`;
    }
    async runCommand(a: string | Run, b?: string[]) {
      const run: Run = typeof a === "string" ? { cmd: a, args: b ?? [] } : a;
      state.runs.push(run);
      if (run.cmd === "bash" && run.args[1]?.includes("/dev/tcp/")) return finished(state.relayUp ? 0 : 1);
      if (run.cmd === "setsid" && run.args[2]?.includes("nohup node")) {
        state.relayUp = state.relayStarts;
        return finished(0);
      }
      if (run.cmd === "find") return finished(state.findOutput ? 0 : 1, state.findOutput);
      if (run.cmd === "bash" && run.args[1]?.startsWith("kill")) {
        state.killed.push(run.args[1]);
        return finished(0);
      }
      if (!run.detached) return finished(0);
      // A detached command: record its pid file, then stream the scripted logs.
      const pidFile = /> (\S+\.pid)/.exec(run.args[3] ?? "")?.[1];
      if (pidFile) state.files.set(pidFile, "4242\n");
      return {
        cmdId: "cmd_1",
        logs: ({ signal }: { signal?: AbortSignal } = {}) =>
          (async function* () {
            for (const l of state.logs) yield l;
            if (state.hang) {
              await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
            }
          })(),
        wait: async () => ({ exitCode: state.exitCode }),
        kill: async (sig: string) => void state.killed.push(`cmd:${sig}`),
      };
    }
  }

  return { state, APIError, StreamError, FakeSandbox };
});

vi.mock("@vercel/sandbox", () => ({ Sandbox: fake.FakeSandbox, APIError: fake.APIError, StreamError: fake.StreamError }));

const { createVercelRuntime, networkPolicyFor, parseFindOutput, toRuntimeError, vercelCredentialProblem, vercelTags, VERCEL_UNAVAILABLE } = await import("./vercel-runtime");
const { resolveSandboxRuntime, sandboxExecutionMode } = await import("./registry");

function config(over: Partial<SandboxServerConfig["vercel"]> = {}, rest: Partial<SandboxServerConfig> = {}): SandboxServerConfig {
  return {
    provider: "vercel",
    unknownProvider: null,
    e2b: { apiKey: null, domain: null, apiUrl: null, previewProtocol: "https" },
    vercel: { token: "tok", teamId: "team_1", projectId: "prj_1", oidc: false, region: null, ...over },
    isolationVerifiedAt: null,
    runtimeMaxSessionMinutes: 45,
    images: { "node-ts": { small: "vercel/sandbox/universal", standard: "vercel/sandbox/universal" }, python: { small: "vercel/sandbox/universal", standard: "vercel/sandbox/universal" } },
    preview: { domain: null, secret: null, protocol: "https" },
    cronSecret: null,
    deploymentId: "test",
    ...rest,
  };
}

beforeEach(() => {
  Object.assign(fake.state, { created: [], runs: [], written: [], deleted: [], files: new Map(), status: "running", missing: false, logs: [], exitCode: 0, hang: false, findOutput: "", killed: [], ports: [], relayUp: false, relayStarts: true });
});

describe("Vercel credentials and selection", () => {
  it("needs the token, team and project together, or the platform's OIDC token alone", () => {
    expect(vercelCredentialProblem(config())).toBeNull();
    expect(vercelCredentialProblem(config({ token: null, teamId: null, projectId: null, oidc: true }))).toBeNull();
    expect(vercelCredentialProblem(config({ token: null, teamId: null, projectId: null }))).toMatch(/SANDBOX_VERCEL_TOKEN, SANDBOX_VERCEL_TEAM_ID and SANDBOX_VERCEL_PROJECT_ID aren't set/);
    expect(vercelCredentialProblem(config({ projectId: null, oidc: true }))).toMatch(/SANDBOX_VERCEL_PROJECT_ID isn't set/);
  });

  it("is chosen with SANDBOX_PROVIDER=vercel and stays in Review Only until verified", () => {
    const resolution = resolveSandboxRuntime(config());
    expect(resolution.runtime?.id).toBe("vercel");
    expect(sandboxExecutionMode(resolution)).toMatchObject({ mode: "review_only", reason: expect.stringMatching(/Vercel Sandbox is connected, but its isolation hasn't been verified/) });
    expect(resolveSandboxRuntime(config({ token: null })).reason).toMatch(/SANDBOX_VERCEL_TOKEN isn't set/);
  });

  it("says plainly which capabilities are off, and why", () => {
    const { capabilities } = createVercelRuntime(config());
    expect(capabilities).toMatchObject({ provider: "Vercel Sandbox", isolation: "microvm", previews: false, pauseResume: false, metrics: false, cancel: true, maxDurationSeconds: 45 * 60 });
    expect(capabilities.unavailable?.previews).toMatch(/SANDBOX_PREVIEW_SECRET/);
  });
});

describe("network policy", () => {
  it("denies everything, DNS included, when no host is allowed", () => {
    expect(networkPolicyFor(egressRules("none"))).toBe("deny-all");
  });

  it("allows only the registries and still denies private and metadata ranges", () => {
    const policy = networkPolicyFor(egressRules("package_registries"));
    expect(policy).toMatchObject({ allow: ["registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org"] });
    const deny = (policy as { subnets: { deny: string[] } }).subnets.deny;
    expect(deny).toContain("169.254.0.0/16");
    expect(deny).toContain("10.0.0.0/8");
    // A deny-all range would also block the allowed hosts in Vercel's firewall.
    expect(deny).not.toContain("0.0.0.0/0");
  });
});

describe("creating and destroying sandboxes", () => {
  it("starts a sandbox with no env, no ports, no persistence, a capped timeout, and a prepared project folder", async () => {
    const runtime = createVercelRuntime(config());
    const created = await runtime.create({ image: "vercel/sandbox/universal", vcpu: 1, ttlSeconds: 4 * 3600, egress: egressRules("none"), metadata: { farbaek: "test", session: "s-1", org: "o-1" } });
    const params = fake.state.created[0]!;
    expect(params).toMatchObject({
      token: "tok",
      teamId: "team_1",
      projectId: "prj_1",
      image: "vercel/sandbox/universal",
      resources: { vcpus: 1 },
      timeout: 45 * 60 * 1000,
      networkPolicy: "deny-all",
      persistent: false,
      ports: [],
      env: {},
      tags: { farbaek: "test", session: "s-1", org: "o-1" },
    });
    expect(created).toMatchObject({ vcpu: 1, memoryMiB: 2048 });
    expect(created.sandboxId).toMatch(/^fb-[a-z0-9]{20}$/);
    const setup = fake.state.runs.filter((r) => r.sudo);
    expect(setup.map((r) => r.cmd)).toEqual(["mkdir", "chown"]);
    expect(setup[0]!.args).toContain("/home/user/project");
  });

  it("asks for an even number of vCPUs above one, as Vercel requires", async () => {
    await createVercelRuntime(config()).create({ image: "x", vcpu: 3, ttlSeconds: 60, egress: egressRules("none"), metadata: {} });
    expect(fake.state.created[0]).toMatchObject({ resources: { vcpus: 4 } });
  });

  it("deletes on destroy and reports a sandbox that's already gone", async () => {
    const runtime = createVercelRuntime(config());
    expect(await runtime.destroy("fb-abc")).toEqual({ existed: true });
    expect(fake.state.deleted).toEqual(["fb-abc"]);
    fake.state.missing = true;
    expect(await runtime.destroy("fb-abc")).toEqual({ existed: false });
    expect(await runtime.isAlive("fb-abc")).toBe(false);
  });

  it("previews through the signed relay when a preview secret is set: started once, one port exposed, each request signed", async () => {
    const { relayKey, RELAY_HEADERS, RELAY_KEY_PATH, RELAY_SCRIPT_PATH, relayMessage } = await import("@/core/sandbox/relay");
    const secret = "q".repeat(48);
    const runtime = createVercelRuntime(config({}, { preview: { domain: "preview.example.test", secret, protocol: "https" } }));
    expect(runtime.capabilities.previews).toBe(true);
    const target = await runtime.previewTarget("fb-abc", 3000, { method: "GET", path: "/dashboard?tab=1" });
    expect(target.origin).toBe("https://sb-3999.vercel.run");
    expect(fake.state.ports).toEqual([3999]);
    const key = await relayKey(secret, "fb-abc");
    expect(fake.state.written).toEqual(expect.arrayContaining([{ path: RELAY_KEY_PATH, content: key }, expect.objectContaining({ path: RELAY_SCRIPT_PATH })]));
    expect(fake.state.runs.some((r) => r.cmd === "chmod" && r.args.join(" ") === `600 ${RELAY_KEY_PATH}`)).toBe(true);

    // The signature covers this exact request, and only this sandbox's key makes it.
    const h = target.headers;
    const expected = await import("node:crypto").then((c) =>
      c.createHmac("sha256", key).update(relayMessage({ method: "GET", path: "/dashboard?tab=1", port: 3000, ts: Number(h[RELAY_HEADERS.ts]), nonce: h[RELAY_HEADERS.nonce]! })).digest("hex"),
    );
    expect(h[RELAY_HEADERS.sig]).toBe(expected);
    expect(h[RELAY_HEADERS.port]).toBe("3000");

    const starts = fake.state.runs.filter((r) => r.cmd === "setsid").length;
    await runtime.previewTarget("fb-abc", 3000, { method: "GET", path: "/" });
    expect(fake.state.runs.filter((r) => r.cmd === "setsid").length).toBe(starts);
  });

  it("says so when the relay doesn't start, and never exposes an app port", async () => {
    fake.state.relayStarts = false;
    const runtime = createVercelRuntime(config({}, { preview: { domain: "preview.example.test", secret: "q".repeat(48), protocol: "https" } }));
    await expect(runtime.previewTarget("fb-xyz", 3000, { method: "GET", path: "/" })).rejects.toThrow(/relay didn't start/);
    expect(fake.state.ports).toEqual([]);
  }, 15_000);

  it("refuses pause, resume and previews with the reason", async () => {
    const runtime = createVercelRuntime(config());
    await expect(runtime.pause("fb-abc")).rejects.toThrow(VERCEL_UNAVAILABLE.pauseResume);
    await expect(runtime.previewTarget("fb-abc", 3000, { method: "GET", path: "/" })).rejects.toThrow(VERCEL_UNAVAILABLE.previews);
  });
});

describe("running commands", () => {
  it("streams output, reports the real exit code and the process-group id", async () => {
    fake.state.logs = [
      { stream: "stdout", data: "hello\n" },
      { stream: "stderr", data: "warn\n" },
    ];
    fake.state.exitCode = 3;
    let stdout = "";
    let stderr = "";
    let pid: number | null = null;
    const r = await createVercelRuntime(config()).exec("fb-abc", { command: "npm test", timeoutSeconds: 10 }, { onStdout: (c) => (stdout += c), onStderr: (c) => (stderr += c), onStart: (p) => void (pid = p) });
    expect(r).toEqual({ exitCode: 3, timedOut: false, runtimeError: null });
    expect([stdout, stderr, pid]).toEqual(["hello\n", "warn\n", 4242]);
    const run = fake.state.runs.find((x) => x.detached)!;
    expect(run.cmd).toBe("setsid");
    expect(run.args.slice(0, 3)).toEqual(["-w", "bash", "-c"]);
    expect(run.args[3]).toContain("cd /home/user/project");
    expect(run.args[3]).toContain("npm test");
    expect(run.env).toEqual({});
  });

  it("kills the whole process group at the timeout and reports no exit code", async () => {
    fake.state.hang = true;
    const r = await createVercelRuntime(config()).exec("fb-abc", { command: "sleep 30", timeoutSeconds: 0.05 }, {});
    expect(r).toEqual({ exitCode: null, timedOut: true, runtimeError: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.state.killed.join(" ")).toMatch(/kill -KILL -- -4242/);
  });

  it("cancels by signalling the process group", async () => {
    expect(await createVercelRuntime(config()).kill("fb-abc", 4242)).toBe(true);
    expect(fake.state.killed[0]).toMatch(/kill -TERM -- -4242/);
    expect(await createVercelRuntime(config()).kill("fb-abc", 1)).toBe(false);
  });
});

describe("files", () => {
  it("creates folders, then writes inside the project folder only", async () => {
    const runtime = createVercelRuntime(config());
    await runtime.writeFiles("fb-abc", [{ path: "src/a.ts", content: "a" }]);
    expect(fake.state.runs.find((r) => r.cmd === "mkdir" && !r.sudo)?.args).toEqual(["-p", "/home/user/project", "/home/user/project/src"]);
    expect(fake.state.written).toEqual([{ path: "/home/user/project/src/a.ts", content: "a" }]);
    await expect(runtime.writeFiles("fb-abc", [{ path: "../etc/passwd", content: "x" }])).rejects.toThrow(/leave the project folder/);
  });

  it("reads files and refuses large or missing ones", async () => {
    const runtime = createVercelRuntime(config());
    fake.state.files.set("/home/user/project/a.txt", "hi");
    expect(await runtime.readFile("fb-abc", "a.txt")).toBe("hi");
    await expect(runtime.readFile("fb-abc", "missing.txt")).rejects.toThrow(/doesn't exist/);
    fake.state.files.set("/home/user/project/big.txt", "x".repeat(600 * 1024));
    await expect(runtime.readFile("fb-abc", "big.txt")).rejects.toMatchObject({ category: "resource_limit" });
  });

  it("lists a folder from find output, folders first, and treats a missing folder as empty", async () => {
    const runtime = createVercelRuntime(config());
    expect(await runtime.listFiles("fb-abc", "nope")).toEqual([]);
    fake.state.findOutput = "f\t12\tb.txt\0d\t4096\tlib\0f\t3\ta b.md\0";
    expect(await runtime.listFiles("fb-abc", "src")).toEqual([
      { name: "lib", path: "src/lib", type: "dir", size: null },
      { name: "a b.md", path: "src/a b.md", type: "file", size: 3 },
      { name: "b.txt", path: "src/b.txt", type: "file", size: 12 },
    ]);
  });

  it("drops entries whose names would escape the folder", () => {
    expect(parseFindOutput("f\t1\t..\0f\t1\tok\0", "")).toEqual([{ name: "ok", path: "ok", type: "file", size: 1 }]);
  });
});

describe("errors and labels", () => {
  it("maps Vercel's answers to categories people can act on", () => {
    expect(toRuntimeError(new fake.APIError(401), "Starting")).toMatchObject({ category: "provider_rejected", message: expect.stringMatching(/SANDBOX_VERCEL_TOKEN/) });
    expect(toRuntimeError(new fake.APIError(402), "Starting")).toMatchObject({ category: "quota_exceeded" });
    expect(toRuntimeError(new fake.APIError(404), "Starting")).toMatchObject({ category: "sandbox_gone" });
    expect(toRuntimeError(new fake.APIError(429), "Starting")).toMatchObject({ category: "provider_rejected", retryable: true });
    expect(toRuntimeError(new fake.APIError(503), "Starting")).toMatchObject({ category: "provider_unavailable", retryable: true });
    expect(toRuntimeError(new RuntimeError("timeout", "kept"), "x").message).toBe("kept");
  });

  it("keeps at most five plain tags", () => {
    expect(vercelTags({ a: "1", b: "2", c: "3", d: "4", e: "5", f: "6" })).toEqual({ a: "1", b: "2", c: "3", d: "4", e: "5" });
    expect(vercelTags({ "bad key!": "v a l" })).toEqual({ badkey: "val" });
  });
});
