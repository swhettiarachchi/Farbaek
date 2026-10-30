/**
 * Static analysis and secret scanning in a sandbox (ADR 0137, spec §10
 * ProofPack: "Semgrep (SAST) ... gitleaks and/or TruffleHog (secrets)").
 *
 * Semgrep runs with Farbaek's own ruleset, written into the sandbox, because
 * the sandbox can't reach Semgrep's rule registry and the registry's rules
 * carry their own licence. The rules cover what Farbaek's regex rules
 * (rules.ts) can't: values from a request flowing into a shell command, a
 * file path, a redirect or a fetch; TLS checks turned off; mass assignment;
 * unsafe deserialization. Secrets are scanned with Yelp's detect-secrets,
 * because gitleaks and TruffleHog ship only as GitHub release binaries and
 * the sandbox can reach package registries alone. Both are pinned, installed
 * from PyPI into a throwaway virtual environment, and run with Semgrep's
 * metrics off. A small script compacts each tool's JSON in the sandbox to
 * rule, file and line, so no matched source text (which could hold a
 * secret) ever leaves it.
 */
import type { Finding, Severity } from "./findings";

/** Pinned, each at least two weeks old when chosen (2026-10-30). */
export const SEMGREP_VERSION = "1.179.0";
export const DETECT_SECRETS_VERSION = "1.5.0";

/** The sandbox folder Farbaek writes its rules and script into; it's excluded from both scans. */
export const SCAN_DIR = ".farbaek-scan";

type Alt = { pattern: string } | { regex: string };

export interface SemgrepRule {
  id: string;
  languages: ("javascript" | "typescript" | "python")[];
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  any: Alt[];
  not?: string[];
}

const JS = ["javascript", "typescript"] as SemgrepRule["languages"];
const PY = ["python"] as SemgrepRule["languages"];
const REQ = ["$REQ.query.$X", "$REQ.body.$X", "$REQ.params.$X"];

