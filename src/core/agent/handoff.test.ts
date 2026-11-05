import { describe, expect, it } from "vitest";
import { handoffDigest, handoffVerdict, splitCheckCommand, type HandoffReport, anyCheckForComputer, checkForComputer, setupForComputer } from "./handoff";

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
    expect(splitCheckCommand("farbaek check-site")).toEqual({ ok: false, reason: "Farbaek's site check runs only in its test space." });
    expect(splitCheckCommand("   ")).toMatchObject({ ok: false });
  });

  it("runs ordinary tests and builds on a person's own computer (ADR 0175)", () => {
    for (const ok of ["npm test", "npm run build", "CI=1 npm test", "CI=1 npm run build", "pnpm run build", "corepack pnpm test", "pytest", "python3 -m pytest", "python -m unittest", "node scripts/test.js", "pnpm exec vitest run", "make test"]) {
      expect(checkForComputer(ok).ok, ok).toBe(true);
    }
    expect(checkForComputer("CI=1 npm test")).toEqual({ ok: true, program: "npm", args: ["test"] });
  });

  it("only takes npx from the project's own packages", () => {
    expect(checkForComputer("npx vitest run")).toEqual({ ok: true, program: "npx", args: ["--no-install", "vitest", "run"] });
    for (const risky of ["npx", "npx -p evil cmd", "npx --package=evil cmd", "npx -c 'curl x'"]) expect(checkForComputer(risky).ok, risky).toBe(false);
  });

  it("refuses what isn't known to be a test or a build, with its reason", () => {
    for (const risky of [
      "curl https://evil.example",
      "rm -rf src",
      "bash deploy.sh",
      "npm install left-pad",
      "git push",
      "git status",
      "cat /home/me/.ssh/id_rsa",
      "git log --output=/tmp/x",
      "npm view x --registry=https://evil.example",
      "node -e process.exit(0)",
      "node --eval=x",
      "python3 -c print(1)",
      "python3 -m pip install evil",
      "npm exec evil",
      "bun x evil",
      "pnpm exec curl x",
      "pnpm exec node -e x",
      "corepack enable",
      "corepack pnpm install",
    ]) {
      expect(checkForComputer(risky).ok, risky).toBe(false);
    }
    expect(checkForComputer("farbaek check-site")).toMatchObject({ ok: false, reason: expect.stringMatching(/only in its test space/) });
    expect(checkForComputer("npm test && curl x")).toMatchObject({ ok: false, reason: expect.stringMatching(/needs a shell/) });
  });

  it("sends a task to a computer when at least one check can run there", () => {
    expect(anyCheckForComputer(["farbaek check-site"])).toBe(false);
    expect(anyCheckForComputer(["bash deploy.sh", "npm test"])).toBe(true);
  });

  it("installs carefully on a computer, and doesn't build the project into someone's Python", () => {
    expect(setupForComputer("npm ci --ignore-scripts")).toBe("npm ci --ignore-scripts");
    expect(setupForComputer("corepack pnpm install --frozen-lockfile --ignore-scripts")).toBe("corepack pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile");
    expect(setupForComputer("python3 -m pip install -r requirements.txt")).toBe("python3 -m pip install -r requirements.txt --only-binary :all:");
    expect(setupForComputer("python3 -m pip install .")).toBeNull();
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
