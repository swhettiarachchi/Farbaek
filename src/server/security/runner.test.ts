import { describe, expect, it } from "vitest";
import { resolveEffectivePlan as effectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import type { SecurityReportStatement } from "@/core/security/report";
import type { ReviewOutcome, SecurityReviewer } from "@/server/ai/security-reviewer";
import type { AiUsageDeps } from "@/server/workspace/ai-usage";
import { checkScope, FULL_CHECK_REASON, runSecurityCheck, startSecurityCheck, type CheckPerson, type SecurityCheckDeps } from "./runner";

const FILES: Record<string, string> = {
  "src/app/api/login/route.ts": 'const apiKey = "a8F3kd92Lq0zXw71";\nexport async function POST() {}\n',
  "src/components/Post.tsx": "export const Post = ({ body }) => <div dangerouslySetInnerHTML={{ __html: body }} />;\n",
  "package.json": '{"name":"site"}',
};
const alice: CheckPerson = { orgId: "o1", userId: "u1", role: "member" };
const PLUS: BillingSnapshot = { state: "active", paidPlanId: "plus" };

/** A labelled fake reviewer: it never calls a model. */
function fakeReviewer(outcome: ReviewOutcome) {
  const r = { calls: [] as string[][] };
  const source = {
    family: "anthropic" as const,
    create: (s: { model: string }): SecurityReviewer => ({
      model: s.model,
      maxOutputTokens: 8_000,
      review: async (files) => (r.calls.push(files.map((f) => f.path)), outcome),
    }),
  };
  return { source, r };
}

function deps(over: { billing?: BillingSnapshot; reviewer?: SecurityCheckDeps["reviewer"]; audit?: SecurityCheckDeps["audit"]; osv?: SecurityCheckDeps["osv"]; staticScan?: SecurityCheckDeps["staticScan"]; files?: Record<string, string> } = {}) {
  const files = over.files ?? FILES;
  const finished: { id: string; outcome: { status: "done"; statement: SecurityReportStatement; digest: string } | { status: "failed"; error: string } }[] = [];
  const usage: { name: string; input: unknown }[] = [];
  const u: AiUsageDeps = {
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (usage.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (usage.push({ name: "settle", input }), { ok: true, value: null }),
  };
  const d: SecurityCheckDeps = {
    reports: {
      start: async () => ({ ok: true, value: "report-1" }),
      finish: async (id, outcome) => (finished.push({ id, outcome }), { ok: true, value: null }),
      interruptStale: async () => 0,
    },
    checks: {
      project: async () => ({ id: "p1", name: "Site", archived: false }),
      projectFiles: async () => Object.entries(files).map(([path, c], i) => ({ path, revision: 1, sha256: String(i).repeat(64), sizeBytes: c.length })),
      fileContents: async () => new Map(Object.entries(files)),
    },
    usage: { ...u, billing: async () => over.billing ?? PLUS, now: () => new Date("2026-10-18T12:00:00Z"), newEventId: () => "key-1" },
    reviewer: over.reviewer ?? { unavailable: "AI isn't connected on this server yet." },
    audit: over.audit ?? { unavailable: "No verified sandbox is connected." },
    osv: over.osv,
    staticScan: over.staticScan,
  };
  return { d, finished, usage };
}

const report = (f: { outcome: { status: string } }[]) => (f[0]!.outcome as { status: "done"; statement: SecurityReportStatement }).statement.predicate;

describe("security checks", () => {
  it("runs the rules and the AI review, keeps only AI findings about files it saw, and meters the review", async () => {
    const { source, r } = fakeReviewer({
      ok: true,
      usage: { model: "claude-sonnet-5-5", inputTokens: 3_000, outputTokens: 600 },
      output: {
        findings: [
          { severity: "high", file: "src/app/api/login/route.ts", line: 2, title: "Login has no rate limit", detail: "d", fix: "f" },
          { severity: "critical", file: "src/elsewhere.ts", line: 1, title: "Invented", detail: "d", fix: "f" },
          { severity: "low", file: "src/components/Post.tsx", line: 400, title: "Line out of range", detail: "d", fix: "f" },
        ],
      },
    });
    const t = deps({ reviewer: source });
    await runSecurityCheck(t.d, alice, { id: "p1", name: "Site" }, "report-1");
    const p = report(t.finished);
    expect(p.findings.map((f) => [f.source, f.rule, f.file, f.line])).toEqual([
      ["rules", "hardcoded-credential", "src/app/api/login/route.ts", 1],
      ["ai", "ai-review", "src/app/api/login/route.ts", 2],
      ["rules", "raw-html", "src/components/Post.tsx", 1],
      ["ai", "ai-review", "src/components/Post.tsx", null],
    ]);
    expect(p.checks).toEqual([
      { name: "rules", ran: true, findings: 2 },
      { name: "dependencies", ran: false, reason: expect.stringMatching(/no package-lock.json/) },
      { name: "osv", ran: false, reason: expect.stringMatching(/no lockfile/) },
      { name: "sast", ran: false, reason: "Static analysis isn't connected on this server." },
      { name: "secrets", ran: false, reason: "Static analysis isn't connected on this server." },
      { name: "ai_review", ran: true, findings: 2, detail: "2 files reviewed." },
    ]);
    expect(p).toMatchObject({ score: 60, grade: "C", model: "claude-sonnet-5-5" });
    expect(r.calls[0]).toEqual(["src/app/api/login/route.ts", "src/components/Post.tsx"]);
    expect(t.usage.map((x) => x.name)).toEqual(["reserve", "settle"]);
    expect(t.usage[0]!.input).toMatchObject({ operation: "security_review", taskId: null });
    expect((t.finished[0]!.outcome as { digest: string }).digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("audits packages when there's a lockfile and a sandbox", async () => {
    const audit = async () => ({ ok: true as const, stdout: JSON.stringify({ vulnerabilities: { next: { name: "next", severity: "high", isDirect: true, via: [{ title: "SSRF" }], fixAvailable: true } } }) });
    const t = deps({ audit, files: { ...FILES, "package-lock.json": "{}" } });
    await runSecurityCheck(t.d, alice, { id: "p1", name: "Site" }, "report-1");
    const p = report(t.finished);
    expect(p.checks[1]).toEqual({ name: "dependencies", ran: true, findings: 1, detail: "1 vulnerable packages found." });
    expect(p.findings.some((f) => f.title === "next has a known high vulnerability")).toBe(true);
  });

  it("gives the AI review back when it fails, and still reports the rest", async () => {
    const { source } = fakeReviewer({ ok: false, failure: "PROVIDER_BUSY", usage: null });
    const t = deps({ reviewer: source });
    await runSecurityCheck(t.d, alice, { id: "p1", name: "Site" }, "report-1");
    expect(report(t.finished).checks.find((c) => c.name === "ai_review")).toEqual({ name: "ai_review", ran: false, reason: expect.stringMatching(/wasn't counted/) });
    expect(t.usage.at(-1)).toMatchObject({ name: "settle", input: { status: "refunded", refundReason: "failed" } });
  });

  it("starts on every plan, and needs a contributor", async () => {
    expect(await startSecurityCheck(deps({ billing: { state: "free" } }).d, alice, "p1")).toEqual({ ok: true, value: { reportId: "report-1" } });
    expect(await startSecurityCheck(deps().d, { ...alice, role: "viewer" }, "p1")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await startSecurityCheck(deps().d, alice, "p1")).toEqual({ ok: true, value: { reportId: "report-1" } });
  });
});

describe("the rules check on plans without full checks (ADR 0168)", () => {
  const LOCKED = { ...FILES, "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/next": { version: "14.0.0" } } }) };

  it("gives Free, Lite, Maker and Starter a rules check, and Plus and the trial the full one", () => {
    const at = new Date("2026-10-18T12:00:00Z");
    expect(checkScope(effectivePlan({ state: "free" }, at))).toEqual({ kind: "rules", reason: FULL_CHECK_REASON });
    for (const plan of ["lite", "maker", "starter"] as const) expect(checkScope(effectivePlan({ state: "active", paidPlanId: plan }, at))?.kind).toBe("rules");
    expect(checkScope(effectivePlan(PLUS, at))).toEqual({ kind: "full" });
    // A suspended paid workspace is on Free until billing is fixed: it gets the rules check, with that reason.
    expect(checkScope(effectivePlan({ state: "suspended", paidPlanId: "plus" }, at))).toEqual({ kind: "rules", reason: expect.stringMatching(/paused until billing is resolved/) });
    expect(checkScope(null)).toBeNull();
  });

  it("runs the rules and OSV.dev, skips the sandbox scans and the AI review with the reason, and calls none of them", async () => {
    const calls: string[] = [];
    const { source, r } = fakeReviewer({ ok: true, usage: { model: "m", inputTokens: 1, outputTokens: 1 }, output: { findings: [] } });
    const t = deps({
      billing: { state: "free" },
      files: LOCKED,
      reviewer: source,
      audit: async () => (calls.push("audit"), { ok: true as const, stdout: "{}" }),
      staticScan: async () => (calls.push("scan"), { ok: true as const, semgrep: "", secrets: "" }),
      osv: async (packages) => (calls.push(`osv:${packages.length}`), { ok: true as const, hits: [], details: new Map() }),
    });
    await runSecurityCheck(t.d, alice, { id: "p1", name: "Site" }, "report-1", { kind: "rules", reason: FULL_CHECK_REASON });
    const p = report(t.finished);
    expect(p.scope).toBe("rules");
    expect(p.checks).toEqual([
      { name: "rules", ran: true, findings: 2 },
      { name: "dependencies", ran: false, reason: FULL_CHECK_REASON },
      { name: "osv", ran: true, findings: 0, detail: expect.stringMatching(/^1 locked package from package-lock.json looked up/) },
      { name: "sast", ran: false, reason: FULL_CHECK_REASON },
      { name: "secrets", ran: false, reason: FULL_CHECK_REASON },
      { name: "ai_review", ran: false, reason: FULL_CHECK_REASON },
    ]);
    expect(calls).toEqual(["osv:1"]);
    expect(r.calls).toEqual([]);
    expect(t.usage).toEqual([]);
    expect(p.model).toBeNull();
  });

  it("leaves a full check's report without a scope, so its shape and digest don't change", async () => {
    const t = deps();
    await runSecurityCheck(t.d, alice, { id: "p1", name: "Site" }, "report-1");
    expect("scope" in report(t.finished)).toBe(false);
  });
});

describe("Semgrep and detect-secrets (ADR 0137)", () => {
  const compact = (results: { rule: string; path: string; line: number }[], exit = 0) => JSON.stringify({ ok: true, exit, version: "x", results, total: results.length, errors: [], scanned: 3 });

  it("adds their findings, without counting a line another check already reported", async () => {
    const asked: string[] = [];
    const staticScan: SecurityCheckDeps["staticScan"] = async (i) => (
      asked.push(i.reportId),
      {
        ok: true,
        // The hardcoded key at route.ts:1 is already a rules finding, so the secret scan's copy is dropped.
        semgrep: compact([{ rule: "farbaek.js.tls-off", path: "src/app/api/login/route.ts", line: 2 }]),
        secrets: compact([{ rule: "Secret Keyword", path: "src/app/api/login/route.ts", line: 1 }]),
      }
    );
    const t = deps({ staticScan });
    await runSecurityCheck(t.d, alice, { id: "p1", name: "Site" }, "report-1");
    const p = report(t.finished);
    expect(asked).toEqual(["report-1"]);
    expect(p.checks.find((c) => c.name === "sast")).toMatchObject({ ran: true, findings: 1 });
    expect(p.checks.find((c) => c.name === "secrets")).toMatchObject({ ran: true, findings: 0 });
    expect(p.findings.filter((f) => f.source === "sast").map((f) => [f.rule, f.line])).toEqual([["farbaek.js.tls-off", 2]]);
  });

  it("reports each tool that didn't run, with the reason", async () => {
    const t = deps({ staticScan: async () => ({ ok: true, semgrep: compact([], 7), secrets: JSON.stringify({ ok: false, exit: -1, error: "The sandbox stopped." }) }) });
    await runSecurityCheck(t.d, alice, { id: "p1", name: "Site" }, "report-1");
    const p = report(t.finished);
    expect(p.checks.find((c) => c.name === "sast")).toEqual({ name: "sast", ran: false, reason: "Semgrep stopped (exit 7)." });
    expect(p.checks.find((c) => c.name === "secrets")).toEqual({ name: "secrets", ran: false, reason: "detect-secrets didn't finish: The sandbox stopped." });
    const off = deps({ staticScan: { unavailable: "No test space is connected, so Semgrep and the secret scan can't run." } });
    await runSecurityCheck(off.d, alice, { id: "p1", name: "Site" }, "report-1");
    expect(report(off.finished).checks.filter((c) => c.name === "sast" || c.name === "secrets").map((c) => c.ran)).toEqual([false, false]);
  });
});

describe("OSV.dev (ADR 0130)", () => {
  const lock = JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/lodash": { version: "4.17.15" } } });
  const advisory = { id: "GHSA-p6mc-m468-83gw", summary: "Prototype Pollution in lodash", severity: "HIGH", aliases: [], affected: [{ package: { name: "lodash", ecosystem: "npm" }, ranges: [{ events: [{ fixed: "4.17.19" }] }] }] };

  it("looks every locked package up, and reports what it found", async () => {
    const asked: string[] = [];
    const osv: SecurityCheckDeps["osv"] = async (pkgs) => (asked.push(...pkgs.map((p) => `${p.ecosystem}:${p.name}`)), { ok: true, hits: [{ pkg: pkgs.find((p) => p.name === "lodash")!, ids: [advisory.id] }], details: new Map([[advisory.id, advisory]]) });
    const t = deps({ osv, files: { ...FILES, "package-lock.json": lock, "requirements.txt": "django==4.2.1\n" } });
    await runSecurityCheck(t.d, alice, { id: "p1", name: "Site" }, "report-1");
    const p = report(t.finished);
    expect(asked).toEqual(["npm:lodash", "PyPI:django"]);
    expect(p.checks.find((c) => c.name === "osv")).toEqual({ name: "osv", ran: true, findings: 1, detail: "2 locked packages from package-lock.json, requirements.txt looked up; 1 with known vulnerabilities." });
    expect(p.findings.some((f) => f.rule === advisory.id && f.severity === "high" && f.fix.includes("4.17.19"))).toBe(true);
  });

  it("leaves npm packages to npm audit when it ran, and says why it's skipped otherwise", async () => {
    const asked: string[] = [];
    const osv: SecurityCheckDeps["osv"] = async (pkgs) => (asked.push(...pkgs.map((p) => p.name)), { ok: true, hits: [], details: new Map() });
    const audit = async () => ({ ok: true as const, stdout: JSON.stringify({ vulnerabilities: {} }) });
    const both = deps({ osv, audit, files: { ...FILES, "package-lock.json": lock, "requirements.txt": "django==4.2.1\n" } });
    await runSecurityCheck(both.d, alice, { id: "p1", name: "Site" }, "report-1");
    expect(asked).toEqual(["django"]);
    expect(report(both.finished).checks.find((c) => c.name === "osv")).toMatchObject({ ran: true, detail: expect.stringMatching(/left to npm audit/) });
    const none = deps({ osv });
    await runSecurityCheck(none.d, alice, { id: "p1", name: "Site" }, "report-1");
    expect(report(none.finished).checks.find((c) => c.name === "osv")).toMatchObject({ ran: false, reason: expect.stringMatching(/no lockfile/) });
    const down = deps({ osv: async () => ({ ok: false, reason: "Farbaek couldn't reach OSV.dev just now. Run the check again later." }), files: { ...FILES, "package-lock.json": lock } });
    await runSecurityCheck(down.d, alice, { id: "p1", name: "Site" }, "report-1");
    expect(report(down.finished).checks.find((c) => c.name === "osv")).toMatchObject({ ran: false, reason: expect.stringMatching(/couldn't reach OSV.dev/) });
  });
});

