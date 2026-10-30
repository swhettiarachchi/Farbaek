/**
 * Mutation trials (ADR 0136, spec §10 "Test integrity"): how well a
 * project's tests catch small mistakes in the lines a change adds. Farbaek
 * makes a few mutants with its own small set of operators (flipped
 * comparisons and booleans, swapped logic and arithmetic) on added lines
 * only, and runs the tests related to the changed files once per mutant in
 * a disposable sandbox. A caught mutant made a test fail; a surviving one
 * didn't. The score covers these mutants only: it is not overall quality.
 */
import type { LabFramework } from "./failure-futures";

export type MutationOperator = "equality" | "relational" | "logical" | "boolean" | "arithmetic";

export interface Mutant {
  id: string;
  path: string;
  line: number;
  /** 0-based position of `original` in the line. */
  column: number;
  operator: MutationOperator;
  original: string;
  replacement: string;
  /** The line before and after, trimmed, for people to read. */
  before: string;
  after: string;
}

export const MUTATION_OPERATOR_WORDS: Record<MutationOperator, string> = {
  equality: "Flipped an equality check",
  relational: "Moved a comparison's boundary",
  logical: "Swapped and with or",
  boolean: "Flipped a true or false",
  arithmetic: "Swapped an arithmetic operator",
};

const CODE = /\.(m?[jt]sx?|cjs|py)$/i;
const TEST_FILE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]*\.py$|_test\.py$/i;
const SKIP_LINE = /^\s*(import\b|export\s+(type|interface)\b|type\s+\w+\s*=|interface\b|from\s+\S+\s+import\b|@|\*|\/\*)/;

/** The line with string contents and comments blanked out, so positions stay the same. */
export function codeOnly(line: string, python: boolean): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === "\\") {
        out += "  ";
        i++;
        continue;
      }
      if (c === quote) quote = null;
      out += quote ? " " : c;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if ((!python && c === "/" && line[i + 1] === "/") || (python && c === "#")) return out + " ".repeat(line.length - i);
    out += c;
  }
  return out;
}

type Rule = { operator: MutationOperator; find: RegExp; to: (m: string) => string; python?: boolean; js?: boolean };

// Spaced operators only, so TypeScript generics (Array<string>) and arrows (=>) are left alone.
const RULES: Rule[] = [
  { operator: "equality", find: /(?<=\s)(===|!==|==|!=)(?=\s)/g, to: (m) => ({ "===": "!==", "!==": "===", "==": "!=", "!=": "==" })[m]! },
  { operator: "relational", find: /(?<=\s)(<=|>=|<|>)(?=\s)/g, to: (m) => ({ "<=": "<", ">=": ">", "<": "<=", ">": ">=" })[m]! },
  { operator: "logical", find: /(?<=\s)(&&|\|\|)(?=\s)/g, to: (m) => (m === "&&" ? "||" : "&&"), js: true },
  { operator: "logical", find: /(?<=\s)(and|or)(?=\s)/g, to: (m) => (m === "and" ? "or" : "and"), python: true },
  { operator: "boolean", find: /\b(true|false)\b/g, to: (m) => (m === "true" ? "false" : "true"), js: true },
  { operator: "boolean", find: /\b(True|False)\b/g, to: (m) => (m === "True" ? "False" : "True"), python: true },
  { operator: "arithmetic", find: /(?<=\s)([+\-*/])(?=\s)/g, to: (m) => ({ "+": "-", "-": "+", "*": "/", "/": "*" })[m]! },
];

/** Every mutant one line allows, in reading order. */
export function lineMutants(path: string, lineNo: number, line: string): Mutant[] {
  if (SKIP_LINE.test(line)) return [];
  const python = /\.py$/i.test(path);
  const code = codeOnly(line, python);
  const found: Mutant[] = [];
  for (const rule of RULES) {
    if ((rule.python && !python) || (rule.js && python)) continue;
    for (const m of code.matchAll(rule.find)) {
      const column = m.index!;
      const original = m[0];
      const replacement = rule.to(original);
      const after = line.slice(0, column) + replacement + line.slice(column + original.length);
      found.push({ id: `${path}:${lineNo}:${column}`, path, line: lineNo, column, operator: rule.operator, original, replacement, before: line.trim().slice(0, 200), after: after.trim().slice(0, 200) });
    }
  }
  return found.sort((a, b) => a.column - b.column);
}

/**
 * Up to `max` mutants across the lines a change adds to source files: the
 * first on each line, line by line, then the second, and so on, so the
 * trial covers as many lines as it can.
 */
export function planMutants(changes: readonly { path: string; content: string; before: string | null }[], max = 8): Mutant[] {
  const perLine: Mutant[][] = [];
  for (const change of changes) {
    if (!CODE.test(change.path) || TEST_FILE.test(change.path)) continue;
    const lines = change.content.split(/\r?\n/);
    const had = change.before === null ? null : new Set(change.before.split(/\r?\n/).map((l) => l.trim()));
    lines.forEach((line, i) => {
      if (!line.trim() || (had && had.has(line.trim()))) return;
      const m = lineMutants(change.path, i + 1, line);
      if (m.length) perLine.push(m);
    });
  }
  const picked: Mutant[] = [];
  for (let round = 0; picked.length < max && perLine.some((l) => l.length > round); round++) {
    for (const l of perLine) {
      if (picked.length >= max) break;
      if (l[round]) picked.push(l[round]!);
    }
  }
  return picked;
}

