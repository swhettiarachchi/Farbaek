import { describe, expect, it } from "vitest";
import { applyMutant, baselineProblem, classifyMutantRun, codeOnly, lineMutants, mutantExcerpt, mutantTimeoutSeconds, mutationCommand, mutationSummary, planMutants } from "./mutation";

describe("mutants of the lines a change adds (ADR 0136)", () => {
  it("leaves strings, comments, generics and arrows alone", () => {
    expect(codeOnly('if (a === "b === c") return; // x === y', false)).toBe(`if (a === "${" ".repeat(7)}") return; ${" ".repeat(10)}`);
    expect(lineMutants("src/a.ts", 1, 'const label = "a < b"; // true')).toEqual([]);
    expect(lineMutants("src/a.ts", 1, "const xs: Array<string> = list.map((x) => x);")).toEqual([]);
    expect(lineMutants("src/a.ts", 1, 'import { a } from "./b";')).toEqual([]);
  });

  it("finds each kind of mutant in reading order", () => {
    const m = lineMutants("src/cart.ts", 4, "  if (quantity < 1 || done === true) return total + 1;");
    expect(m.map((x) => [x.operator, x.original, x.replacement])).toEqual([
      ["relational", "<", "<="],
      ["logical", "||", "&&"],
      ["equality", "===", "!=="],
      ["boolean", "true", "false"],
      ["arithmetic", "+", "-"],
    ]);
    expect(m[0]).toMatchObject({ id: "src/cart.ts:4:15", before: "if (quantity < 1 || done === true) return total + 1;", after: "if (quantity <= 1 || done === true) return total + 1;" });
    expect(lineMutants("app/rules.py", 2, "    if age >= 18 and verified == True:").map((x) => x.original)).toEqual([">=", "and", "==", "True"]);
  });

  it("spreads mutants across added lines, skipping tests and unchanged lines", () => {
    const before = "export const max = 3;\n";
    const after = "export const max = 3;\nexport const ok = (n: number) => n > 0 && n <= max;\nexport const neg = (n: number) => n < 0;\n";
    const plan = planMutants([
      { path: "src/limits.ts", content: after, before },
      { path: "src/limits.test.ts", content: "expect(ok(1) === true)", before: null },
    ], 3);
    expect(plan.map((m) => `${m.line}:${m.original}`)).toEqual(["2:>", "3:<", "2:&&"]);
  });

  it("shows a window of the line around the change, for narrow screens", () => {
    const [, lt] = lineMutants("src/cart.ts", 9, '  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be a whole number of at least 1");');
    const e = mutantExcerpt(lt!, 12, 30);
    expect(e).toMatchObject({ clipped: true, more: true });
    expect(e.before).toEqual({ head: "|| quantity ", changed: "<", tail: " 1) throw new Err" });
    expect(e.after).toEqual({ head: "|| quantity ", changed: "<=", tail: " 1) throw new Err" });
    const short = mutantExcerpt(lineMutants("src/a.ts", 1, "const ok = n > 0;")[0]!);
    expect(short).toEqual({ clipped: false, more: false, before: { head: "const ok = n ", changed: ">", tail: " 0;" }, after: { head: "const ok = n ", changed: ">=", tail: " 0;" } });
  });

  it("applies a mutant only where the original still is", () => {
    const [m] = lineMutants("src/a.ts", 2, "const ok = n > 0;");
    expect(applyMutant("// a\nconst ok = n > 0;\n", m!)).toBe("// a\nconst ok = n >= 0;\n");
    expect(applyMutant("// a\nconst ok = n < 0;\n", m!)).toBeNull();
  });

  it("runs only the related tests, and judges a run by what it showed", () => {
    expect(mutationCommand("vitest", ["src/a.ts", "src/b.ts"])).toBe("npx --no-install vitest related --run --bail=1 src/a.ts src/b.ts");
    expect(mutationCommand("jest", ["src/a.ts"])).toBe("npx --no-install jest --ci --bail --findRelatedTests src/a.ts");
    expect(baselineProblem({ framework: "vitest", state: "succeeded", exitCode: 0, output: " Tests  4 passed (4)" })).toBeNull();
    expect(baselineProblem({ framework: "vitest", state: "failed", exitCode: 1, output: "No test files found" })).toMatch(/No tests cover/);
    expect(baselineProblem({ framework: "vitest", state: "failed", exitCode: 1, output: "Tests  1 failed" })).toMatch(/fail without any mutant/);
    expect(classifyMutantRun({ state: "failed", exitCode: 1, output: " FAIL  src/limits.test.ts > ok > rejects zero\nAssertionError" })).toEqual({ result: "killed", failingTest: "src/limits.test.ts > ok > rejects zero" });
    expect(classifyMutantRun({ state: "succeeded", exitCode: 0, output: "Tests  4 passed" }).result).toBe("survived");
    expect(classifyMutantRun({ state: "failed", exitCode: 1, output: "SyntaxError: Unexpected token" }).result).toBe("not_viable");
    expect(classifyMutantRun({ state: "timed_out", exitCode: null, output: "" }).result).toBe("timed_out");
  });

  it("scores caught out of judged, and limits each run by the clean run's time", () => {
    expect(mutationSummary([{ result: "killed" }, { result: "timed_out" }, { result: "survived" }, { result: "not_viable" }, { result: "not_run" }])).toEqual({ caught: 2, survived: 1, notViable: 1, notRun: 1, judged: 3, score: 2 / 3 });
    expect(mutationSummary([{ result: "not_viable" }]).score).toBeNull();
    expect(mutantTimeoutSeconds(4_000)).toBe(32);
    expect(mutantTimeoutSeconds(200_000)).toBe(180);
    expect(mutantTimeoutSeconds(100)).toBe(30);
  });
});
