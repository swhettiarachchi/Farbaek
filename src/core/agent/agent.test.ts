import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "../realityloop/contract";
import { classifyCommand, displayCommand, programName, withSafeDefaults } from "./commands";
import { modeAvailability } from "./modes";
import { nextRunState, stateAfterRestart } from "./operations";
import { agentPolicyVersion, decide, type PermissionContext } from "./permissions";
import { setupReport } from "./setup-report";
import { parseToolCall, toolDefinitions, type ToolCall } from "./tools";

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "README explains the tests.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["README.md", "docs"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "README names pnpm test.", verification: "read_back" }],
  approvals: [],
  limits: {},
  requiredChecks: ["grep -q 'pnpm test' README.md"],
  recovery: "Restore README.md.",
};

const existing = new Set(["README.md", "docs/guide.md", "src/app.ts"]);
const ctx = (over: Partial<PermissionContext> = {}): PermissionContext => ({ mode: "controlled", contract, sandboxVerified: false, exists: (p) => existing.has(p), ...over });
const call = (name: string, input: unknown): ToolCall => {
  const r = parseToolCall(name, input);
  if (!r.ok) throw new Error(r.error);
  return r.call;
};

describe("tool registry", () => {
  it("validates tool calls and refuses unknown tools and bad input", () => {
    expect(parseToolCall("read_file", { path: "README.md" })).toMatchObject({ ok: true });
    expect(parseToolCall("delete_everything", {})).toEqual({ ok: false, error: "There's no tool named delete_everything." });
    expect(parseToolCall("run_command", { program: "pnpm", args: "test" })).toMatchObject({ ok: false });
  });

  it("gives the model JSON Schemas without the draft marker", () => {
    const defs = toolDefinitions(["read_file"]);
    expect(defs[0]).toMatchObject({ name: "read_file", inputSchema: { type: "object", required: ["path"] } });
    expect(defs[0]!.inputSchema.$schema).toBeUndefined();
  });
});

