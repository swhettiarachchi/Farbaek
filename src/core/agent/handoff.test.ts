import { describe, expect, it } from "vitest";
import { handoffDigest, handoffVerdict, splitCheckCommand, type HandoffReport } from "./handoff";

describe("Continue on my computer (ADR 0139)", () => {
  it("splits a check into a program and its arguments, and refuses what needs a shell", () => {
    expect(splitCheckCommand("npm test")).toEqual({ ok: true, program: "npm", args: ["test"] });
    expect(splitCheckCommand("  pnpm run  build ")).toEqual({ ok: true, program: "pnpm", args: ["run", "build"] });
    expect(splitCheckCommand(`npx vitest run "src/cart test.ts" ''`)).toEqual({ ok: true, program: "npx", args: ["vitest", "run", "src/cart test.ts", ""] });
    expect(splitCheckCommand("npm test && npm run build")).toMatchObject({ ok: false, reason: expect.stringMatching(/needs a shell/) });
    expect(splitCheckCommand("npm test | tee log")).toMatchObject({ ok: false });
    expect(splitCheckCommand("echo $HOME")).toMatchObject({ ok: false });
    expect(splitCheckCommand('npm "test')).toMatchObject({ ok: false, reason: expect.stringMatching(/quote/) });
    expect(splitCheckCommand("./run-tests.sh")).toMatchObject({ ok: false, reason: expect.stringMatching(/program name/) });
    expect(splitCheckCommand("farbaek check-site")).toEqual({ ok: false, reason: "Farbaek's site check runs only in its sandbox." });
    expect(splitCheckCommand("   ")).toMatchObject({ ok: false });
  });

  it("counts only checks that ran, and never a skipped one as a pass", () => {
    expect(handoffVerdict([{ exitCode: 0 }, { exitCode: 0 }])).toEqual({ verdict: "all_passed", passed: 2, ran: 2 });
    expect(handoffVerdict([{ exitCode: 0 }, { exitCode: null }])).toEqual({ verdict: "some_failed", passed: 1, ran: 1 });
    expect(handoffVerdict([{ exitCode: 1 }])).toMatchObject({ verdict: "some_failed" });
    expect(handoffVerdict([{ exitCode: null }])).toMatchObject({ verdict: "none_ran" });
  });

  it("gives a report the same digest however its keys are ordered, and a different one for another handoff", async () => {
    const report: HandoffReport = { checks: [{ command: "npm test", exitCode: 0, durationMs: 1200, timedOut: false, outputSha256: "a".repeat(64), output: "ok", skipped: null }], proposalSha256: "b".repeat(64), notCopied: 0, platform: "windows" };
    const shuffled = { platform: report.platform, notCopied: 0, proposalSha256: report.proposalSha256, checks: report.checks } as HandoffReport;
    expect(await handoffDigest("h1", report)).toBe(await handoffDigest("h1", shuffled));
    expect(await handoffDigest("h2", report)).not.toBe(await handoffDigest("h1", report));
    expect(await handoffDigest("h1", report)).toMatch(/^[0-9a-f]{64}$/);
  });
});
