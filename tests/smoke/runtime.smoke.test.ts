/**
 * Runtime smoke test: real execution on the configured runtime (ADR 0013,
 * ADR 0016).
 * Skipped unless run with `pnpm sandbox:smoke` (vitest --mode smoke), so
 * `pnpm test` never starts a billed sandbox by accident.
 *
 * It starts one small sandbox with no network, then checks what Farbaek
 * relies on: real output and exit codes, timeouts that kill, file
 * round-trips, no Docker socket, none of this server's secrets inside, and
 * blocked access to cloud metadata and the internet. It always destroys the
 * sandbox at the end. When everything passes, it prints the value for
 * SANDBOX_ISOLATION_VERIFIED_AT.
 */
import { afterAll, describe, expect, it } from "vitest";
import { egressRules } from "@/core/sandbox/network";
import type { SandboxRuntime } from "@/core/sandbox/runtime";
import { readSandboxConfig } from "@/server/sandbox/config";
import { resolveSandboxRuntime } from "@/server/sandbox/registry";

const enabled = import.meta.env.MODE === "smoke";
let runtime: SandboxRuntime | null = null;
let sandboxId: string | null = null;

async function run(command: string, timeoutSeconds = 30) {
  let stdout = "";
  let stderr = "";
  const r = await runtime!.exec(sandboxId!, { command, timeoutSeconds }, { onStdout: (c) => (stdout += c), onStderr: (c) => (stderr += c) });
  return { ...r, stdout, stderr };
}

describe.skipIf(!enabled)("sandbox runtime smoke test", () => {
  afterAll(async () => {
    if (runtime && sandboxId) {
      const gone = await runtime.destroy(sandboxId);
      console.info(`Cleanup: sandbox ${gone.existed ? "destroyed" : "was already gone"}.`);
    }
  });

  it("has a configured runtime that answers", async () => {
    const resolution = resolveSandboxRuntime(readSandboxConfig());
    expect(resolution.reason).toBeNull();
    runtime = resolution.runtime;
    const health = await runtime!.health();
    expect(health).toMatchObject({ ok: true });
  });

  it("starts a sandbox from the small Node.js image with no network", async () => {
    const config = readSandboxConfig();
    const created = await runtime!.create({
      image: config.images["node-ts"].small,
      vcpu: 1,
      ttlSeconds: 300,
      egress: egressRules("none"),
      metadata: { farbaek: config.deploymentId, smoke: "1" },
    });
    sandboxId = created.sandboxId;
    expect(sandboxId).toMatch(/^[A-Za-z0-9_-]+$/);
    console.info(`Sandbox ${sandboxId}: ${created.vcpu ?? "?"} vCPU, ${created.memoryMiB ?? "?"} MiB reported.`);
  }, 120_000);

  it("runs a harmless command and returns its real output and exit code", async () => {
    const r = await run("echo farbaek-smoke && node --version && uname -r");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("farbaek-smoke");
    console.info(`Guest kernel: ${r.stdout.trim().split("\n").at(-1)}`);
    expect((await run("exit 7")).exitCode).toBe(7);
  }, 60_000);

  it("stops a command at its timeout and reports no exit code", async () => {
    const r = await run("sleep 30", 2);
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
  }, 60_000);

  it("round-trips files inside the project folder", async () => {
    await runtime!.writeFiles(sandboxId!, [{ path: "smoke/hello.txt", content: "hello from farbaek\n" }]);
    expect(await runtime!.readFile(sandboxId!, "smoke/hello.txt")).toBe("hello from farbaek\n");
    expect((await runtime!.listFiles(sandboxId!, "smoke")).map((f) => f.name)).toEqual(["hello.txt"]);
  }, 60_000);

  it("has no Docker socket and none of this server's secrets", async () => {
    expect((await run("test -S /var/run/docker.sock")).exitCode).not.toBe(0);
    const env = (await run("env")).stdout;
    for (const name of ["E2B_API_KEY", "SANDBOX_VERCEL_TOKEN", "VERCEL_OIDC_TOKEN", "SUPABASE_SECRET_KEY", "ANTHROPIC_API_KEY", "SANDBOX_PREVIEW_SECRET", "SANDBOX_CRON_SECRET", "DODO_PAYMENTS_API_KEY"]) {
      expect(env).not.toContain(name);
    }
  }, 60_000);

  it("can't reach cloud metadata or the internet", async () => {
    const probe = (url: string) =>
      run(`node -e "fetch('${url}',{signal:AbortSignal.timeout(4000)}).then(r=>console.log('REACHED',r.status)).catch(()=>console.log('BLOCKED'))"`, 20);
    expect((await probe("http://169.254.169.254/latest/meta-data/")).stdout).toContain("BLOCKED");
    expect((await probe("http://metadata.google.internal/")).stdout).toContain("BLOCKED");
    expect((await probe("https://example.com/")).stdout).toContain("BLOCKED");
  }, 90_000);

  it("is destroyed on request", async () => {
    const gone = await runtime!.destroy(sandboxId!);
    expect(gone.existed).toBe(true);
    expect(await runtime!.isAlive(sandboxId!)).toBe(false);
    sandboxId = null;
    console.info(`All checks passed. If this is the deployment's runtime, set SANDBOX_ISOLATION_VERIFIED_AT=${new Date().toISOString().slice(0, 10)}`);
  }, 60_000);
});
