import { describe, expect, it } from "vitest";
import type { IntentContract } from "./contract";
import { INTENT_CONTRACT_SCHEMA } from "./contract";
import { assemblePassport, passportBrief, scriptOf, type PassportFile, type PassportInput } from "./context-passport";

const NOW = new Date("2026-10-30T12:00:00Z");
const file = (path: string, updatedAt = "2026-10-29T10:00:00Z", encoding?: "base64"): PassportFile => ({ path, sha256: "a".repeat(64), revision: 1, updatedAt, ...(encoding ? { encoding } : {}) });

function contract(over: Partial<IntentContract> = {}): IntentContract {
  return {
    schema: INTENT_CONTRACT_SCHEMA,
    version: 1,
    outcome: "Add a pricing section.",
    scope: { organizationId: "org", projectId: "p", resources: ["src/components", "README.md"] },
    allowedOperations: ["files.edit"],
    forbiddenOperations: ["files.delete"],
    protectedFields: [],
    protectedInvariants: [],
    assumptions: [],
    openQuestions: [],
    acceptanceCriteria: [{ id: "a1", statement: "It renders.", verification: "test" }],
    approvals: [],
    limits: {},
    requiredChecks: ["npm test"],
    recovery: "Revert the files.",
    ...over,
  };
}

function input(over: Partial<PassportInput> & { contents?: Record<string, string> } = {}): PassportInput {
  const contents = over.contents ?? { "package.json": JSON.stringify({ scripts: { build: "next build", test: "vitest run" } }) };
  return {
    taskId: "t",
    projectId: "p",
    goal: "Add a pricing section",
    now: NOW,
    files: over.files ?? [file("package.json"), file("package-lock.json"), file("src/components/hero.tsx"), file("README.md")],
    read: (p) => contents[p] ?? null,
    plan: over.plan === undefined ? { version: 2, sha256: "b".repeat(64), approved: true, approvedAt: "2026-10-30T09:00:00Z", contract: contract() } : over.plan,
    lastChecks: over.lastChecks ?? null,
  };
}

const status = (p: ReturnType<typeof assemblePassport>, id: string) => p.facts.find((f) => f.id === id)?.status;

