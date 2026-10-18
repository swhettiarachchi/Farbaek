import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import type { SecurityReportStatement } from "@/core/security/report";
import type { ReviewOutcome, SecurityReviewer } from "@/server/ai/security-reviewer";
import type { AiUsageDeps } from "@/server/workspace/ai-usage";
import { runSecurityCheck, startSecurityCheck, type CheckPerson, type SecurityCheckDeps } from "./runner";

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

function deps(over: { billing?: BillingSnapshot; reviewer?: SecurityCheckDeps["reviewer"]; audit?: SecurityCheckDeps["audit"]; files?: Record<string, string> } = {}) {
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
    expect(report(t.finished).checks[2]).toEqual({ name: "ai_review", ran: false, reason: expect.stringMatching(/wasn't counted/) });
    expect(t.usage.at(-1)).toMatchObject({ name: "settle", input: { status: "refunded", refundReason: "failed" } });
  });

  it("is included from Plus up and in the trial, and needs a contributor", async () => {
    expect(await startSecurityCheck(deps({ billing: { state: "free" } }).d, alice, "p1")).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN", message: expect.stringMatching(/from the Plus plan up/) });
    expect(await startSecurityCheck(deps().d, { ...alice, role: "viewer" }, "p1")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await startSecurityCheck(deps().d, alice, "p1")).toEqual({ ok: true, value: { reportId: "report-1" } });
  });
});
