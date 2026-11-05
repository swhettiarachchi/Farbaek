/**
 * Runs a cloud run's commands in its sandbox session (ADR 0022). The agent
 * edits a working copy on the server; before each command, the files it has
 * changed since the last command are written into the sandbox, so tests and
 * builds see exactly the agent's current work. Commands run as the person
 * who started the run, through the sandbox service, so its guard, limits,
 * receipts and time accounting all apply.
 */
import type { CommandOutcome, CommandRunner } from "@/agent-runtime/runners";
import { sha256Hex } from "@/core/trust/canonical-json";
import type { SandboxActor, SandboxService } from "@/server/sandbox/service";

/** Quotes one word for the sandbox's POSIX shell. */
export function shellQuote(word: string): string {
  return /^[A-Za-z0-9_./:=@%+-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`;
}

export interface SandboxRunnerOptions {
  service: Pick<SandboxService, "runCommand" | "writeFile" | "cancelExecution">;
  actor: SandboxActor;
  sessionId: string;
  /** The agent's current changes: every file it has created or edited, with its content. */
  pending(): Promise<{ path: string; content: string }[]>;
  /** Told after each command, for the run's event log. */
  onCommand?(info: { command: string; exitCode: number | null; output: string }): void;
  newKey(): string;
}

export function createSandboxRunner(options: SandboxRunnerOptions): CommandRunner {
  // What the sandbox holds for each changed path, by content hash.
  const synced = new Map<string, string>();

  async function sync(): Promise<string | null> {
    for (const f of await options.pending()) {
      const hash = await sha256Hex(f.content);
      if (synced.get(f.path) === hash) continue;
      const written = await options.service.writeFile(options.actor, options.sessionId, f.path, f.content);
      if (!written.ok) return `Couldn't copy ${f.path} into the test space: ${written.message}`;
      synced.set(f.path, hash);
    }
    return null;
  }

  return {
    where: "sandbox",
    async run(program, args, signal): Promise<CommandOutcome> {
      const t0 = Date.now();
      const command = [program, ...args].map(shellQuote).join(" ");
      const failed = (stderr: string): CommandOutcome => ({ exitCode: null, stdout: "", stderr, truncated: false, timedOut: false, cancelled: Boolean(signal?.aborted), leftRunning: false, durationMs: Date.now() - t0 });
      if (signal?.aborted) return failed("Cancelled before it started.");

      const syncError = await sync();
      if (syncError) return failed(syncError);
      // Cancelling the run cancels the command in the sandbox too.
      let executionId: string | null = null;
      const cancel = () => {
        if (executionId) void options.service.cancelExecution(options.actor, executionId).catch(() => undefined);
      };
      signal?.addEventListener("abort", cancel, { once: true });
      const r = await options.service
        .runCommand(options.actor, options.sessionId, { command, kind: "command", label: "Farbaek Agent" }, options.newKey(), {
          onStart: (id) => {
            executionId = id;
            if (signal?.aborted) cancel();
          },
        })
        .finally(() => signal?.removeEventListener("abort", cancel));
      if (!r.ok) return failed(r.message);
      const e = r.value;
      const outcome: CommandOutcome = {
        exitCode: e.exitCode,
        stdout: e.stdout,
        stderr: e.stderr,
        truncated: e.stdoutTruncated || e.stderrTruncated,
        timedOut: e.state === "timed_out",
        cancelled: e.state === "cancelled",
        leftRunning: false,
        durationMs: e.durationMs ?? Date.now() - t0,
      };
      options.onCommand?.({ command, exitCode: e.exitCode, output: `${e.stdout}${e.stderr ? `\n${e.stderr}` : ""}`.trim() });
      return outcome;
    },
  };
}
