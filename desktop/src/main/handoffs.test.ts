import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentHandoffDetail } from "@/agent-runtime/farbaek-client";
import type { CommandOutcome, CommandRunner } from "@/agent-runtime/runners";
import { HandoffManager, type HandoffApi, type HandoffRun } from "./handoffs";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-handoffs-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const DETAIL: AgentHandoffDetail = {
  id: "h1",
  taskId: "t1",
  taskTitle: "Fix the cart",
  projectId: "p1",
  projectName: "Shop",
  note: null,
  checks: ["npm test", "npm test && npm run build"],
  proposal: { id: "pr1", sha256: "b".repeat(64) },
  status: "waiting",
  createdAt: "2026-10-30T10:00:00.000Z",
  expiresAt: "2026-10-31T10:00:00.000Z",
  change: { summary: "Totals are whole numbers.", steps: [], risks: [], files: [{ path: "src/cart.ts", kind: "edit", content: "export const total = 2;\n" }] },
};

/** A labelled fake of Farbaek's agent API: it records what the computer reported. */
function fakeApi(detail: AgentHandoffDetail = DETAIL) {
  const calls: string[] = [];
  const reports: Parameters<HandoffApi["finishHandoff"]>[1][] = [];
  const api: HandoffApi = {
    handoffs: async () => [detail],
    handoff: async () => detail,
    openHandoff: async (id) => void calls.push(`open:${id}`),
    snapshot: async () => [
      { path: "package.json", revision: 1, sha256: "e".repeat(64), content: '{"scripts":{"test":"node t.js"}}' },
      { path: "package-lock.json", revision: 1, sha256: "e".repeat(64), content: "{}" },
      { path: "src/cart.ts", revision: 1, sha256: "e".repeat(64), content: "export const total = 1.5;\n" },
    ],
    finishHandoff: async (_id, body) => (reports.push(body), { digest: body.status === "done" ? "d".repeat(64) : null }),
  };
  return { api, calls, reports };
}

/** A scripted runner: records each program and arguments, and what the copy held when it ran. */
function scripted(exit: (program: string, args: readonly string[]) => number) {
  const ran: string[] = [];
  const make = (root: string): CommandRunner => ({
    where: "local",
    async run(program, args): Promise<CommandOutcome> {
      ran.push(`${program} ${args.join(" ")} | cart: ${(await fs.readFile(path.join(root, "src", "cart.ts"), "utf8")).trim()}`);
      return { exitCode: exit(program, args), stdout: `ran ${program}`, stderr: "", truncated: false, timedOut: false, cancelled: false, leftRunning: false, durationMs: 1500 };
    },
  });
  return { make, ran };
}

describe("Continue on my computer (ADR 0139)", () => {
  it("runs the checks on a copy with the change written in, after installing without scripts, then reports and removes the copy", async () => {
    const f = fakeApi();
    const runner = scripted(() => 0);
    const m = new HandoffManager({ dataDir: dir, platform: "windows", emit: () => undefined, makeRunner: runner.make });
    const run: HandoffRun = { id: "h1", state: "running", step: null, checks: [], message: null, digest: null };
    await m.execute(f.api, run);
    expect(f.calls).toEqual(["open:h1"]);
    expect(runner.ran).toEqual(["npm ci --ignore-scripts | cart: export const total = 2;", "npm test | cart: export const total = 2;"]);
    expect(f.reports).toEqual([
      {
        status: "done",
        report: {
          checks: [
            { command: "npm test", exitCode: 0, durationMs: 1500, timedOut: false, outputSha256: expect.stringMatching(/^[0-9a-f]{64}$/), output: "ran npm", skipped: null },
            { command: "npm test && npm run build", exitCode: null, durationMs: null, timedOut: false, outputSha256: null, output: "", skipped: expect.stringMatching(/needs a shell/) },
          ],
          proposalSha256: "b".repeat(64),
          notCopied: 0,
          platform: "windows",
        },
      },
    ]);
    expect(run).toMatchObject({ state: "reported", digest: "d".repeat(64), message: expect.stringMatching(/1 of 2 checks passed/) });
    await expect(fs.access(path.join(dir, "handoffs", "h1"))).rejects.toThrow();
  });

  it("tells Farbaek it couldn't run when installing fails, and runs no check", async () => {
    const f = fakeApi();
    const runner = scripted((program, args) => (args[0] === "ci" ? 1 : 0));
    const m = new HandoffManager({ dataDir: dir, platform: "linux", emit: () => undefined, makeRunner: runner.make });
    const run: HandoffRun = { id: "h1", state: "running", step: null, checks: [], message: null, digest: null };
    await m.execute(f.api, run);
    expect(runner.ran).toHaveLength(1);
    expect(f.reports).toEqual([{ status: "failed", reason: "Install packages with npm failed (exit 1), so the checks didn't run." }]);
    expect(run).toMatchObject({ state: "failed", message: expect.stringMatching(/Farbaek was told/) });
  });

  it("refuses to start the same handoff twice at once", async () => {
    const f = fakeApi();
    const m = new HandoffManager({ dataDir: dir, platform: "macos", emit: () => undefined, makeRunner: scripted(() => 0).make });
    m.start(f.api, "h1");
    expect(() => m.start(f.api, "h1")).toThrow(/already running/);
    for (let i = 0; i < 100 && m.all()[0]!.state === "running"; i += 1) await new Promise((r) => setTimeout(r, 20));
    expect(m.all()[0]!.state).toBe("reported");
  });
});