export const SEMGREP_RULES: SemgrepRule[] = [
  {
    id: "farbaek.js.shell-from-pieces",
    languages: JS,
    severity: "high",
    title: "A shell command is built from pieces",
    detail: "exec runs its text through a shell. If any piece comes from outside, a crafted value can run other commands.",
    fix: "Use execFile or spawn with the program and its arguments as a list, and no shell.",
    any: [{ pattern: "$CP.exec($A + $B, ...)" }, { pattern: "$CP.execSync($A + $B, ...)" }, { pattern: "exec($A + $B, ...)" }, { pattern: "execSync($A + $B, ...)" }],
  },
  {
    id: "farbaek.js.path-from-request",
    languages: JS,
    severity: "high",
    title: "A file path comes from the request",
    detail: "A value like ../../.env in the request can make the code read or send a file outside the folder it means to use.",
    fix: "Map the value to a known file name, or resolve the path and check it stays inside the intended folder.",
    any: REQ.flatMap((r) => [{ pattern: `$FS.readFile(${r}, ...)` }, { pattern: `$FS.readFileSync(${r}, ...)` }, { pattern: `$RES.sendFile(${r}, ...)` }, { pattern: `$P.join($DIR, ${r})` }]),
  },
  {
    id: "farbaek.js.redirect-from-request",
    languages: JS,
    severity: "medium",
    title: "A redirect goes wherever the request says",
    detail: "An attacker can send people a link to your site that forwards them to a lookalike site (an open redirect).",
    fix: "Redirect only to paths on your own site, or to a list of allowed addresses.",
    any: [...REQ.map((r) => ({ pattern: `$RES.redirect(${r})` })), { pattern: "redirect($U.searchParams.get(...))" }, { pattern: "$RES.redirect($U.searchParams.get(...))" }],
  },
  {
    id: "farbaek.js.fetch-from-request",
    languages: JS,
    severity: "medium",
    title: "The server fetches an address from the request",
    detail: "A crafted address can make your server call internal services or cloud metadata (server-side request forgery).",
    fix: "Fetch only from addresses you list, and refuse private and local network addresses.",
    any: [...REQ.map((r) => ({ pattern: `fetch(${r}, ...)` })), ...REQ.map((r) => ({ pattern: `axios.get(${r}, ...)` })), { pattern: "fetch($U.searchParams.get(...), ...)" }],
  },
  {
    id: "farbaek.js.tls-off",
    languages: JS,
    severity: "high",
    title: "Certificate checks are turned off",
    detail: "Without certificate checks, anyone on the network path can read and change the traffic.",
    fix: "Remove the setting. If a server uses a private certificate authority, trust that authority instead.",
    any: [{ regex: "rejectUnauthorized\\s*:\\s*false" }, { regex: "NODE_TLS_REJECT_UNAUTHORIZED\\s*=\\s*[\"']?0" }],
  },
  {
    id: "farbaek.js.mass-assignment",
    languages: JS,
    severity: "medium",
    title: "The whole request body is saved",
    detail: "Saving every field a request sends lets people set fields they shouldn't, such as a role or a price.",
    fix: "Pick the fields you accept, ideally through a schema, before saving.",
    any: [{ pattern: "$M.create($REQ.body)" }, { pattern: "$M.update($REQ.body)" }, { pattern: "$M.insert($REQ.body)" }, { pattern: "Object.assign($X, $REQ.body)" }],
  },
  {
    id: "farbaek.js.regex-from-request",
    languages: JS,
    severity: "low",
    title: "A regular expression comes from the request",
    detail: "Some patterns take exponential time on crafted input, which can stall the server.",
    fix: "Escape the value before using it in a pattern, or match it as plain text.",
    any: REQ.map((r) => ({ pattern: `new RegExp(${r}, ...)` })),
  },
  {
    id: "farbaek.js.random-token",
    languages: JS,
    severity: "low",
    title: "Math.random makes an identifier",
    detail: "Math.random is predictable, so values made from it can be guessed if they're used as tokens or secrets.",
    fix: "Use crypto.randomUUID() or crypto.getRandomValues() for anything that must not be guessed.",
    any: [{ pattern: "Math.random().toString(...)" }],
  },
  {
    id: "farbaek.js.cookie-script-readable",
    languages: JS,
    severity: "low",
    title: "A cookie is readable from scripts",
    detail: "A cookie without httpOnly can be read by any script on the page, including one injected by an attacker.",
    fix: "Set httpOnly: true on cookies that scripts don't need, especially session cookies.",
    any: [{ regex: "httpOnly\\s*:\\s*false" }],
  },
  {
    id: "farbaek.py.shell-true",
    languages: PY,
    severity: "high",
    title: "A command runs through a shell",
    detail: "With shell=True or os.system, any outside value in the command can run other commands.",
    fix: "Pass the program and its arguments as a list, without shell=True.",
    any: [{ pattern: "subprocess.$F(..., shell=True, ...)" }, { pattern: "os.system($X)" }, { pattern: "os.popen($X)" }],
    not: ['os.system("...")', 'os.popen("...")'],
  },
  {
    id: "farbaek.py.unsafe-deserialize",
    languages: PY,
    severity: "medium",
    title: "Data is loaded in a way that can run code",
    detail: "pickle and yaml.load without a safe loader can run code that's hidden in the data.",
    fix: "Use JSON, or yaml.safe_load, for anything that comes from outside.",
    any: [{ pattern: "pickle.loads(...)" }, { pattern: "pickle.load(...)" }, { pattern: "yaml.load(...)" }, { pattern: "yaml.unsafe_load(...)" }],
    not: ["yaml.load(..., Loader=yaml.SafeLoader, ...)", "yaml.load(..., Loader=SafeLoader, ...)"],
  },
  {
    id: "farbaek.py.tls-off",
    languages: PY,
    severity: "high",
    title: "Certificate checks are turned off",
    detail: "Without certificate checks, anyone on the network path can read and change the traffic.",
    fix: "Remove verify=False. If a server uses a private certificate authority, pass its bundle as verify.",
    any: [{ pattern: "requests.$M(..., verify=False, ...)" }, { pattern: "httpx.$M(..., verify=False, ...)" }],
  },
  {
    id: "farbaek.py.eval",
    languages: PY,
    severity: "medium",
    title: "Text is run as code",
    detail: "eval and exec run whatever string they receive. If that string can be influenced from outside, an attacker can run code.",
    fix: "Replace it with code that doesn't evaluate strings, for example json.loads or ast.literal_eval for data.",
    any: [{ pattern: "eval($X)" }, { pattern: "exec($X)" }],
    not: ['eval("...")', 'exec("...")'],
  },
  {
    id: "farbaek.py.flask-debug",
    languages: PY,
    severity: "low",
    title: "The app runs in debug mode",
    detail: "Flask's debugger lets anyone who can trigger an error run code on the server.",
    fix: "Turn debug off for anything that's deployed, for example from an environment variable.",
    any: [{ pattern: "$APP.run(..., debug=True, ...)" }],
  },
];

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const SEMGREP_SEVERITY: Record<Severity, string> = { critical: "ERROR", high: "ERROR", medium: "WARNING", low: "INFO", info: "INFO" };

