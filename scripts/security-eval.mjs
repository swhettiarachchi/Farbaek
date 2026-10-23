// Runs the security evaluation suite (ADR 0048) and writes its report,
// src/content/security-eval-run.json, from the real results: when it ran,
// the commit, Node's version, the suite's fingerprint, and each scenario's
// result. The report is never edited by hand. A failing scenario is
// recorded as failed and the script exits with an error.
//
//   pnpm security:eval

import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "tests", "security-eval");
const out = path.join(tmpdir(), `farbaek-security-eval-${process.pid}.json`);

// The registry test checks the report this script is about to write, so it isn't part of this run.
const run = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/security-eval", "--exclude", "tests/security-eval/registry.test.ts", "--reporter=default", "--reporter=json", `--outputFile.json=${out}`], {
  cwd: root,
  stdio: "inherit",
});

let results;
try {
  results = JSON.parse(readFileSync(out, "utf8"));
} catch {
  console.error("The suite didn't produce a report, so nothing was written.");
  process.exit(1);
} finally {
  rmSync(out, { force: true });
}

const scenarios = {};
for (const file of results.testResults ?? []) {
  for (const t of file.assertionResults ?? []) {
    const id = /^(SE-\d{3})\b/.exec(t.ancestorTitles?.[0] ?? "")?.[1];
    if (!id) continue;
    const s = (scenarios[id] ??= { status: "passed", tests: 0 });
    s.tests += 1;
    if (t.status !== "passed") s.status = "failed";
  }
}

// The same fingerprint as src/core/security-eval/suite-hash.ts: scenario files and the catalog, LF line endings.
const files = [
  ...readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "registry.test.ts")
    .map((f) => ({ path: `tests/security-eval/${f}`, content: readFileSync(path.join(dir, f), "utf8") })),
  { path: "src/core/security-eval/catalog.ts", content: readFileSync(path.join(root, "src", "core", "security-eval", "catalog.ts"), "utf8") },
].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const suiteSha256 = createHash("sha256")
  .update(files.map((f) => `${f.path}\n${f.content.replace(/\r\n/g, "\n")}`).join("\n\u0000\n"), "utf8")
  .digest("hex");

let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch {
  // Not a git checkout; the fingerprint still ties the report to the suite.
}

const ordered = Object.fromEntries(Object.entries(scenarios).sort(([a], [b]) => (a < b ? -1 : 1)));
const report = { ranAt: new Date().toISOString(), commit, node: process.version, suiteSha256, scenarios: ordered };
writeFileSync(path.join(root, "src", "content", "security-eval-run.json"), `${JSON.stringify(report, null, 2)}\n`);

const values = Object.values(ordered);
const failed = values.filter((s) => s.status === "failed").length;
console.log(`\nSecurity evaluation: ${values.length} scenarios, ${values.length - failed} passed, ${failed} failed. Report written to src/content/security-eval-run.json.`);
process.exit(failed > 0 || run.status !== 0 ? 1 : 0);