describe("permission engine", () => {
  it("lets every mode read", () => {
    for (const mode of ["review_only", "controlled", "sandboxed_autopilot"] as const) {
      expect(decide(call("read_file", { path: "src/app.ts" }), ctx({ mode })).kind).toBe("allow");
    }
  });

  it("keeps writes inside the contract's paths and operations, without secrets", () => {
    expect(decide(call("edit_file", { path: "README.md", edits: [{ find: "a", replace: "b" }], reason: "r" }), ctx()).kind).toBe("allow");
    expect(decide(call("write_file", { path: "src/app.ts", content: "x", reason: "r" }), ctx())).toMatchObject({ kind: "deny", reason: expect.stringMatching(/outside the plan's paths/) });
    expect(decide(call("write_file", { path: "docs/new.md", content: "x", reason: "r" }), ctx())).toMatchObject({ kind: "deny", reason: expect.stringMatching(/doesn't include files.create/) });
    expect(decide(call("write_file", { path: "README.md", content: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----", reason: "r" }), ctx())).toMatchObject({
      kind: "deny",
      reason: expect.stringMatching(/secret/),
    });
    expect(decide(call("write_file", { path: ".env", content: "A=1", reason: "r" }), ctx({ contract: { ...contract, scope: { ...contract.scope, resources: ["."] } } })).kind).toBe("deny");
    expect(decide(call("write_file", { path: "README.md", content: "x", reason: "r" }), ctx({ contract: null }))).toMatchObject({ kind: "deny" });
  });

  it("runs no command in Review Only, read-only ones in Controlled, and asks for everything else", () => {
    const status = call("run_command", { program: "git", args: ["status"], reason: "r" });
    const test = call("run_command", { program: "pnpm", args: ["test"], reason: "r" });
    const install = call("run_command", { program: "pnpm", args: ["add", "left-pad"], reason: "r" });
    expect(decide(status, ctx({ mode: "review_only" })).kind).toBe("deny");
    expect(decide(status, ctx())).toEqual({ kind: "allow", risk: "read_only" });
    expect(decide(test, ctx())).toMatchObject({ kind: "needs_approval", risk: "test_build", reason: expect.stringMatching(/isn't isolated/) });
    expect(decide(install, ctx())).toMatchObject({ kind: "needs_approval", risk: "install" });
  });

  it("lets Sandboxed Autopilot run tests on its own only with a verified sandbox", () => {
    const test = call("run_command", { program: "pnpm", args: ["test"], reason: "r" });
    expect(decide(test, ctx({ mode: "sandboxed_autopilot", sandboxVerified: false })).kind).toBe("deny");
    expect(decide(test, ctx({ mode: "sandboxed_autopilot", sandboxVerified: true })).kind).toBe("allow");
    expect(decide(call("run_command", { program: "curl", args: ["https://example.com"], reason: "r" }), ctx({ mode: "sandboxed_autopilot", sandboxVerified: true })).kind).toBe("needs_approval");
    expect(modeAvailability("sandboxed_autopilot", { sandboxVerified: false })).toMatchObject({ available: false });
  });

  it("points the agent to review_site instead of asking a person about farbaek check-site", () => {
    const siteCheck = call("run_command", { program: "farbaek", args: ["check-site"], reason: "Run the contract's required check" });
    for (const mode of ["controlled", "sandboxed_autopilot"] as const) {
      const d = decide(siteCheck, ctx({ mode, sandboxVerified: true }));
      expect(d.kind).toBe("deny");
      if (d.kind === "deny") expect(d.reason).toMatch(/review_site/);
    }
  });

  it("has a stable policy version", async () => {
    expect(await agentPolicyVersion()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("command risk", () => {
  it("classifies by program and arguments, cautiously", () => {
    expect(programName("C:\\nodejs\\NPM.CMD")).toBe("npm");
    expect(classifyCommand("git", ["diff"])).toBe("read_only");
    expect(classifyCommand("git", ["push"])).toBe("network");
    expect(classifyCommand("git", ["reset", "--hard"])).toBe("destructive");
    expect(classifyCommand("rm", ["-rf", "."])).toBe("destructive");
    expect(classifyCommand("npm", ["ci"])).toBe("install");
    expect(classifyCommand("npx", ["something"])).toBe("install");
    expect(classifyCommand("pnpm", ["test"])).toBe("test_build");
    expect(classifyCommand("node", ["--version"])).toBe("read_only");
    expect(classifyCommand("powershell", ["-c", "anything"])).toBe("unknown");
  });

  it("skips install scripts by default and shows commands readably", () => {
    expect(withSafeDefaults("pnpm", ["install"])).toEqual(["install", "--ignore-scripts"]);
    expect(withSafeDefaults("pnpm", ["test"])).toEqual(["test"]);
    expect(displayCommand("pnpm", ["test", "a b"])).toBe('pnpm test "a b"');
  });
});

describe("run lifecycle", () => {
  it("only moves through allowed transitions, and never resumes silently after a restart", () => {
    expect(nextRunState("planned", "approve")).toBe("approved");
    expect(nextRunState("running", "complete")).toBe("completed");
    expect(nextRunState("completed", "start")).toBeNull();
    expect(stateAfterRestart("running")).toBe("interrupted");
    expect(stateAfterRestart("completed")).toBe("completed");
    expect(nextRunState("interrupted", "start")).toBeNull();
    expect(nextRunState("interrupted", "restart")).toBe("approved");
  });
});

describe("setup report", () => {
  it("reads manifests without running anything, and lists env names but never values", () => {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ engines: { node: ">=24" }, packageManager: "pnpm@12.11.2", scripts: { test: "vitest run", postinstall: "node evil.js" } }),
      ".env.example": "SUPABASE_URL=\nexport ANTHROPIC_API_KEY=\n# comment\n",
    };
    const r = setupReport(["package.json", "pnpm-lock.yaml", ".env.example", ".env.local", "Dockerfile"], (p) => files[p] ?? null);
    expect(r.runtimes).toEqual(["Node.js >=24", "Docker"]);
    expect(r.packageManager).toBe("pnpm@12.11.2");
    expect(r.lockfile).toBe("pnpm-lock.yaml");
    expect(r.envVarNames).toEqual(["SUPABASE_URL", "ANTHROPIC_API_KEY"]);
    expect(r.risks.join(" ")).toMatch(/postinstall/);
    expect(r.risks.join(" ")).toMatch(/\.env file/);
    expect(setupReport([], () => null).missing.length).toBe(1);
  });
});
