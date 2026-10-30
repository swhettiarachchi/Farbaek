/**
 * The Failure Futures Lab (ADR 0135, spec §10): failure scenarios derived
 * from what a proposed change actually adds, each one hypothetical until a
 * person tries it. A trial runs one AI-written test that simulates the
 * failure, with the proposal's files, in a disposable sandbox; what it
 * observed is recorded as reproduced, handled or inconclusive, never more.
 */
import { z } from "zod";

/** In the spec's order of priority. Deploy and rollback failures are the Reversibility Radar's (ADR 0122). */
export const FAILURE_KINDS = [
  "duplicate_delivery",
  "out_of_order",
  "timeout",
  "rate_limit",
  "concurrency",
  "partial_db_failure",
  "expired_credentials",
  "permission_denied",
  "malformed_input",
  "empty_input",
  "timezone_boundary",
  "retry_loop",
  "incompatible_api",
  "missing_config",
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export const FAILURE_INFO: Record<FailureKind, { title: string; risk: string; trial: string }> = {
  duplicate_delivery: {
    title: "The same webhook arrives twice",
    risk: "Providers retry deliveries, so one event can be processed twice: a double charge, credit or email.",
    trial: "Deliver one event twice and check its effect happens once.",
  },
  out_of_order: {
    title: "Webhooks arrive out of order",
    risk: "A later event can arrive before an earlier one and be overwritten by it.",
    trial: "Deliver two events newest first and check the final state matches the newest.",
  },
  timeout: {
    title: "A call never answers",
    risk: "A network call without a time limit can hold a request, or a whole worker, until the platform kills it.",
    trial: "Make the call hang and check the code gives up and reports it.",
  },
  rate_limit: {
    title: "A service answers 429, too many requests",
    risk: "A rate-limited call that's treated as success, or retried at once, loses data or makes the limit worse.",
    trial: "Answer 429 and check the code reports it or waits before trying again.",
  },
  concurrency: {
    title: "Two requests change the same thing at once",
    risk: "A read followed by a write can lose an update when two requests interleave.",
    trial: "Run two updates at the same time and check neither is lost.",
  },
  partial_db_failure: {
    title: "A database write fails halfway",
    risk: "When the second of two writes fails, the first can stay behind and leave the data inconsistent.",
    trial: "Fail a later write and check the earlier one is undone or the error is reported.",
  },
  expired_credentials: {
    title: "A key or token has expired",
    risk: "An expired credential returns 401, and code that doesn't expect it can fail silently or crash.",
    trial: "Answer 401 to the authenticated call and check the code reports it clearly.",
  },
  permission_denied: {
    title: "Someone without permission tries it",
    risk: "A missing or wrong permission check lets the wrong person through, or fails without a reason.",
    trial: "Call it as someone without the permission and check it's refused.",
  },
  malformed_input: {
    title: "The input is malformed",
    risk: "Parsing input that isn't what's expected can throw where nothing catches it.",
    trial: "Send malformed input and check it's refused with a clear error.",
  },
  empty_input: {
    title: "The input is empty",
    risk: "An empty body, list or field can slip past checks written for real values.",
    trial: "Send empty input and check it's refused or handled.",
  },
  timezone_boundary: {
    title: "A date falls on a timezone boundary",
    risk: "Dates near midnight, month ends or daylight saving changes can land on the wrong day.",
    trial: "Set the clock just before midnight UTC and check the date the code produces.",
  },
  retry_loop: {
    title: "A retry never stops",
    risk: "A retry without a limit or a growing delay can loop forever or hammer a failing service.",
    trial: "Make every attempt fail and check the retries stop.",
  },
  incompatible_api: {
    title: "An API answers in a shape the code doesn't expect",
    risk: "A provider's new version can rename or drop fields, and the code reads undefined.",
    trial: "Answer with a missing field and check the code notices instead of using undefined.",
  },
  missing_config: {
    title: "A setting is missing",
    risk: "An environment variable that isn't set reads as undefined, often far from where it's used.",
    trial: "Leave the variable unset and check the code fails clearly at the start.",
  },
};

export interface FailureEvidence {
  path: string;
  line: number;
  snippet: string;
}

export interface FailureFuture {
  kind: FailureKind;
  title: string;
  risk: string;
  trial: string;
  /** Lines this change adds that suggested the scenario, at most 3. */
  evidence: FailureEvidence[];
}

const CODE = /\.(m?[jt]sx?|cjs|py)$/i;
const TEST_FILE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]*\.py$|_test\.py$/i;

