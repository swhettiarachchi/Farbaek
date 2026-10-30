/**
 * Commands and their output. A command is untrusted text that runs only
 * inside the sandbox; Farbaek checks its shape (length, no NUL bytes), wraps
 * it with per-process limits as defence in depth, and keeps a bounded copy of
 * what it printed. The real boundary is the microVM and the runtime's own
 * timeout, not the wrapper.
 */
import { SANDBOX_WORKSPACE_ROOT } from "./paths";

export const MAX_COMMAND_CHARS = 4000;
/** Output kept per stream for each run: the start and the end, with a marker in between. */
export const MAX_STREAM_CHARS = 128 * 1024;

export type CommandCheck = { ok: true; command: string } | { ok: false; reason: string };

export function checkCommand(input: unknown): CommandCheck {
  if (typeof input !== "string") return { ok: false, reason: "The command must be text." };
  const command = input.trim();
  if (command.length === 0) return { ok: false, reason: "Enter a command." };
  if (command.length > MAX_COMMAND_CHARS) return { ok: false, reason: `Commands are limited to ${MAX_COMMAND_CHARS} characters.` };
  if (command.includes("\u0000")) return { ok: false, reason: "The command contains a NUL byte." };
  return { ok: true, command };
}

export interface ProcessLimits {
  maxProcesses: number;
  maxOpenFiles: number;
  maxFileSizeMiB: number;
}

export const DEFAULT_PROCESS_LIMITS: ProcessLimits = { maxProcesses: 512, maxOpenFiles: 4096, maxFileSizeMiB: 1024 };

/**
 * Runs the command from the project folder under ulimits. These limits are
 * inside the guest and a process with sudo there can raise them; they stop
 * runaway forks and huge files early, while the microVM's fixed CPU, memory
 * and disk are the hard ceiling.
 */
export function wrapCommand(command: string, limits: ProcessLimits = DEFAULT_PROCESS_LIMITS, prelude?: string): string {
  const fileBlocks = limits.maxFileSizeMiB * 1024;
  return [
    `ulimit -u ${limits.maxProcesses} 2>/dev/null`,
    `ulimit -n ${limits.maxOpenFiles} 2>/dev/null`,
    `ulimit -f ${fileBlocks} 2>/dev/null`,
    `mkdir -p ${SANDBOX_WORKSPACE_ROOT}`,
    `cd ${SANDBOX_WORKSPACE_ROOT}`,
    ...(prelude ? [prelude] : []),
    command,
  ].join("\n");
}

/** Keeps the first and last part of a stream, so long logs stay readable and storage stays bounded. */
export class BoundedOutput {
  private head = "";
  private tail = "";
  private total = 0;

  constructor(private readonly max: number = MAX_STREAM_CHARS) {}

  push(chunk: string): void {
    this.total += chunk.length;
    const headRoom = Math.floor(this.max / 2) - this.head.length;
    if (headRoom > 0) {
      this.head += chunk.slice(0, headRoom);
      chunk = chunk.slice(headRoom);
    }
    if (chunk.length > 0) {
      const keep = this.max - Math.floor(this.max / 2);
      this.tail = (this.tail + chunk).slice(-keep);
    }
  }

  get truncated(): boolean {
    return this.total > this.head.length + this.tail.length;
  }

  get size(): number {
    return this.total;
  }

  text(): string {
    if (!this.truncated) return this.head + this.tail;
    const omitted = this.total - this.head.length - this.tail.length;
    return `${this.head}\n[farbaek: ${omitted.toLocaleString("en-US")} characters omitted]\n${this.tail}`;
  }
}

/** Removes terminal control sequences before output is shown or stored. Colour codes would otherwise appear as noise. */
export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)/g, "");
}
