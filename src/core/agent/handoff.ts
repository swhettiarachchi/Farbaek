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
  if (text.trim() === "farbaek check-site") return { ok: false, reason: "Farbaek's site check runs only in its sandbox." };
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
