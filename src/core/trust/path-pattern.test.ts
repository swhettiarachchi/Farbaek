import { describe, expect, it } from "vitest";
import { compilePattern, coversEverything, describePattern, matchesPattern, normalizePattern } from "./path-pattern";

describe("file patterns", () => {
  it.each([
    ["*.sql", "db/schema.sql", true],
    ["*.sql", "schema.sql", true],
    ["*.sql", "db/schema.sqlx", false],
    ["package.json", "apps/web/package.json", true],
    ["src/billing/", "src/billing/plan.ts", true],
    ["src/billing/", "src/billing/deep/x/y.ts", true],
    ["src/billing/", "src/billing.ts", false],
    ["src/billing/", "lib/src/billing/plan.ts", false],
    ["src/billing/**", "src/billing/plan.ts", true],
    ["fixtures/", "test/fixtures/a.json", true],
    ["app/page.tsx", "app/page.tsx", true],
    ["app/page.tsx", "src/app/page.tsx", false],
    ["src/*.ts", "src/a.ts", true],
    ["src/*.ts", "src/lib/a.ts", false],
    ["src/**/test.ts", "src/test.ts", true],
    ["src/**/test.ts", "src/a/b/test.ts", true],
    ["file?.md", "docs/file1.md", true],
    ["file?.md", "docs/file10.md", false],
    ["a+b.txt", "a+b.txt", true],
    ["a+b.txt", "aab.txt", false],
  ])("%s against %s is %s", (glob, path, expected) => {
    expect(matchesPattern(glob, path)).toBe(expected);
  });

  it("compiles to one anchored expression built from tokens", () => {
    expect(compilePattern("*.sql")).toEqual({ ok: true, regex: "^(.*/)?[^/]*\\.sql$" });
    expect(compilePattern("src/billing/")).toEqual({ ok: true, regex: "^src/billing/.*$" });
    expect(compilePattern("src/**/x.ts")).toEqual({ ok: true, regex: "^src/(.*/)?x\\.ts$" });
    // Runs of stars inside a name count once.
    expect(compilePattern("a***b")).toEqual({ ok: true, regex: "^(.*/)?a[^/]*b$" });
  });

  it("refuses what isn't a project path", () => {
    for (const bad of ["", "   ", "/etc/passwd", "../secrets", "src/../x", "a//b", "src/[ab].ts", "src/{a,b}", "a b", "x".repeat(201), "*a*b*c*d*e*f*g*h*i"]) {
      expect(compilePattern(bad).ok, bad).toBe(false);
    }
    expect(compilePattern("**/a/**/b/**/c/**/d").ok).toBe(false);
    expect(matchesPattern("../x", "x")).toBe(false);
  });

  it("writes /** as a trailing slash", () => {
    expect(normalizePattern(" src/billing/** ")).toBe("src/billing/");
    expect(normalizePattern("**")).toBe("**");
  });

  it("says what a pattern covers in plain words", () => {
    expect(describePattern("src/billing/")).toBe("any file inside src/billing");
    expect(describePattern("fixtures/")).toBe("any file inside a folder named fixtures");
    expect(describePattern("*.sql")).toBe("any file named like *.sql");
    expect(describePattern("package.json")).toBe("any file named package.json");
    expect(describePattern("app/page.tsx")).toBe("the file app/page.tsx");
    expect(describePattern("src/*.ts")).toBe("any file matching src/*.ts");
    expect(describePattern("**")).toBe("any file");
    expect(coversEverything("*")).toBe(true);
    expect(coversEverything("**/*")).toBe(true);
    expect(coversEverything("src/")).toBe(false);
  });
});
