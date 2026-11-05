/**
 * Continue on my computer (ADR 0139, spec §25): a task handed from a phone or
 * browser to one of the workspace's desktop agents. The desktop runs the
 * listed checks on a copy of the project with the waiting change written in,
 * and reports each command's exit code, time and output hash. The report's
 * digest is the SHA-256 of its RFC 8785 canonical JSON, so it can be checked
 * later. A report from a computer is evidence that computer gave; Farbaek
 * didn't watch it run, and it never verifies a change.
 */
import { z } from "zod";
import { canonicalHash } from "../trust/canonical-json";
import { classifyCommand, programName } from "./commands";

export const HANDOFF_STATUSES = ["waiting", "opened", "done", "failed", "cancelled", "expired"] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export const HANDOFF_MAX_CHECKS = 20;
/** The end of each command's output kept in the report. */
export const HANDOFF_OUTPUT_CHARS = 2_000;

export const HANDOFF_STATUS_WORDS: Record<HandoffStatus, string> = {
  waiting: "Waiting for your computer",
  opened: "Open on your computer",
  done: "Reported",
  failed: "Couldn't run",
  cancelled: "Withdrawn",
  expired: "Lapsed",
};

export type SplitCommand = { ok: true; program: string; args: string[] } | { ok: false; reason: string };

const SHELL = /[|&;<>`$(){}*?!\\]/;

/**
 * A check as a program and its arguments, for the broker that never uses a
 * shell. Plain words and simple quotes only: pipes, redirects, variables and
 * chains are refused with the reason, since they need a shell.
 */
export function splitCheckCommand(text: string): SplitCommand {
  if (text.trim() === "farbaek check-site") return { ok: false, reason: "Farbaek's site check runs only in its test space." };
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const c of text.trim()) {
    if (quote) {
      if (c === quote) quote = null;
      else current += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      started = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (started) words.push(current);
      current = "";
      started = false;
      continue;
    }
    if (SHELL.test(c)) return { ok: false, reason: `"${text}" needs a shell (it uses ${c}), and checks here run without one. List each command on its own.` };
    current += c;
    started = true;
  }
  if (quote) return { ok: false, reason: `"${text}" has a quote that isn't closed.` };
  if (started) words.push(current);
  const [program, ...args] = words;
  if (!program) return { ok: false, reason: "The check is empty." };
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(program)) return { ok: false, reason: `${program} isn't a program name this computer can look up.` };
  return { ok: true, program, args };
}

const NOT_ON_A_COMPUTER = "This isn't a known test or build, so it only runs in a test space.";
const PYTHON_TEST_MODULES = new Set(["pytest", "unittest", "doctest", "compileall", "mypy", "ruff", "black", "flake8", "pylint", "tox", "nox"]);

/** A test or a build in name, but it runs code given right there, or fetches something to run. */
function runsSomethingElse(program: string, args: readonly string[]): boolean {
  const name = programName(program);
  if (name === "node" || name === "deno") return args.some((a) => a === "-e" || a === "-p" || a === "--eval" || a === "--print" || a === "eval" || a.startsWith("--eval=") || a.startsWith("--print="));
  if (name === "python" || name === "python3" || name === "py") {
    if (args.includes("-c")) return true;
    const flag = args.indexOf("-m");
    return flag >= 0 && !PYTHON_TEST_MODULES.has(args[flag + 1] ?? "");
  }
  if (name === "npm" && args[0] === "exec") return true;
  if (name === "bun" && args[0] === "x") return true;
  if ((name === "pnpm" || name === "yarn") && args[0] === "exec") {
    const inner = args[1];
    return !inner || classifyCommand(inner, args.slice(2)) !== "test_build" || runsSomethingElse(inner, args.slice(2));
  }
  return false;
}