/** The ruleset as Semgrep YAML. Every pattern is single-quoted, so nothing in it is read as YAML syntax. */
export function semgrepRulesYaml(rules: readonly SemgrepRule[] = SEMGREP_RULES): string {
  const out = ["rules:"];
  for (const r of rules) {
    out.push(`  - id: ${r.id}`, `    languages: [${r.languages.join(", ")}]`, `    severity: ${SEMGREP_SEVERITY[r.severity]}`, `    message: ${quote(r.title)}`, "    patterns:", "      - pattern-either:");
    for (const a of r.any) out.push("pattern" in a ? `          - pattern: ${quote(a.pattern)}` : `          - pattern-regex: ${quote(a.regex)}`);
    for (const n of r.not ?? []) out.push(`      - pattern-not: ${quote(n)}`);
  }
  return `${out.join("\n")}\n`;
}

/**
 * Runs in the sandbox: reads one tool's JSON and prints only rule or type,
 * file and line, at most 500 of them, plus the tool's exit code and the end
 * of its error output when it failed. Matched source text never leaves.
 */
export const COMPACT_SCRIPT = `import json, sys
kind, src, code, err = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
def tail(path):
    try:
        lines = [l.strip() for l in open(path, encoding="utf-8", errors="replace").read().splitlines() if l.strip()]
        return lines[-1][:200] if lines else ""
    except Exception:
        return ""
try:
    data = json.load(open(src, encoding="utf-8"))
except Exception:
    print(json.dumps({"ok": False, "exit": code, "error": tail(err) or "The tool wrote no readable report."}))
    sys.exit(0)
if kind == "semgrep":
    found = [{"rule": r.get("check_id", ""), "path": r.get("path", ""), "line": (r.get("start") or {}).get("line")} for r in data.get("results", [])]
    errors = [str(e.get("message") or e.get("type") or "")[:200] for e in data.get("errors", []) if e.get("level", "error") == "error"]
    scanned = len((data.get("paths") or {}).get("scanned", []))
    print(json.dumps({"ok": True, "exit": code, "version": data.get("version"), "results": found[:500], "total": len(found), "errors": errors[:5], "scanned": scanned}))
else:
    found = [{"rule": s.get("type", ""), "path": p, "line": s.get("line_number")} for p, items in (data.get("results") or {}).items() for s in items]
    print(json.dumps({"ok": True, "exit": code, "version": data.get("version"), "results": found[:500], "total": len(found)}))
`;

const VENV = "/tmp/farbaek-scan-env";

/** Installs both scanners into a throwaway virtual environment, outside the project folder. */
export const STATIC_SCAN_INSTALL = `python3 -m venv ${VENV} && ${VENV}/bin/python -m pip install --quiet --disable-pip-version-check --no-input semgrep==${SEMGREP_VERSION} detect-secrets==${DETECT_SECRETS_VERSION}`;

export const SEMGREP_COMMAND =
  `${VENV}/bin/semgrep scan --config ${SCAN_DIR}/semgrep.yml --json --metrics=off --disable-version-check --timeout 20 --max-target-bytes 524288 ` +
  `--exclude ${SCAN_DIR} --exclude node_modules --exclude '*.test.*' --exclude '*.spec.*' . > /tmp/farbaek-semgrep.json 2> /tmp/farbaek-semgrep.err; ` +
  `${VENV}/bin/python ${SCAN_DIR}/compact.py semgrep /tmp/farbaek-semgrep.json $? /tmp/farbaek-semgrep.err`;

// Entropy detectors are off: lockfile hashes and build ids flood them. Lockfiles are left out for the same reason.
export const SECRETS_COMMAND =
  `${VENV}/bin/detect-secrets scan --all-files --disable-plugin Base64HighEntropyString --disable-plugin HexHighEntropyString ` +
  `--exclude-files '(^|/)(${SCAN_DIR.replace(".", "\\.")}|node_modules|\\.git)/|(package-lock\\.json|pnpm-lock\\.yaml|yarn\\.lock|poetry\\.lock)$' . > /tmp/farbaek-secrets.json 2> /tmp/farbaek-secrets.err; ` +
  `${VENV}/bin/python ${SCAN_DIR}/compact.py secrets /tmp/farbaek-secrets.json $? /tmp/farbaek-secrets.err`;

