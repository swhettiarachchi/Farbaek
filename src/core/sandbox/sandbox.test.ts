import { describe, expect, it } from "vitest";
import { SANDBOX_PLAN_LIMITS, SANDBOX_TRIAL_LIMITS, sandboxLimitsFor } from "@/config/sandbox";
import { BoundedOutput, checkCommand, stripAnsi, wrapCommand } from "./commands";
import { classifyExit } from "./failures";
import { blockReason, evaluateSandboxAction, looksLikeInstall, sandboxPolicyVersion, type SandboxGuardInput } from "./guard";
import { ACTIVE_SESSION_STATES, allowedSessionPairs, nextSessionState, SESSION_EVENTS, SESSION_STATES, TERMINAL_SESSION_STATES } from "./lifecycle";
import { ALL_TRAFFIC, egressAllows, egressRules, isDeniedAddress, validPreviewPort } from "./network";
import { resolveSandboxPath, toWorkspaceRelative, SANDBOX_WORKSPACE_ROOT } from "./paths";
import {
  forwardableCookies,
  newPreviewId,
  previewDomainHost,
  previewIdFromHost,
  rewriteLocation,
  signPreviewToken,
  verifyPreviewToken,
  PREVIEW_COOKIE,
} from "./preview";
import { buildSandboxReceipt, sandboxReceiptDigest, snapshotDigest, type ReceiptInput } from "./receipts";
import { commandTimeoutSeconds, included, sessionSpec } from "./request";
import { SANDBOX_SIZES, defaultImageName, sizeOnRuntime, suggestTemplate } from "./templates";
import { runningSeconds, sessionUsage, wholeMinutes } from "./usage";

