/**
 * Keeps the security evaluation suite honest (ADR 0048): every registered
 * scenario is exactly one describe block in its file and nothing else
 * claims a scenario id; every OWASP risk is either tested or says why not;
 * and the committed run report belongs to exactly this suite.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVAL_SCENARIOS, OWASP_RISKS, RISK_NOTES, type EvalRun } from "@/core/security-eval/catalog";
import { suiteFingerprint } from "@/core/security-eval/suite-hash";

const DIR = path.join(process.cwd(), "tests", "security-eval");
const CATALOG = path.join(process.cwd(), "src", "core", "security-eval", "catalog.ts");
const REPORT = path.join(process.cwd(), "src", "content", "security-eval-run.json");
const scenarioFiles = readdirSync(DIR).filter((f) => f.endsWith(".test.ts") && f !== "registry.test.ts");

/** The files the suite's fingerprint covers, as the run script reads them. */
export function suiteFiles(): { path: string; content: string }[] {
  return [
    ...readdirSync(DIR)
      .filter((f) => f.endsWith(".ts") && f !== "registry.test.ts")
      .map((f) => ({ path: `tests/security-eval/${f}`, content: readFileSync(path.join(DIR, f), "utf8") })),
    { path: "src/core/security-eval/catalog.ts", content: readFileSync(CATALOG, "utf8") },
  ];
}

describe("the scenario registry", () => {
  it("has exactly one describe block per registered scenario, in its declared file, and no unregistered ones", () => {
    const found = new Map<string, string[]>();
    for (const file of scenarioFiles) {
      const text = readFileSync(path.join(DIR, file), "utf8");
      for (const m of text.matchAll(/describe\("((SE-\d{3}) [^"]+)"/g)) found.set(m[2]!, [...(found.get(m[2]!) ?? []), `${file}: ${m[1]}`]);
    }
    for (const s of EVAL_SCENARIOS) {
      expect(found.get(s.id), s.id).toEqual([`${s.file}: ${s.id} ${s.title}`]);
    }
    expect([...found.keys()].sort()).toEqual(EVAL_SCENARIOS.map((s) => s.id).sort());
    expect(new Set(EVAL_SCENARIOS.map((s) => s.id)).size).toBe(EVAL_SCENARIOS.length);
  });

  it("maps every scenario to real OWASP ids, and every risk is tested or says why not", () => {
    const ids = new Set(OWASP_RISKS.map((r) => r.id));
    expect(ids.size).toBe(20);
    for (const s of EVAL_SCENARIOS) for (const r of s.risks) expect(ids.has(r), `${s.id} ${r}`).toBe(true);
    for (const r of OWASP_RISKS) {
      const note = RISK_NOTES[r.id];
      expect(note, r.id).toBeDefined();
      const tested = EVAL_SCENARIOS.some((s) => s.risks.includes(r.id));
      if (note!.notApplicable) expect(tested, `${r.id} is marked not applicable but has scenarios`).toBe(false);
      else expect(note!.untested.length, `${r.id} needs a note on what isn't tested`).toBeGreaterThan(20);
    }
  });

  it("never words coverage as complete or certified", () => {
    const words = JSON.stringify({ EVAL_SCENARIOS, RISK_NOTES });
    expect(words).not.toMatch(/\b(fully|completely|certified|guarantee[sd]?|100%)\b/i);
  });
});

describe("the committed run report", () => {
  it("lists exactly the registered scenarios and belongs to this exact suite (run pnpm security:eval after changing it)", async () => {
    const run = JSON.parse(readFileSync(REPORT, "utf8")) as EvalRun & { suiteSha256: string };
    expect(Object.keys(run.scenarios).sort()).toEqual(EVAL_SCENARIOS.map((s) => s.id).sort());
    expect(run.suiteSha256).toBe(await suiteFingerprint(suiteFiles()));
    expect(Date.parse(run.ranAt)).not.toBeNaN();
  });
});
