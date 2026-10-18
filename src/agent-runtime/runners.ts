/**
 * Where the agent's commands run. Controlled Development runs them on this
 * computer through the broker, in the task's copy of the project; that is a
 * normal child process, not a sandbox. Sandboxed Autopilot plugs in a runner
 * backed by a Farbaek sandbox session instead.
 */
import { runCommand, type EnvInput } from "./broker";

export type RunnerLocation = "local" | "sandbox";

export interface CommandOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  /** Something the command started may still be running (local runs on Windows). */
  leftRunning: boolean;
  durationMs: number;
}

export interface CommandRunner {
  readonly where: RunnerLocation;
  run(program: string, args: readonly string[], signal?: AbortSignal): Promise<CommandOutcome>;
}

export const RUNNER_LABELS: Record<RunnerLocation, string> = {
  local: "Runs on this computer, not isolated",
  sandbox: "Runs in an isolated Farbaek sandbox",
};

export function createLocalRunner(root: string, options: { timeoutMs?: number; parentEnv?: EnvInput } = {}): CommandRunner {
  return {
    where: "local",
    async run(program, args, signal) {
      const r = await runCommand({ program, args, cwd: root, signal, timeoutMs: options.timeoutMs, parentEnv: options.parentEnv });
      return {
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        truncated: r.truncated,
        timedOut: r.timedOut,
        cancelled: r.cancelled,
        leftRunning: r.leftRunning,
        durationMs: r.durationMs,
      };
    },
  };
}