export interface ExcerptLine {
  head: string;
  changed: string;
  tail: string;
}

/**
 * A short window of the line around the change, before and after, so the
 * mistake shows even on a narrow screen. `clipped` says text was left out
 * before the window, `more` after it.
 */
export function mutantExcerpt(m: Pick<Mutant, "before" | "after" | "original" | "replacement">, context = 20, width = 60): { clipped: boolean; more: boolean; before: ExcerptLine; after: ExcerptLine } {
  let d = 0;
  while (d < m.before.length && m.before[d] === m.after[d]) d++;
  const at = Math.max(0, m.before.lastIndexOf(m.original, d));
  const start = Math.max(0, at - context);
  const end = Math.max(at + m.original.length, start + width);
  const line = (text: string, token: string): ExcerptLine => ({ head: text.slice(start, at), changed: token, tail: text.slice(at + token.length, end + (token.length - m.original.length)) });
  return { clipped: start > 0, more: m.before.length > end, before: line(m.before, m.original), after: line(m.after, m.replacement) };
}

/** The file with one mutant applied, or null when the file no longer has the original at that place. */
export function applyMutant(content: string, m: Mutant): string | null {
  const lines = content.split("\n");
  const raw = lines[m.line - 1];
  if (raw === undefined || raw.slice(m.column, m.column + m.original.length) !== m.original) return null;
  lines[m.line - 1] = raw.slice(0, m.column) + m.replacement + raw.slice(m.column + m.original.length);
  return lines.join("\n");
}

/** The tests related to the changed files, stopping at the first failure. */
export function mutationCommand(framework: LabFramework, paths: readonly string[]): string {
  const files = paths.join(" ");
  if (framework === "vitest") return `npx --no-install vitest related --run --bail=1 ${files}`;
  if (framework === "jest") return `npx --no-install jest --ci --bail --findRelatedTests ${files}`;
  return "python3 -m pytest -q -x -p no:cacheprovider";
}

export type MutantResult = "killed" | "survived" | "timed_out" | "not_viable" | "not_run";

const DIDNT_LOAD =
  /Failed to (load|resolve|parse)|Transform failed|SyntaxError|Cannot find (module|package)|ERR_MODULE_NOT_FOUND|error TS\d+|Test suite failed to run|ModuleNotFoundError|ImportError|ERROR collecting/i;
const RAN: Record<LabFramework, RegExp> = { vitest: /Tests?\s+\d+ passed/, jest: /Tests:\s+.*\d+ passed/, pytest: /\b\d+ passed\b/ };

/** Whether the unmutated run is a fair baseline: it ran tests and they passed. */
export function baselineProblem(input: { framework: LabFramework; state: string; exitCode: number | null; output: string }): string | null {
  if (input.state === "timed_out") return "The tests took longer than the limit without any mutant, so mutants couldn't be judged.";
  if (input.exitCode !== 0) {
    if (/No test files found|no tests ran|collected 0 items/i.test(input.output)) return "No tests cover the changed files, so every mutant would survive. Add tests first.";
    return "The tests fail without any mutant, so mutants couldn't be judged. Fix the failing tests first.";
  }
  if (!RAN[input.framework].test(input.output)) return "No tests ran for the changed files, so mutants couldn't be judged.";
  return null;
}

/** What one mutant's run showed. A run that didn't load says nothing about the tests. */
export function classifyMutantRun(input: { state: string; exitCode: number | null; output: string }): { result: MutantResult; failingTest: string | null } {
  if (input.state === "timed_out") return { result: "timed_out", failingTest: null };
  if (input.exitCode === null) return { result: "not_run", failingTest: null };
  if (input.exitCode === 0) return { result: "survived", failingTest: null };
  if (DIDNT_LOAD.test(input.output)) return { result: "not_viable", failingTest: null };
  const failing = input.output.match(/^\s*(?:FAIL|×|✕|FAILED)\s+(.+)$/m)?.[1]?.trim() ?? null;
  return { result: "killed", failingTest: failing ? failing.slice(0, 200) : null };
}

export interface MutantOutcome extends Mutant {
  result: MutantResult;
  durationMs: number | null;
  failingTest: string | null;
}

/** Caught out of judged: a mutant that timed out counts as caught, as most mutation tools count it. */
export function mutationSummary(outcomes: readonly Pick<MutantOutcome, "result">[]) {
  const count = (r: MutantResult) => outcomes.filter((o) => o.result === r).length;
  const caught = count("killed") + count("timed_out");
  const judged = caught + count("survived");
  return { caught, survived: count("survived"), notViable: count("not_viable"), notRun: count("not_run"), judged, score: judged > 0 ? caught / judged : null };
}

/** How long one mutant's run may take: about three times the clean run, within limits. */
export const mutantTimeoutSeconds = (baselineMs: number | null) => Math.max(30, Math.min(180, Math.ceil(((baselineMs ?? 30_000) * 3) / 1000) + 20));

export const MUTATION_MAX = 8;
export const MUTATION_BUDGET_MS = 12 * 60_000;