describe("Context Readiness (spec §8, ADR 0116)", () => {
  it("is ready when the plan is approved, its checks exist and nothing changed since", () => {
    const p = assemblePassport(input());
    expect(p.readiness).toBe("ready");
    expect(status(p, "stack.runtime")).toBe("verified_current");
    expect(status(p, "check.test")).toBe("verified_current");
    expect(p.plan).toEqual({ version: 2, sha256: "b".repeat(64), approved: true });
    // References only: no file contents travel with the passport.
    expect(JSON.stringify(p)).not.toContain("vitest run");
  });

  it("flags a check whose script doesn't exist, and says how to fix it", () => {
    const p = assemblePassport(input({ plan: { version: 1, sha256: "c".repeat(64), approved: true, approvedAt: "2026-10-30T09:00:00Z", contract: contract({ requiredChecks: ["npm run lint", "farbaek check-site"] }) } }));
    expect(status(p, "check.lint")).toBe("missing");
    expect(p.nextSteps).toContain('Add a "lint" script to package.json, or change the check "npm run lint".');
    expect(p.readiness).toBe("ready_with_warnings");
  });

  it("marks files changed after the plan was approved, and after the last checks, as possibly stale", () => {
    const p = assemblePassport(
      input({
        files: [file("package.json"), file("package-lock.json"), file("src/components/hero.tsx", "2026-10-30T11:00:00Z")],
        lastChecks: { result: "verified", finishedAt: "2026-10-30T10:00:00Z" },
      }),
    );
    expect(status(p, "plan.stale")).toBe("possibly_stale");
    expect(status(p, "checks.stale")).toBe("possibly_stale");
    expect(p.facts.find((f) => f.id === "plan.stale")!.statement).toContain("src/components/hero.tsx");
  });

  it("keeps contradictions as contradictions, never picking a side", () => {
    const p = assemblePassport(
      input({
        files: [file("package.json"), file("package-lock.json"), file("README.md"), file("next.config.mjs"), file("vite.config.ts")],
        contents: { "package.json": JSON.stringify({ scripts: { build: "next build", test: "vitest" } }), "README.md": "Run `npm run dev` then `npm install`." },
      }),
    );
    expect(status(p, "stack.frameworks")).toBe("conflicting");
    expect(status(p, "readme.commands")).toBe("conflicting");
    expect(p.conflicts).toHaveLength(2);
    expect(p.conflicts[1]).toContain('"dev"');
    expect(p.conflicts[1]).not.toContain('"install"');
  });

  it("isn't ready without a plan, or when the plan names files that don't exist and can't be created", () => {
    expect(assemblePassport(input({ plan: null })).readiness).toBe("not_ready");
    const p = assemblePassport(input({ plan: { version: 1, sha256: "d".repeat(64), approved: false, approvedAt: null, contract: contract({ scope: { organizationId: "o", projectId: "p", resources: ["src/pages"] } }) } }));
    expect(status(p, "plan.scope.absent")).toBe("missing");
    expect(status(p, "plan.draft")).toBe("inferred");
    expect(p.readiness).toBe("not_ready");
    // Allowed to create files, the same scope is only inferred.
    const creating = assemblePassport(input({ plan: { version: 1, sha256: "d".repeat(64), approved: true, approvedAt: null, contract: contract({ allowedOperations: ["files.create"], scope: { organizationId: "o", projectId: "p", resources: ["src/pages"] } }) } }));
    expect(status(creating, "plan.scope.absent")).toBe("inferred");
    expect(creating.readiness).toBe("ready_with_warnings");
  });

  it("names environment variables but never their values, and says images can't be read", () => {
    const p = assemblePassport(
      input({
        files: [file("package.json"), file("package-lock.json"), file(".env.example"), file("public/logo.png", undefined, "base64")],
        contents: { "package.json": JSON.stringify({ scripts: { test: "vitest" } }), ".env.example": "DATABASE_URL=postgres://user:secret@host/db\nexport API_KEY=\n" },
      }),
    );
    const env = p.facts.find((f) => f.id === "env.names")!;
    expect(env.status).toBe("unavailable");
    expect(env.statement).toContain("DATABASE_URL");
    expect(JSON.stringify(p)).not.toContain("secret@host");
    expect(status(p, "files.images")).toBe("unavailable");
  });

  it("knows a static site has nothing to build, and an empty project has nothing yet", () => {
    expect(status(assemblePassport(input({ files: [file("index.html")], contents: {}, plan: { version: 1, sha256: "e".repeat(64), approved: true, approvedAt: null, contract: contract({ requiredChecks: ["farbaek check-site"], scope: { organizationId: "o", projectId: "p", resources: ["index.html"] } }) } })), "stack.static")).toBe("verified_current");
    expect(status(assemblePassport(input({ files: [], contents: {} })), "project.empty")).toBe("missing");
  });

  it("lists the plan's open questions as inferred, and puts the worst news first", () => {
    const p = assemblePassport(input({ plan: { version: 3, sha256: "f".repeat(64), approved: false, approvedAt: null, contract: contract({ openQuestions: ["Which currency?"], requiredChecks: ["npm run e2e"] }) } }));
    expect(p.openQuestions).toEqual(["Which currency?"]);
    expect(p.facts[0]!.status).toBe("missing");
    expect(passportBrief(p).some((f) => f.statement === "Which currency?" && f.status === "inferred")).toBe(true);
  });

  it("reads the script a check runs", () => {
    expect(scriptOf("npm test")).toBe("test");
    expect(scriptOf("npm run build")).toBe("build");
    expect(scriptOf("pnpm lint")).toBe("lint");
    expect(scriptOf("npm ci")).toBeNull();
    expect(scriptOf("farbaek check-site")).toBeNull();
  });
});