describe("session lifecycle", () => {
  it("moves only along the table", () => {
    expect(nextSessionState("requested", "provision")).toBe("provisioning");
    expect(nextSessionState("provisioning", "provisioned")).toBe("ready");
    expect(nextSessionState("ready", "pause")).toBe("paused");
    expect(nextSessionState("paused", "resume")).toBe("ready");
    expect(nextSessionState("ready", "stop")).toBe("stopping");
    expect(nextSessionState("stopping", "finish_termination")).toBe("terminated");
    expect(nextSessionState("ready", "expire")).toBe("stopping");
    expect(nextSessionState("stopping", "finish_expiry")).toBe("expired");
    // Not allowed: skipping provisioning, resuming a running session, leaving a terminal state.
    expect(nextSessionState("requested", "provisioned")).toBeNull();
    expect(nextSessionState("ready", "resume")).toBeNull();
    expect(nextSessionState("ready", "finish_termination")).toBeNull();
  });

  it("never leaves a terminal state", () => {
    for (const state of TERMINAL_SESSION_STATES) {
      for (const event of SESSION_EVENTS) expect(nextSessionState(state, event)).toBeNull();
    }
    expect(ACTIVE_SESSION_STATES.some((s) => TERMINAL_SESSION_STATES.has(s))).toBe(false);
    expect(SESSION_STATES.length).toBe(ACTIVE_SESSION_STATES.length + TERMINAL_SESSION_STATES.size);
  });

  it("lists every allowed pair once", () => {
    const pairs = allowedSessionPairs().map(([a, b]) => `${a}>${b}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs).toContain("stopping>expired");
    expect(pairs).not.toContain("terminated>ready");
  });
});

describe("sandbox paths", () => {
  it("accepts clean relative paths", () => {
    expect(resolveSandboxPath("src/index.ts")).toEqual({ ok: true, relative: "src/index.ts", absolute: `${SANDBOX_WORKSPACE_ROOT}/src/index.ts` });
    expect(resolveSandboxPath("./src//a.ts")).toMatchObject({ ok: true, relative: "src/a.ts" });
    expect(resolveSandboxPath("")).toMatchObject({ ok: true, relative: "" });
  });

  it.each([
    ["../etc/passwd"],
    ["src/../../etc/passwd"],
    ["/etc/passwd"],
    ["~/.ssh/id_rsa"],
    ["src\\..\\x"],
    ["a\u0000b"],
    ["a\nb"],
    ["x".repeat(600)],
  ])("refuses %j", (p) => {
    expect(resolveSandboxPath(p).ok).toBe(false);
  });

  it("refuses non-text and maps runtime paths back only inside the root", () => {
    expect(resolveSandboxPath(42).ok).toBe(false);
    expect(toWorkspaceRelative(`${SANDBOX_WORKSPACE_ROOT}/src/a.ts`)).toBe("src/a.ts");
    expect(toWorkspaceRelative("/home/user/projectx/a")).toBeNull();
    expect(toWorkspaceRelative("/etc/passwd")).toBeNull();
  });
});

describe("network policy", () => {
  it("denies everything by default", () => {
    const none = egressRules("none");
    expect(none.denyOut).toEqual([ALL_TRAFFIC]);
    expect(none.allowOut).toEqual([]);
    expect(egressAllows(none, { host: "registry.npmjs.org" })).toBe(false);
    expect(egressAllows(none, { ip: "1.1.1.1" })).toBe(false);
  });

  it("allows only the registries, and never internal or metadata addresses", () => {
    const reg = egressRules("package_registries");
    expect(egressAllows(reg, { host: "registry.npmjs.org" })).toBe(true);
    expect(egressAllows(reg, { host: "pypi.org" })).toBe(true);
    // next/font/google downloads fonts while an app builds (ADR 0058).
    expect(egressAllows(reg, { host: "fonts.gstatic.com" })).toBe(true);
    expect(egressAllows(reg, { host: "github.com" })).toBe(false);
    expect(egressAllows(reg, { host: "www.googleapis.com" })).toBe(false);
    expect(egressAllows(reg, { host: "evil.registry.npmjs.org.attacker.test" })).toBe(false);
    expect(egressAllows(reg, { ip: "169.254.169.254" })).toBe(false);
    expect(egressAllows(reg, { ip: "10.0.0.5" })).toBe(false);
    expect(egressAllows(reg, { ip: "127.0.0.1" })).toBe(false);
    // Allow rules win in the runtime, so no private range or IP may ever be in allowOut.
    expect(reg.allowOut.every((a) => !/^\d/.test(a))).toBe(true);
    expect(reg.denyOut).toContain("169.254.0.0/16");
  });

  it("knows the ranges that are always denied", () => {
    for (const ip of ["169.254.169.254", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "100.64.0.1", "0.0.0.0", "not-an-ip"]) {
      expect(isDeniedAddress(ip)).toBe(true);
    }
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1"]) expect(isDeniedAddress(ip)).toBe(false);
  });

  it("only forwards previews to app ports", () => {
    expect(validPreviewPort(3000)).toBe(true);
    expect(validPreviewPort(8080)).toBe(true);
    for (const p of [22, 80, 1023, 49983, 49999, 65536, 3000.5, "3000", -1]) expect(validPreviewPort(p)).toBe(false);
  });
});

describe("commands", () => {
  it("checks shape, not content", () => {
    expect(checkCommand("  npm test ")).toEqual({ ok: true, command: "npm test" });
    expect(checkCommand("").ok).toBe(false);
    expect(checkCommand("x".repeat(4001)).ok).toBe(false);
    expect(checkCommand("echo a\u0000b").ok).toBe(false);
    expect(checkCommand(null).ok).toBe(false);
  });

  it("wraps commands with limits and the project folder", () => {
    const wrapped = wrapCommand("npm test");
    expect(wrapped).toContain("ulimit -u 512");
    expect(wrapped).toContain(`cd ${SANDBOX_WORKSPACE_ROOT}`);
    expect(wrapped.trim().endsWith("npm test")).toBe(true);
  });

  it("keeps the start and end of long output", () => {
    const out = new BoundedOutput(100);
    out.push("a".repeat(30));
    out.push("b".repeat(200));
    out.push("c".repeat(30));
    expect(out.truncated).toBe(true);
    expect(out.size).toBe(260);
    const text = out.text();
    expect(text.startsWith("a".repeat(30))).toBe(true);
    expect(text.endsWith("c".repeat(30))).toBe(true);
    expect(text).toContain("characters omitted");
    const short = new BoundedOutput(100);
    short.push("hello\n");
    expect(short.text()).toBe("hello\n");
    expect(short.truncated).toBe(false);
  });

  it("strips terminal escapes", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m done")).toBe("red done");
  });
});

describe("failure categories", () => {
  it("come from facts", () => {
    expect(classifyExit({ exitCode: 0, timedOut: false, cancelled: false })).toBeNull();
    expect(classifyExit({ exitCode: 1, timedOut: false, cancelled: false })).toBe("command_failed");
    expect(classifyExit({ exitCode: 137, timedOut: false, cancelled: false })).toBe("resource_limit");
    expect(classifyExit({ exitCode: null, timedOut: true, cancelled: false })).toBe("timeout");
    expect(classifyExit({ exitCode: 137, timedOut: false, cancelled: true })).toBe("cancelled");
    expect(classifyExit({ exitCode: null, timedOut: false, cancelled: false })).toBe("control_plane_interrupted");
  });
});

describe("session requests", () => {
  const free = SANDBOX_PLAN_LIMITS.free;
  const base = { name: "Try it", template: "node-ts", size: "small", network: "none", minutes: 20, projectId: null, taskId: null };

  it("builds the spec from catalog values only", () => {
    const r = sessionSpec({ ...base, vcpu: 64, memoryMiB: 999999 }, free);
    expect(r).toMatchObject({ ok: true, spec: { vcpu: 1, memoryMiB: 1024, ttlSeconds: 1200, idleSeconds: free.idleMinutes * 60 } });
  });

  it("refuses sizes, durations and unknown ids beyond the plan", () => {
    expect(sessionSpec({ ...base, size: "standard" }, free)).toMatchObject({ ok: false, field: "size" });
    expect(sessionSpec({ ...base, minutes: 600 }, free)).toMatchObject({ ok: false, field: "minutes" });
    expect(sessionSpec({ ...base, size: "huge" }, free)).toMatchObject({ ok: false, field: "size" });
    expect(sessionSpec({ ...base, template: "rust" }, free)).toMatchObject({ ok: false, field: "template" });
    expect(sessionSpec({ ...base, minutes: 1 }, free)).toMatchObject({ ok: false, field: "minutes" });
    expect(sessionSpec({ ...base, projectId: "not-a-uuid" }, free)).toMatchObject({ ok: false, field: "projectId" });
    expect(sessionSpec({ ...base, include: ["../secrets"] }, free)).toMatchObject({ ok: false, field: "include" });
  });

  it("clamps command timeouts and filters includes", () => {
    expect(commandTimeoutSeconds(99999, 300)).toBe(300);
    expect(commandTimeoutSeconds("x", 300)).toBe(120);
    expect(commandTimeoutSeconds(0, 300)).toBe(1);
    expect(included("src/a.ts", ["src"])).toBe(true);
    expect(included("srcx/a.ts", ["src"])).toBe(false);
    expect(included("anything", [])).toBe(true);
  });

  it("picks limits by plan, with trial totals", () => {
    expect(sandboxLimitsFor(null)).toBe(SANDBOX_PLAN_LIMITS.free);
    expect(sandboxLimitsFor({ planId: "pro", source: "trial" })).toBe(SANDBOX_TRIAL_LIMITS);
    expect(sandboxLimitsFor({ planId: "enterprise", source: "paid" })).toBe(SANDBOX_PLAN_LIMITS.max_3x);
  });

  it("suggests a template from project files", () => {
    expect(suggestTemplate(["README.md", "web/package.json"])).toBe("node-ts");
    expect(suggestTemplate(["requirements.txt"])).toBe("python");
    expect(suggestTemplate(["README.md"])).toBeNull();
  });
});

describe("Guard for sandboxes", () => {
  const sandboxed = { mode: "sandboxed" as const, provider: "E2B" };
  const input = (over: Partial<SandboxGuardInput>): SandboxGuardInput => ({
    action: "command.run",
    execution: sandboxed,
    role: "member",
    isSessionOwner: true,
    sessionState: "ready",
    network: "none",
    ...over,
  });

  it("allows owners of the session to run code within limits", async () => {
    const d = await evaluateSandboxAction(input({}));
    expect(d.outcome).toBe("ALLOW_WITHIN_LIMITS");
    expect(d.policyVersion).toBe(await sandboxPolicyVersion());
    expect(d.policyVersion).toMatch(/^[0-9a-f]{64}$/);
  });

  it("blocks everything that would run code when isolation isn't verified", async () => {
    const d = await evaluateSandboxAction(input({ execution: { mode: "review_only", reason: "No isolated sandbox is connected." } }));
    expect(d.outcome).toBe("BLOCK");
    expect(blockReason(d)).toBe("No isolated sandbox is connected.");
    // Stopping and reading stay possible, so nothing gets stuck.
    expect((await evaluateSandboxAction(input({ action: "session.stop", execution: { mode: "review_only", reason: "x" } }))).outcome).not.toBe("BLOCK");
  });

  it("blocks viewers, non-members, other people's sessions and stopped sessions", async () => {
    expect((await evaluateSandboxAction(input({ role: "viewer" }))).outcome).toBe("BLOCK");
    expect((await evaluateSandboxAction(input({ role: null }))).outcome).toBe("BLOCK");
    expect((await evaluateSandboxAction(input({ isSessionOwner: false }))).outcome).toBe("BLOCK");
    expect((await evaluateSandboxAction(input({ isSessionOwner: false, role: "admin" }))).outcome).toBe("ALLOW_WITHIN_LIMITS");
    expect((await evaluateSandboxAction(input({ sessionState: "paused" }))).outcome).toBe("BLOCK");
    expect((await evaluateSandboxAction(input({ action: "preview.open", sessionState: "terminated" }))).outcome).toBe("BLOCK");
  });

  it("notes installs that can't work without network", async () => {
    expect(looksLikeInstall("cd web && npm install")).toBe(true);
    expect(looksLikeInstall("pip install -r requirements.txt")).toBe(true);
    expect(looksLikeInstall("npm test")).toBe(false);
    const d = await evaluateSandboxAction(input({ command: "npm ci" }));
    expect(d.outcome).toBe("ALLOW_WITHIN_LIMITS");
    expect(d.findings.map((f) => f.rule)).toContain("install_without_network");
  });
});

describe("sandbox receipts", () => {
  const base: ReceiptInput = {
    session: { id: "s1", organizationId: "o1", projectId: "p1", taskId: "t1" },
    runtime: { provider: "E2B", isolation: "microvm", template: "node-ts", image: "farbaek-node-small", vcpu: 1, memoryMiB: 1024, egress: egressRules("none") },
    policy: { version: "a".repeat(64), outcome: "ALLOW_WITHIN_LIMITS" },
    snapshot: { sha256: "b".repeat(64), files: 3 },
    checks: [
      { name: "typecheck", command: "pnpm typecheck", exitCode: 0, durationMs: 1200, failure: null, stdoutSha256: null, stderrSha256: null },
      { name: "test", command: "pnpm test", exitCode: 0, durationMs: 3400, failure: null, stdoutSha256: null, stderrSha256: null },
    ],
    proofPackDigest: "c".repeat(64),
    createdAt: "2026-10-17T10:00:00.000Z",
  };

  it("verifies only on real passing exit codes, and never authorizes deployment", () => {
    const r = buildSandboxReceipt(base);
    expect(r.predicate.status).toBe("verified");
    expect(r.predicate.verdict.taskEvent).toBe("mark_verified");
    expect(r.predicate.deployment.authorized).toBe(false);
    expect(r.subject[0]).toEqual({ name: "project-snapshot", digest: { sha256: "b".repeat(64) } });
  });

  it("treats checks that didn't finish as not run", () => {
    const r = buildSandboxReceipt({ ...base, checks: [{ ...base.checks[0]!, exitCode: null, failure: "timeout" }, base.checks[1]!] });
    expect(r.predicate.status).toBe("partially_verified");
    expect(r.predicate.checks[0]!.status).toBe("not_run");
    expect(r.predicate.verdict.taskEvent).toBe("mark_partially_verified");
    const allFailed = buildSandboxReceipt({ ...base, checks: base.checks.map((c) => ({ ...c, exitCode: 1, failure: "command_failed" as const })) });
    expect(allFailed.predicate.verdict.taskEvent).toBe("mark_failed");
    const none = buildSandboxReceipt({ ...base, checks: [] });
    expect(none.predicate.status).toBe("unverified");
    expect(none.predicate.verdict.taskEvent).toBeNull();
  });

  it("needs the ProofPack before a task can be marked verified", () => {
    expect(buildSandboxReceipt({ ...base, proofPackDigest: null }).predicate.verdict.taskEvent).toBeNull();
  });

  it("has a digest that changes with any edit", async () => {
    const a = await sandboxReceiptDigest(buildSandboxReceipt(base));
    const b = await sandboxReceiptDigest(buildSandboxReceipt({ ...base, createdAt: "2026-10-17T10:00:01.000Z" }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    const s1 = await snapshotDigest([{ path: "b", sha256: "2" }, { path: "a", sha256: "1" }]);
    const s2 = await snapshotDigest([{ path: "a", sha256: "1" }, { path: "b", sha256: "2" }]);
    expect(s1).toBe(s2);
  });
});

describe("usage", () => {
  it("counts running time only, split from execution time", () => {
    const now = new Date("2026-10-17T10:10:00Z");
    const s = { billedSeconds: 120, runningSince: "2026-10-17T10:05:00Z", vcpu: 2, memoryMiB: 2048 };
    expect(runningSeconds(s, now)).toBe(420);
    expect(sessionUsage(s, 15_000, now)).toEqual({ runningSeconds: 420, vcpuSeconds: 840, gibSeconds: 840, activeExecutionSeconds: 15 });
    expect(runningSeconds({ ...s, runningSince: null }, now)).toBe(120);
    expect(wholeMinutes(61)).toBe(2);
  });
});

describe("preview tokens and hosts", () => {
  const secret = "s".repeat(40);
  const id = newPreviewId();

  it("issues 26-character DNS-safe ids", () => {
    expect(id).toMatch(/^[a-z2-7]{26}$/);
    expect(newPreviewId()).not.toBe(id);
  });

  it("parses only preview hosts for the configured domain", () => {
    expect(previewIdFromHost(`p-${id}.preview.localhost:3000`, "preview.localhost:3000")).toBe(id);
    expect(previewIdFromHost(`P-${id.toUpperCase()}.Preview.Localhost:3000`, "preview.localhost:3000")).toBe(id);
    expect(previewIdFromHost("localhost:3000", "preview.localhost:3000")).toBeNull();
    expect(previewIdFromHost(`p-${id}.preview.localhost:3000.evil.test`, "preview.localhost:3000")).toBeNull();
    expect(previewIdFromHost(`x.p-${id}.preview.localhost:3000`, "preview.localhost:3000")).toBeNull();
    expect(previewIdFromHost(`p-short.preview.localhost:3000`, "preview.localhost:3000")).toBeNull();
    expect(previewIdFromHost(`p-${id}.preview.localhost:3000`, "")).toBeNull();
  });

  it("sorts hosts on the preview domain so nothing there serves Farbaek itself", () => {
    expect(previewDomainHost("farbaek.si", "farbaek.si")).toBe("apex");
    expect(previewDomainHost("FARBAEK.SI.", "farbaek.si")).toBe("apex");
    expect(previewDomainHost(`p-${id}.farbaek.si`, "farbaek.si")).toBe("preview");
    expect(previewDomainHost("login.farbaek.si", "farbaek.si")).toBe("other");
    expect(previewDomainHost(`x.p-${id}.farbaek.si`, "farbaek.si")).toBe("other");
    expect(previewDomainHost("www.farbaek.com", "farbaek.si")).toBeNull();
    expect(previewDomainHost("evilfarbaek.si", "farbaek.si")).toBeNull();
    expect(previewDomainHost("login.farbaek.si", null)).toBeNull();
  });

  it("accepts a valid token once its claims match", async () => {
    const token = await signPreviewToken({ kind: "launch", p: id, u: "u1", exp: 1000, n: "n1" }, secret);
    expect(await verifyPreviewToken(token, secret, { kind: "launch", previewId: id, nowSeconds: 999 })).toMatchObject({ ok: true, claims: { u: "u1", n: "n1" } });
  });

  it("refuses expired, tampered, misdirected and wrong-kind tokens", async () => {
    const token = await signPreviewToken({ kind: "launch", p: id, u: "u1", exp: 1000 }, secret);
    expect(await verifyPreviewToken(token, secret, { kind: "launch", previewId: id, nowSeconds: 1000 })).toEqual({ ok: false, reason: "expired" });
    expect(await verifyPreviewToken(token, "t".repeat(40), { kind: "launch", previewId: id, nowSeconds: 1 })).toEqual({ ok: false, reason: "signature" });
    expect(await verifyPreviewToken(token, secret, { kind: "launch", previewId: newPreviewId(), nowSeconds: 1 })).toEqual({ ok: false, reason: "wrong_preview" });
    expect(await verifyPreviewToken(token, secret, { kind: "access", previewId: id, nowSeconds: 1 })).toEqual({ ok: false, reason: "wrong_kind" });
    const [body, sig] = token.split(".");
    const forged = `${btoa(JSON.stringify({ kind: "launch", p: id, u: "attacker", exp: 9e9 })).replace(/=+$/, "")}.${sig}`;
    expect((await verifyPreviewToken(forged, secret, { kind: "launch", previewId: id, nowSeconds: 1 })).ok).toBe(false);
    expect((await verifyPreviewToken(`${body}.${sig}.x`, secret, { kind: "launch", previewId: id, nowSeconds: 1 })).ok).toBe(false);
    expect((await verifyPreviewToken("", secret, { kind: "launch", previewId: id, nowSeconds: 1 })).ok).toBe(false);
    await expect(signPreviewToken({ kind: "launch", p: id, u: "u", exp: 1 }, "short")).rejects.toThrow();
  });

  it("never forwards the gateway or Farbaek cookies into the sandbox", () => {
    expect(forwardableCookies(`${PREVIEW_COOKIE}=abc; app=1; sb-x-auth-token=t; fb_ws=o; fpv=z`)).toBe("app=1");
    expect(forwardableCookies(`${PREVIEW_COOKIE}=abc`)).toBeNull();
  });

  it("rewrites redirects on the upstream host to the preview host", () => {
    const up = "https://3000-abc.e2b.app";
    expect(rewriteLocation("https://3000-abc.e2b.app/login?x=1", up)).toBe("/login?x=1");
    expect(rewriteLocation("/next", up)).toBe("/next");
    expect(rewriteLocation("https://example.com/", up)).toBe("https://example.com/");
  });
});

describe("sizes per runtime", () => {
  it("states what each runtime really gives a size", () => {
    expect(sizeOnRuntime(SANDBOX_SIZES.small, "e2b")).toMatchObject({ vcpu: 1, memoryGiB: 1, disk: "about 4 GiB free disk" });
    expect(sizeOnRuntime(SANDBOX_SIZES.small, "vercel")).toMatchObject({ vcpu: 1, memoryGiB: 2, disk: "64 GiB disk" });
    expect(sizeOnRuntime(SANDBOX_SIZES.standard, "vercel")).toMatchObject({ vcpu: 2, memoryGiB: 4 });
  });

  it("starts every template from Vercel's managed image on Vercel", () => {
    expect(defaultImageName("python", "standard", "vercel")).toBe("vercel/sandbox/universal");
    expect(defaultImageName("python", "standard")).toBe("farbaek-python-standard");
  });
});