type Compact = { ok: true; exit: number; version?: string | null; results: { rule: string; path: string; line: number | null }[]; total: number; errors?: string[]; scanned?: number } | { ok: false; exit: number; error: string };

function readCompact(stdout: string): Compact | null {
  const line = stdout.trim().split(/\r?\n/).pop() ?? "";
  try {
    const v = JSON.parse(line) as Compact;
    return v && typeof v === "object" && "ok" in v ? v : null;
  } catch {
    return null;
  }
}

const cleanPath = (p: string) => p.replace(/^\.\//, "");

export type ScanParse = { ok: true; findings: Finding[]; total: number; detail: string } | { ok: false; reason: string };

/** Semgrep's compacted report as findings, with Farbaek's words for each rule. */
export function parseSemgrep(stdout: string, rules: readonly SemgrepRule[] = SEMGREP_RULES): ScanParse {
  const c = readCompact(stdout);
  if (!c) return { ok: false, reason: "Semgrep didn't produce a report Farbaek could read." };
  if (!c.ok) return { ok: false, reason: `Semgrep didn't finish: ${c.error}` };
  // Exit 0 is a clean run; anything else, with no results, means the run failed.
  if (c.exit !== 0 && c.results.length === 0) return { ok: false, reason: `Semgrep stopped (exit ${c.exit})${c.errors?.[0] ? `: ${c.errors[0]}` : "."}` };
  const findings = c.results.flatMap((r) => {
    // Semgrep may prefix a local rule's id with its file's folders.
    const rule = rules.find((x) => r.rule === x.id || r.rule.endsWith(`.${x.id}`));
    return rule ? [{ id: "", rule: rule.id, severity: rule.severity, source: "sast" as const, title: rule.title, detail: rule.detail, fix: rule.fix, file: cleanPath(r.path), line: r.line ?? null }] : [];
  });
  const skipped = c.errors?.length ? ` ${c.errors.length} ${c.errors.length === 1 ? "file" : "files"} couldn't be parsed.` : "";
  return { ok: true, findings, total: c.total, detail: `Semgrep ${c.version ?? SEMGREP_VERSION} with Farbaek's ${rules.length} rules${c.scanned ? ` over ${c.scanned} files` : ""}.${skipped}` };
}

const SECRET_SEVERITY = (type: string): Severity => (/private key/i.test(type) ? "critical" : /keyword|jwt|basic auth/i.test(type) ? "medium" : "high");

/** detect-secrets' compacted report as findings. The secret itself is never part of it. */
export function parseSecrets(stdout: string): ScanParse {
  const c = readCompact(stdout);
  if (!c) return { ok: false, reason: "detect-secrets didn't produce a report Farbaek could read." };
  if (!c.ok) return { ok: false, reason: `detect-secrets didn't finish: ${c.error}` };
  if (c.exit !== 0) return { ok: false, reason: `detect-secrets stopped (exit ${c.exit}).` };
  const findings = c.results.map((r) => ({
    id: "",
    rule: `secret:${r.rule.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 80),
    severity: SECRET_SEVERITY(r.rule),
    source: "secrets" as const,
    title: `A secret may be in the code: ${r.rule}`,
    detail: "Anyone who can read this file, its history or a build made from it can use the secret.",
    fix: "Move it to an environment variable or secret store, then revoke it and issue a new one, since it has already been exposed.",
    file: cleanPath(r.path),
    line: r.line ?? null,
  }));
  return { ok: true, findings, total: c.total, detail: `detect-secrets ${c.version ?? DETECT_SECRETS_VERSION}, entropy checks off.` };
}

/** Drops findings at a file and line another check already reported, so one problem isn't counted twice. */
export function withoutRepeats(existing: readonly Pick<Finding, "file" | "line">[], next: readonly Finding[]): Finding[] {
  const seen = new Set(existing.filter((f) => f.file && f.line).map((f) => `${f.file}:${f.line}`));
  return next.filter((f) => !(f.file && f.line && seen.has(`${f.file}:${f.line}`)));
}
