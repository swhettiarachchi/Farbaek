import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrokerError, cmdCommandLine, commandEnv, resolveProgram, runCommand } from "./broker";

const win = process.platform === "win32";
let cwd: string;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitGone(pid: number, ms = 5_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !alive(pid);
}

beforeAll(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-broker-"));
});

afterAll(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

describe("command environment", () => {
  it("passes only allowlisted names, so the app's secrets never reach a command", () => {
    const env = commandEnv({ PATH: "/usr/bin", HOME: "/home/a", ANTHROPIC_API_KEY: "sk-ant-x", SUPABASE_SERVICE_ROLE_KEY: "k", GITHUB_TOKEN: "t", NODE_OPTIONS: "--require evil.js" });
    expect(env).toMatchObject({ PATH: "/usr/bin", HOME: "/home/a", CI: "1" });
    for (const name of ["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GITHUB_TOKEN", "NODE_OPTIONS"]) expect(env[name]).toBeUndefined();
  });
});

describe("program lookup", () => {
  it("accepts bare names only", async () => {
    for (const bad of ["../node", "C:\\node.exe", "/usr/bin/node", "node; rm -rf /", "a b", ""]) {
      await expect(resolveProgram(bad, commandEnv(), cwd)).rejects.toMatchObject({ code: "INVALID_PROGRAM" });
    }
    if (win) await expect(resolveProgram("script.ps1", commandEnv(), cwd, "win32")).rejects.toMatchObject({ code: "INVALID_PROGRAM" });
  });

  it("finds node by absolute path and skips PATH entries inside the project or relative ones", async () => {
    const node = await resolveProgram("node", commandEnv(), cwd);
    expect(path.isAbsolute(node)).toBe(true);
    const planted = path.join(cwd, "bin");
    await fs.mkdir(planted, { recursive: true });
    await fs.writeFile(path.join(planted, win ? "farbaek-planted.cmd" : "farbaek-planted"), "echo planted", { mode: 0o755 });
    const sep = win ? ";" : ":";
    await expect(resolveProgram("farbaek-planted", { PATH: `${planted}${sep}bin`, PATHEXT: ".CMD" }, cwd)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cmd.exe shims", () => {
  it("quotes every argument and refuses characters cmd.exe would interpret", () => {
    expect(cmdCommandLine("C:\\Program Files\\nodejs\\npm.cmd", ["run", "a b"])).toBe('/d /v:off /s /c ""C:\\Program Files\\nodejs\\npm.cmd" "run" "a b""');
    for (const bad of ["a&b", "%PATH%", "x|y", 'say "hi"', "a^b", "!x!", "a\nb", "<in"]) {
      expect(() => cmdCommandLine("C:\\n\\npm.cmd", [bad])).toThrow(BrokerError);
    }
  });

  // npm takes a few seconds to start through cmd.exe, and on a busy machine more than vitest's default 5 s.
  // The command allows itself 60 s, so the test allows a little longer and the command's own limit decides.
  it.runIf(win)("runs npm.cmd through cmd.exe and refuses an unsafe argument before starting it", async () => {
    const r = await runCommand({ program: "npm", args: ["--version"], cwd, timeoutMs: 60_000 });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    await expect(runCommand({ program: "npm", args: ["run", "x&calc"], cwd })).rejects.toMatchObject({ code: "UNSAFE_ARGUMENT" });
  }, 70_000);
});

// Each test starts real processes, which a busy machine can slow past vitest's default 5 s.
describe("running commands", { timeout: 20_000 }, () => {
  it("passes arguments as-is, with no shell to interpret them", async () => {
    const r = await runCommand({ program: "node", args: ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", "a b", "&&", "$(whoami)", "; echo hi"], cwd });
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(["a b", "&&", "$(whoami)", "; echo hi"]);
  });

  it("gives the command a scrubbed environment", async () => {
    const r = await runCommand({
      program: "node",
      args: ["-e", "console.log(Object.keys(process.env).join(','))"],
      cwd,
      parentEnv: { ...process.env, ANTHROPIC_API_KEY: "sk-ant-not-a-real-key", FARBAEK_TEST_SECRET: "x" },
    });
    const names = r.stdout.trim().split(",");
    expect(names).toContain("CI");
    expect(names).not.toContain("ANTHROPIC_API_KEY");
    expect(names).not.toContain("FARBAEK_TEST_SECRET");
  });

  it("keeps output within bounds", async () => {
    const r = await runCommand({ program: "node", args: ["-e", "process.stdout.write('x'.repeat(200000))"], cwd, maxOutputChars: 1_000 });
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(1_200);
  });

  // Starts a parent that starts a child, prints the child's pid, then waits forever.
  const tree = ["-e", "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)"];

  it("kills the whole process tree on timeout", async () => {
    const r = await runCommand({ program: "node", args: tree, cwd, timeoutMs: 1_500 });
    expect(r.timedOut).toBe(true);
    const child = Number(r.stdout.trim());
    expect(child).toBeGreaterThan(0);
    expect(await waitGone(child)).toBe(true);
  }, 20_000);

  it("kills the whole process tree on cancel", async () => {
    const controller = new AbortController();
    const running = runCommand({ program: "node", args: tree, cwd, timeoutMs: 60_000, signal: controller.signal });
    setTimeout(() => controller.abort(), 1_500);
    const r = await running;
    expect(r.cancelled).toBe(true);
    expect(r.timedOut).toBe(false);
    const child = Number(r.stdout.trim());
    expect(child).toBeGreaterThan(0);
    expect(await waitGone(child)).toBe(true);
  }, 20_000);
});