/** Line numbers (1-based) of the lines a change adds: every line of a new file, or lines the old file didn't have. */
export function addedLines(before: string | null, after: string): number[] {
  const lines = after.split(/\r?\n/);
  if (before === null) return lines.map((_, i) => i + 1);
  const had = new Set(before.split(/\r?\n/).map((l) => l.trim()));
  return lines.flatMap((l, i) => (l.trim() && !had.has(l.trim()) ? [i + 1] : []));
}

type Detector = { kind: FailureKind; line: RegExp; file?: RegExp; unless?: RegExp };

/** Each signal is a pattern on an added line; `file` must also match somewhere in the file, `unless` must not. */
const DETECTORS: Detector[] = [
  { kind: "duplicate_delivery", line: /webhook|svix|stripe-signature|webhook-(id|signature)|x-hub-signature/i },
  { kind: "out_of_order", line: /webhook|svix|webhook-(id|timestamp)/i },
  { kind: "timeout", line: /\bfetch\(|\baxios[.(]|\bgot\(|requests\.(get|post|put|patch|delete)\(|httpx\.|urlopen\(/, unless: /AbortSignal\.timeout|\btimeout\s*[:=]|signal\s*:/ },
  { kind: "rate_limit", line: /\bfetch\(|\baxios[.(]|\bgot\(|requests\.(get|post|put|patch|delete)\(|httpx\./, unless: /\b429\b|retry-after|rate.?limit/i },
  // A write in a file that also reads (read, then write), or work started side by side.
  { kind: "concurrency", line: /\.(update|upsert)\(|\bUPDATE\s+\w+\s+SET\b|\.save\(\)/, file: /\.select\(|\bfind(Unique|First|One)\(|\bSELECT\b/ },
  { kind: "concurrency", line: /Promise\.all\(|asyncio\.gather\(/ },
  { kind: "partial_db_failure", line: /\.(insert|update|upsert|delete)\(|\.rpc\(|\bprisma\.\w+\.(create|update|delete)|\bINSERT\s+INTO\b|\.execute\(|session\.commit\(/, unless: /\btransaction\b|\$transaction|\bBEGIN\b/i },
  { kind: "expired_credentials", line: /process\.env\.[A-Z0-9_]*(KEY|TOKEN|SECRET)\b|os\.environ.*(KEY|TOKEN|SECRET)|\bAuthorization\b|Bearer\s/ },
  { kind: "permission_denied", line: /\b(401|403)\b|forbidden|unauthori[sz]ed|\brequire(Role|Auth|Admin|Permission)\b|\bisAdmin\b|\bpermissions?\b/i },
  { kind: "malformed_input", line: /JSON\.parse\(|\.json\(\)|request\.get_json\(|json\.loads\(|\bparseInt\(|\bparseFloat\(|\bNumber\(|searchParams\.get\(|formData\(\)/ },
  { kind: "empty_input", line: /\breq(uest)?\.body\b|\.json\(\)|formData\(\)|searchParams\.get\(|request\.(form|args|get_json)/ },
  { kind: "timezone_boundary", line: /new Date\(|Date\.now\(|\.get(UTC)?(Hours|Date|Day)\(|\.set(UTC)?(Hours|Date)\(|toLocale(Date|Time)?String|Intl\.DateTimeFormat|datetime\.(now|utcnow|today)|\bdayjs\(|\bmoment\(|date-fns/ },
  { kind: "retry_loop", line: /\bretr(y|ies)\b|\battempts?\b|\bbackoff\b|while\s*\(\s*true\s*\)|while True:|setInterval\(/i },
  { kind: "incompatible_api", line: /https?:\/\/[^\s'"`]*\/v\d+\b|\bapi[-_]?version\b/i },
  { kind: "missing_config", line: /process\.env\.[A-Za-z0-9_]+\b(?!\s*(\?\?|\|\|))|os\.environ\[/ },
];

/**
 * Scenarios suggested by the code a change adds, in the spec's order, at most
 * `max`. Only source files count; tests, lockfiles and docs don't.
 */
export function suggestFailureFutures(changes: readonly { path: string; content: string; before: string | null }[], max = 6): FailureFuture[] {
  const found = new Map<FailureKind, FailureEvidence[]>();
  for (const change of changes) {
    if (!CODE.test(change.path) || TEST_FILE.test(change.path)) continue;
    const lines = change.content.split(/\r?\n/);
    const added = addedLines(change.before, change.content);
    for (const d of DETECTORS) {
      if (d.file && !d.file.test(change.content)) continue;
      if (d.unless && d.unless.test(change.content)) continue;
      const at = added.find((n) => d.line.test(lines[n - 1] ?? ""));
      if (at === undefined) continue;
      const list = found.get(d.kind) ?? [];
      if (list.length < 3) list.push({ path: change.path, line: at, snippet: (lines[at - 1] ?? "").trim().slice(0, 160) });
      found.set(d.kind, list);
    }
  }
  return FAILURE_KINDS.filter((k) => found.has(k))
    .slice(0, max)
    .map((kind) => ({ kind, ...FAILURE_INFO[kind], evidence: found.get(kind)! }));
}

export type LabFramework = "vitest" | "jest" | "pytest";

export interface LabRunner {
  framework: LabFramework;
  /** Where the trial's test goes: beside the first file the scenario came from, so the project's own test settings find it. */
  testPath: string;
  command: string;
}

/** The files a trial's runner is chosen from. */
export const LAB_MANIFESTS = ["package.json", "requirements.txt", "requirements-dev.txt", "pyproject.toml"] as const;

export const LAB_NO_RUNNER =
  "Farbaek tries failures with the project's own test runner: Vitest, Jest or pytest. This project has none, so its scenarios stay hypothetical.";

const deps = (manifest: string | null): Set<string> => {
  try {
    const m = JSON.parse(manifest ?? "") as Record<string, unknown>;
    return new Set(["dependencies", "devDependencies"].flatMap((k) => Object.keys((m[k] as Record<string, string> | undefined) ?? {})));
  } catch {
    return new Set();
  }
};

/** The project's own test runner for a source file: pytest for Python, Vitest or Jest from package.json; null when it has none. */
export function testFramework(sourcePath: string, read: (path: string) => string | null): LabFramework | null {
  if (/\.py$/i.test(sourcePath)) {
    const python = ["requirements.txt", "requirements-dev.txt", "pyproject.toml"].map(read).join("\n");
    return /\bpytest\b/i.test(python) ? "pytest" : null;
  }
  const installed = deps(read("package.json"));
  return installed.has("vitest") ? "vitest" : installed.has("jest") ? "jest" : null;
}

/** The project's test runner and the trial's test file, or the reason a trial can't run. */
export function labRunner(kind: FailureKind, evidence: FailureEvidence, paths: readonly string[], read: (path: string) => string | null): { ok: true; runner: LabRunner } | { ok: false; reason: string } {
  const dir = evidence.path.includes("/") ? evidence.path.slice(0, evidence.path.lastIndexOf("/") + 1) : "";
  const file = evidence.path.slice(dir.length);
  const stem = file.replace(/\.[^.]+$/, "");
  const taken = new Set(paths);
  const free = (make: (n: string) => string) => {
    for (const n of ["", "-2", "-3", "-4"]) if (!taken.has(make(n))) return make(n);
    return null;
  };
  const framework = testFramework(evidence.path, read);
  if (!framework) return { ok: false, reason: LAB_NO_RUNNER };
  if (framework === "pytest") {
    const testPath = free((n) => `${dir}test_failure_${kind}_${stem}${n.replace("-", "_")}.py`);
    return testPath ? { ok: true, runner: { framework: "pytest", testPath, command: `python3 -m pytest -q -p no:cacheprovider ${testPath}` } } : { ok: false, reason: "The test file's name is taken." };
  }
  const ext = (file.match(/\.(m?[jt]sx?|cjs)$/i)?.[1] ?? "ts").toLowerCase();
  const testPath = free((n) => `${dir}${stem}.failure-${kind.replace(/_/g, "-")}${n}.test.${ext}`);
  if (!testPath) return { ok: false, reason: "The test file's name is taken." };
  // --no-install: the runner comes from the project's own packages, never a download.
  return { ok: true, runner: { framework, testPath, command: framework === "vitest" ? `npx --no-install vitest run ${testPath}` : `npx --no-install jest --ci ${testPath}` } };
}

export type LabOutcome = "reproduced" | "handled" | "inconclusive";

const DIDNT_LOAD =
  /No test files found|Failed to (load|resolve|parse)|Transform failed|SyntaxError|Cannot find (module|package)|ERR_MODULE_NOT_FOUND|error TS\d+|Test suite failed to run|ModuleNotFoundError|ImportError|ERROR collecting|no tests ran|collected 0 items/i;
const RAN: Record<LabFramework, RegExp> = { vitest: /Tests?\s+\d+ passed/, jest: /Tests:\s+.*\d+ passed/, pytest: /\b\d+ passed\b/ };

/** What one trial observed, from its exit and output. A test that didn't load or didn't finish proves nothing. */
export function classifyLabRun(input: { framework: LabFramework; state: string; exitCode: number | null; output: string }): { outcome: LabOutcome; reason: string } {
  if (input.state === "timed_out") return { outcome: "inconclusive", reason: "It ran past the time limit. A hang can be the failure itself or a fault in the test; read the output." };
  if (input.exitCode === null) return { outcome: "inconclusive", reason: "The test didn't finish, so nothing was observed." };
  if (DIDNT_LOAD.test(input.output)) return { outcome: "inconclusive", reason: "The test couldn't load, so the failure wasn't tried. The AI-written test may be wrong." };
  if (input.exitCode === 0) {
    return RAN[input.framework].test(input.output)
      ? { outcome: "handled", reason: "The test simulated the failure and the code behaved as expected." }
      : { outcome: "inconclusive", reason: "The runner finished without reporting a passing test." };
  }
  return { outcome: "reproduced", reason: "The test simulated the failure and the code didn't behave as expected. Read the test to judge whether it's fair." };
}

/** The end of a run's output, enough to see why. */
export const outputTail = (stdout: string, stderr: string, max = 4_000): string => {
  const both = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return both.length > max ? `…${both.slice(-(max - 1))}` : both;
};

export const MANUAL_FAILURE_TEST = "Write a test that simulates this failure yourself and run it with the project's test runner.";

export const LAB_TEST_MAX = 20_000;

/** What the AI writes for one trial. Farbaek picks the file's path; the AI writes only its content. */
export const FailureTestOutputSchema = z.object({
  test: z.string().max(LAB_TEST_MAX).describe("The complete test file. Empty when the scenario can't be simulated here."),
  expects: z.string().max(500).describe("In one sentence, what the test expects the code to do under this failure."),
  cannotTest: z.string().max(500).nullable().describe("Why this failure can't be simulated with a test here, or null."),
});
export type FailureTestOutput = z.infer<typeof FailureTestOutputSchema>;

export interface FailureTestRequest {
  scenario: { kind: FailureKind; title: string; trial: string; evidence: FailureEvidence[] };
  framework: LabFramework;
  testPath: string;
  /** Package names the project has; the test may use only these and the language's own modules. */
  packages: string[];
  files: { path: string; content: string }[];
}

export const LAB_FILE_BUDGET = 60_000;

/** The trial's request: the files the scenario came from first, then the rest of the change, within the budget. */
export function failureTestRequest(future: FailureFuture, runner: LabRunner, packages: readonly string[], changed: readonly { path: string; content: string }[]): FailureTestRequest {
  const first = new Set(future.evidence.map((e) => e.path));
  const ordered = [...changed].sort((a, b) => Number(first.has(b.path)) - Number(first.has(a.path)));
  const files: { path: string; content: string }[] = [];
  let used = 0;
  for (const f of ordered) {
    if (used + f.content.length > LAB_FILE_BUDGET) continue;
    files.push({ path: f.path, content: f.content });
    used += f.content.length;
  }
  return {
    scenario: { kind: future.kind, title: future.title, trial: future.trial, evidence: future.evidence },
    framework: runner.framework,
    testPath: runner.testPath,
    packages: [...packages].slice(0, 200),
    files,
  };
}

export const LAB_OUTCOME_WORDS: Record<LabOutcome | "not_testable" | "failed" | "running", { label: string; detail: string }> = {
  running: { label: "Running", detail: "Writing the test and running it in a disposable sandbox." },
  reproduced: { label: "Reproduced", detail: "The failure happened in this trial." },
  handled: { label: "Handled", detail: "The code behaved as expected under this failure, in this trial." },
  inconclusive: { label: "Inconclusive", detail: "Nothing was observed either way." },
  not_testable: { label: "Not testable here", detail: "The AI couldn't simulate this failure with a test." },
  failed: { label: "Didn't run", detail: "The trial stopped before the test ran." },
};
