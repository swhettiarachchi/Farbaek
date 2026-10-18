import { describe, expect, it } from "vitest";
import { parseNpmAudit } from "./audit";
import { dedupeFindings, scoreOf, type Finding } from "./findings";
import { buildSecurityReport, securityReportDigest } from "./report";
import { riskiestFiles, runRules, type ProjectFile } from "./rules";

const rules = (files: ProjectFile[]) => runRules(files).map((f) => `${f.rule}@${f.file}:${f.line ?? "-"}`);

describe("Farbaek's security rules", () => {
  it("finds credentials and tokens in code, but not placeholders, env reads or tests", () => {
    const found = rules([
      { path: "src/config.ts", content: 'const apiKey = "a8F3kd92Lq0zXw71";\nconst password = "your-password-here";\nconst secret = process.env.SECRET;' },
      { path: "src/session.ts", content: 'const t = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV";' },
      { path: "tests/login.test.ts", content: 'const password = "hunter2hunter2";' },
    ]);
    expect(found).toEqual(["hardcoded-credential@src/config.ts:1", "token-in-source@src/session.ts:1"]);
  });

  it("flags public env names that hold secrets, and server keys in browser code only", () => {
    expect(rules([{ path: "src/lib/supabase.ts", content: '"use client";\nconst key = process.env.SUPABASE_SERVICE_ROLE_KEY;' }])).toEqual(["service-key-in-client@src/lib/supabase.ts:2"]);
    expect(rules([{ path: "src/app/api/admin/route.ts", content: "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;" }])).toEqual([]);
    expect(rules([{ path: "src/env.ts", content: "NEXT_PUBLIC_STRIPE_SECRET_KEY" }])).toEqual(["public-env-secret@src/env.ts:1"]);
  });

  it("finds tables without Row Level Security across migration files", () => {
    const found = rules([
      { path: "supabase/migrations/1.sql", content: "create table public.notes (id uuid);\ncreate table public.orders (id uuid);\ncreate table private.cache (k text);" },
      { path: "supabase/migrations/2.sql", content: "alter table public.notes enable row level security;" },
    ]);
    expect(found).toEqual(["table-without-rls@supabase/migrations/1.sql:2"]);
  });

  it("flags wildcard CORS, raw HTML, eval and SQL built from strings", () => {
    const found = rules([
      { path: "src/server.js", content: 'res.setHeader("Access-Control-Allow-Origin", "*");\nconst q = `select * from users where id = ${id}`;\neval(code);' },
      { path: "src/Post.tsx", content: "<div dangerouslySetInnerHTML={{ __html: body }} />" },
    ]);
    expect(found).toEqual(["cors-wildcard@src/server.js:1", "dynamic-code@src/server.js:3", "sql-from-strings@src/server.js:2", "raw-html@src/Post.tsx:1"]);
  });

  it("notes a missing Content Security Policy for sites, and not when one is set", () => {
    expect(rules([{ path: "index.html", content: "<html><head></head></html>" }])).toEqual(["no-csp@index.html:-"]);
    expect(rules([{ path: "index.html", content: '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">' }])).toEqual([]);
  });

  it("picks flagged and server code first for the AI review", () => {
    const files = [
      { path: "src/components/Button.tsx", content: "x" },
      { path: "src/app/api/login/route.ts", content: "x" },
      { path: "src/util.ts", content: "x" },
    ];
    const findings = runRules([{ path: "src/util.ts", content: "eval(x)" }]);
    expect(riskiestFiles(files, findings, 2).map((f) => f.path)).toEqual(["src/util.ts", "src/app/api/login/route.ts"]);
  });
});

describe("package audit", () => {
  it("turns npm audit's report into findings, direct packages first", () => {
    const report = JSON.stringify({
      vulnerabilities: {
        "deep-dep": { name: "deep-dep", severity: "moderate", isDirect: false, via: ["next"], range: "<1.2.0", fixAvailable: true },
        next: { name: "next", severity: "critical", isDirect: true, via: [{ title: "Authorization bypass", url: "https://github.com/advisories/GHSA-x" }], range: "<15.2.3", fixAvailable: { name: "next", version: "15.2.3", isSemVerMajor: false } },
      },
    });
    const r = parseNpmAudit(report);
    expect(r).toMatchObject({ ok: true, total: 2 });
    if (!r.ok) return;
    expect(r.findings.map((f) => [f.title, f.severity])).toEqual([
      ["next has a known critical vulnerability", "critical"],
      ["deep-dep has a known moderate vulnerability", "medium"],
    ]);
    expect(r.findings[0]!.fix).toBe("Update next to 15.2.3, then run the tests.");
    expect(parseNpmAudit("not json")).toMatchObject({ ok: false });
  });
});

describe("the report", () => {
  const f = (over: Partial<Finding>): Finding => ({ id: "", rule: "r", severity: "low", source: "rules", title: "t", detail: "d", fix: "x", file: "a.ts", line: 1, ...over });

  it("scores from 100 by severity and grades it", () => {
    expect(scoreOf([])).toEqual({ score: 100, grade: "A" });
    expect(scoreOf([f({ severity: "critical" }), f({ severity: "high" })])).toEqual({ score: 55, grade: "D" });
    expect(scoreOf(Array.from({ length: 10 }, () => f({ severity: "critical" })))).toEqual({ score: 0, grade: "F" });
  });

  it("drops duplicates, numbers findings most serious first, and has a stable digest", async () => {
    expect(dedupeFindings([f({}), f({}), f({ line: 2 })])).toHaveLength(2);
    const input = {
      project: { id: "p1", name: "Site" },
      files: 4,
      snapshotDigest: "a".repeat(64),
      checks: [{ name: "rules" as const, ran: true as const, findings: 2 }],
      findings: [f({ severity: "low", title: "low" }), f({ severity: "high", title: "high", line: 9 })],
      model: null,
      generatedAt: new Date("2026-10-18T12:00:00Z"),
    };
    const report = buildSecurityReport(input);
    expect(report.predicate.findings.map((x) => [x.id, x.title])).toEqual([
      ["F001", "high"],
      ["F002", "low"],
    ]);
    expect(report.predicate).toMatchObject({ score: 82, grade: "B", counts: { high: 1, low: 1 } });
    expect(await securityReportDigest(report)).toBe(await securityReportDigest(buildSecurityReport(input)));
  });
});
