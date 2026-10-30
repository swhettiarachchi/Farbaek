import { describe, expect, it } from "vitest";
import { COMPACT_SCRIPT, DETECT_SECRETS_VERSION, SECRETS_COMMAND, SEMGREP_COMMAND, SEMGREP_RULES, SEMGREP_VERSION, STATIC_SCAN_INSTALL, parseSecrets, parseSemgrep, semgrepRulesYaml, withoutRepeats } from "./static-scan";

const compact = (v: object) => `some progress text\n${JSON.stringify(v)}\n`;

describe("Semgrep and detect-secrets in a sandbox (ADR 0137)", () => {
  it("pins both tools, keeps Semgrep's metrics off and installs outside the project folder", () => {
    expect(SEMGREP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DETECT_SECRETS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(STATIC_SCAN_INSTALL).toContain(`semgrep==${SEMGREP_VERSION} detect-secrets==${DETECT_SECRETS_VERSION}`);
    expect(STATIC_SCAN_INSTALL).toMatch(/^python3 -m venv \/tmp\//);
    expect(SEMGREP_COMMAND).toContain("--metrics=off");
    expect(SEMGREP_COMMAND).toContain("--exclude .farbaek-scan");
    expect(SECRETS_COMMAND).toContain("--disable-plugin Base64HighEntropyString");
    expect(SECRETS_COMMAND).toContain("(^|/)(\\.farbaek-scan|node_modules|\\.git)/");
    // The compact script prints rule, file and line only: never the matched lines.
    expect(COMPACT_SCRIPT).not.toMatch(/"lines"|extra/);
    expect(COMPACT_SCRIPT).not.toContain("${");
  });

  it("writes every rule as plain, single-quoted YAML", () => {
    const yaml = semgrepRulesYaml();
    const lines = yaml.trimEnd().split("\n");
    const shapes = [
      /^rules:$/,
      /^ {2}- id: farbaek\.(js|py)\.[a-z-]+$/,
      /^ {4}languages: \[(javascript, typescript|python)\]$/,
      /^ {4}severity: (ERROR|WARNING|INFO)$/,
      /^ {4}message: '([^']|'')+'$/,
      /^ {4}patterns:$/,
      /^ {6}- pattern-either:$/,
      /^ {10}- pattern(-regex)?: '([^']|'')+'$/,
      /^ {6}- pattern-not: '([^']|'')+'$/,
    ];
    for (const line of lines) expect(shapes.some((s) => s.test(line)), line).toBe(true);
    expect(lines.filter((l) => l.startsWith("  - id: "))).toHaveLength(SEMGREP_RULES.length);
    expect(new Set(SEMGREP_RULES.map((r) => r.id)).size).toBe(SEMGREP_RULES.length);
    expect(yaml).toContain("- pattern: 'subprocess.$F(..., shell=True, ...)'");
    expect(yaml).toContain("- pattern-regex: 'rejectUnauthorized\\s*:\\s*false'");
    expect(yaml).toContain(`message: 'Certificate checks are turned off'`);
    expect(semgrepRulesYaml([{ ...SEMGREP_RULES[0]!, title: "It's quoted" }])).toContain("message: 'It''s quoted'");
  });

  it("reads Semgrep's compact report with Farbaek's words, and says when it didn't run", () => {
    const ok = parseSemgrep(
      compact({
        ok: true,
        exit: 0,
        version: SEMGREP_VERSION,
        results: [
          { rule: "farbaek-scan.farbaek.js.tls-off", path: "./src/api.ts", line: 12 },
          { rule: "farbaek.py.shell-true", path: "jobs/run.py", line: 4 },
          { rule: "someone.elses.rule", path: "a.ts", line: 1 },
        ],
        total: 3,
        errors: ["Syntax error in x.ts"],
        scanned: 40,
      }),
    );
    expect(ok).toMatchObject({ ok: true, total: 3, detail: `Semgrep ${SEMGREP_VERSION} with Farbaek's ${SEMGREP_RULES.length} rules over 40 files. 1 file couldn't be parsed.` });
    expect(ok.ok && ok.findings.map((f) => [f.rule, f.severity, f.source, f.file, f.line])).toEqual([
      ["farbaek.js.tls-off", "high", "sast", "src/api.ts", 12],
      ["farbaek.py.shell-true", "high", "sast", "jobs/run.py", 4],
    ]);
    expect(parseSemgrep(compact({ ok: true, exit: 7, results: [], total: 0, errors: ["Invalid rule schema"] }))).toEqual({ ok: false, reason: "Semgrep stopped (exit 7): Invalid rule schema" });
    expect(parseSemgrep(compact({ ok: false, exit: -1, error: "The sandbox stopped." }))).toEqual({ ok: false, reason: "Semgrep didn't finish: The sandbox stopped." });
    expect(parseSemgrep("not json")).toMatchObject({ ok: false });
  });

  it("reads detect-secrets by type, file and line, never the secret", () => {
    const r = parseSecrets(compact({ ok: true, exit: 0, version: "1.5.0", results: [{ rule: "Private Key", path: "deploy/key.pem", line: 1 }, { rule: "AWS Access Key", path: "src/aws.ts", line: 3 }, { rule: "Secret Keyword", path: "config.py", line: 9 }], total: 3 }));
    expect(r.ok && r.findings.map((f) => [f.rule, f.severity, f.title])).toEqual([
      ["secret:private-key", "critical", "A secret may be in the code: Private Key"],
      ["secret:aws-access-key", "high", "A secret may be in the code: AWS Access Key"],
      ["secret:secret-keyword", "medium", "A secret may be in the code: Secret Keyword"],
    ]);
    expect(parseSecrets(compact({ ok: true, exit: 1, results: [], total: 0 }))).toMatchObject({ ok: false });
  });

  it("doesn't count a problem twice at the same file and line", () => {
    const existing = [{ file: "src/api.ts", line: 12 }];
    const r = parseSemgrep(compact({ ok: true, exit: 0, results: [{ rule: "farbaek.js.tls-off", path: "src/api.ts", line: 12 }, { rule: "farbaek.js.tls-off", path: "src/api.ts", line: 30 }], total: 2 }));
    expect(r.ok && withoutRepeats(existing, r.findings).map((f) => f.line)).toEqual([30]);
  });
});