/**
 * How a check runs on a person's own computer, or why it doesn't (ADR 0175). Nothing keeps it apart from everything else
 * there, and a plan can list anything, so only what's known to be a test or a build goes. What's classed read-only doesn't:
 * its arguments can read any file, and what it prints goes back to the workspace. The person still sees the list before
 * they start it, so this is a filter and not a boundary.
 */
export function checkForComputer(command: string): { ok: true; program: string; args: string[] } | { ok: false; reason: string } {
  // Every command there already runs with CI=1 (commandEnv), so a plan's own prefix adds nothing.
  const split = splitCheckCommand(command.trim().replace(/^CI=1\s+/, ""));
  if (!split.ok) return split;
  const { program, args } = split;
  const name = programName(program);
  // Only from the project's own packages, never one downloaded for the occasion.
  if (name === "npx") return args[0] && !args[0].startsWith("-") ? { ok: true, program, args: ["--no-install", ...args] } : { ok: false, reason: NOT_ON_A_COMPUTER };
  // `corepack pnpm test` is `pnpm test`.
  const [inner, innerArgs] = name === "corepack" && args[0] ? [args[0], args.slice(1)] : [program, args];
  if (classifyCommand(inner, innerArgs) !== "test_build" || runsSomethingElse(inner, innerArgs)) return { ok: false, reason: NOT_ON_A_COMPUTER };
  return { ok: true, program, args };
}

/** Whether any of a plan's checks can run on a computer: if none can, there's no point sending it there. */
export function anyCheckForComputer(commands: readonly string[]): boolean {
  return commands.some((c) => checkForComputer(c).ok);
}

/**
 * The install a computer runs before the checks, or null when it shouldn't run one. A person's own computer gets the
 * careful version: no pnpmfile and no building a package from source, since a package's own code has no business running
 * during an install. Installing the project itself would build it into that person's Python, so that's skipped.
 */
export function setupForComputer(command: string): string | null {
  if (command.endsWith("pip install .")) return null;
  if (command.startsWith("corepack pnpm")) return `${command} --ignore-pnpmfile`;
  if (command.includes("pip install")) return `${command} --only-binary :all:`;
  return command;
}

export const HandoffCheckResultSchema = z.object({
  command: z.string().min(1).max(300),
  /** Null when it didn't run or didn't finish. */
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().min(0).nullable(),
  timedOut: z.boolean(),
  outputSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  /** The end of what it printed. */
  output: z.string().max(HANDOFF_OUTPUT_CHARS),
  /** Why it didn't run, when it didn't. */
  skipped: z.string().max(300).nullable(),
});
export type HandoffCheckResult = z.infer<typeof HandoffCheckResultSchema>;

export const HandoffReportSchema = z.object({
  checks: z.array(HandoffCheckResultSchema).min(1).max(HANDOFF_MAX_CHECKS),
  /** The proposal's hash the copy was built from, or null when there was no change waiting. */
  proposalSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  /** Files that weren't copied to the computer, with why. */
  notCopied: z.number().int().min(0),
  platform: z.enum(["windows", "macos", "linux"]),
});
export type HandoffReport = z.infer<typeof HandoffReportSchema>;

/** The digest of a report: SHA-256 of its canonical JSON, with the handoff it answers. */
export function handoffDigest(handoffId: string, report: HandoffReport): Promise<string> {
  return canonicalHash({ type: "https://farbaek.dev/local-checks/v1", handoff: handoffId, ...report });
}

export type HandoffVerdict = "all_passed" | "some_failed" | "none_ran";

/** What a report says overall: only checks that ran count, and a check that didn't run is never a pass. */
export function handoffVerdict(checks: readonly Pick<HandoffCheckResult, "exitCode">[]): { verdict: HandoffVerdict; passed: number; ran: number } {
  const ran = checks.filter((c) => c.exitCode !== null).length;
  const passed = checks.filter((c) => c.exitCode === 0).length;
  return { verdict: ran === 0 ? "none_ran" : passed === checks.length ? "all_passed" : "some_failed", passed, ran };
}
