import { describe, expect, it } from "vitest";
import type { SandboxService } from "@/server/sandbox/service";
import { createSandboxRunner, shellQuote } from "./sandbox-runner";

const record = (over: Partial<{ exitCode: number | null; state: string; stdout: string }> = {}) => ({
  id: "x1",
  state: over.state ?? "succeeded",
  exitCode: over.exitCode === undefined ? 0 : over.exitCode,
  stdout: over.stdout ?? "ok",
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
  durationMs: 12,
});

function fakeService(opts: { writeFails?: boolean; runFails?: boolean } = {}) {
  const writes: string[] = [];
  const commands: string[] = [];
  const service = {
    async writeFile(_a: unknown, _s: string, path: unknown) {
      if (opts.writeFails) return { ok: false, code: "FORBIDDEN", message: "Writes are off.", category: "invalid_request" };
      writes.push(String(path));
      return { ok: true, value: { path, bytes: 1 } };
    },
    async runCommand(_a: unknown, _s: string, input: { command: unknown }) {
      commands.push(String(input.command));
      return opts.runFails ? { ok: false, code: "RATE_LIMITED", message: "Too many commands.", category: "quota_exceeded" } : { ok: true, value: record() };
    },
    async cancelExecution() {
      return { ok: true, value: { alreadyFinished: false, killed: true } };
    },
  } as unknown as Pick<SandboxService, "runCommand" | "writeFile" | "cancelExecution">;
  return { service, writes, commands };
}

describe("sandbox runner", () => {
  it("quotes words for the sandbox's shell", () => {
    expect(shellQuote("pnpm")).toBe("pnpm");
    expect(shellQuote("src/app.test.ts")).toBe("src/app.test.ts");
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("$(rm -rf /)")).toBe("'$(rm -rf /)'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it("copies changed files in before each command, and only when they changed", async () => {
    const { service, writes, commands } = fakeService();
    let files = [{ path: "README.md", content: "v1" }];
    const seen: unknown[] = [];
    const runner = createSandboxRunner({ service, actor: { userId: "u", orgId: "o" }, sessionId: "s", pending: async () => files, onCommand: (c) => seen.push(c), newKey: () => "k" });
    expect(await runner.run("pnpm", ["test", "--", "a b"])).toMatchObject({ exitCode: 0, stdout: "ok", durationMs: 12 });
    await runner.run("pnpm", ["test"]);
    files = [{ path: "README.md", content: "v2" }, { path: "src/new.ts", content: "x" }];
    await runner.run("pnpm", ["test"]);
    expect(writes).toEqual(["README.md", "README.md", "src/new.ts"]);
    expect(commands[0]).toBe("pnpm test -- 'a b'");
    expect(seen).toHaveLength(3);
  });

  it("reports what stopped a command instead of running it half-synced", async () => {
    const blocked = fakeService({ writeFails: true });
    const r = await createSandboxRunner({ service: blocked.service, actor: { userId: "u", orgId: "o" }, sessionId: "s", pending: async () => [{ path: "a.ts", content: "x" }], newKey: () => "k" }).run("pnpm", ["test"]);
    expect(r).toMatchObject({ exitCode: null, stderr: expect.stringContaining("Couldn't copy a.ts") });
    expect(blocked.commands).toEqual([]);

    const limited = fakeService({ runFails: true });
    const s = await createSandboxRunner({ service: limited.service, actor: { userId: "u", orgId: "o" }, sessionId: "s", pending: async () => [], newKey: () => "k" }).run("pnpm", ["test"]);
    expect(s).toMatchObject({ exitCode: null, stderr: "Too many commands." });

    const controller = new AbortController();
    controller.abort();
    const c = await createSandboxRunner({ service: limited.service, actor: { userId: "u", orgId: "o" }, sessionId: "s", pending: async () => [], newKey: () => "k" }).run("pnpm", ["test"], controller.signal);
    expect(c).toMatchObject({ cancelled: true });
  });
});
