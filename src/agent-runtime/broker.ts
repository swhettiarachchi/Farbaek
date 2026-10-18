/**
 * The command broker: the only way the agent runs a program on this
 * computer. A command is a program name plus a list of arguments, never a
 * shell string, so `;`, `&&`, pipes and redirects have no meaning.
 *
 * - The program is looked up by name on PATH (and PATHEXT on Windows) and
 *   run by its absolute path. Relative PATH entries and entries inside the
 *   project folder are skipped, so a project can't plant its own `git`.
 * - The environment is rebuilt from a short allowlist (PATH, temp folders,
 *   the user's profile folders, locale), so the desktop app's own variables,
 *   including any provider keys it was started with, never reach a command.
 * - Windows can only run .cmd and .bat files (npm, pnpm and npx are shims of
 *   this kind) through cmd.exe. For those, every argument is quoted and any
 *   argument with a character cmd.exe would interpret (% ! ^ & | < > " and
 *   line breaks) is refused instead of escaped.
 * - Output is kept within bounds and stripped of terminal codes. A timeout
 *   or a cancel kills the whole process tree: `taskkill /T /F` on Windows, the
 *   process group elsewhere.
 *
 * A normal child process is not a sandbox: it runs with the person's own
 * rights and can read anything they can. That's why the permission engine
 * asks before anything beyond a read-only command, and why the app labels
 * these commands "Runs on this computer, not isolated".
 */
import { spawn, type ChildProcess } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { BoundedOutput, stripAnsi } from "@/core/sandbox/commands";
import { isInside } from "./fs-guard";

export type BrokerErrorCode = "INVALID_PROGRAM" | "NOT_FOUND" | "UNSAFE_ARGUMENT" | "SPAWN_FAILED";

export class BrokerError extends Error {
  constructor(
    readonly code: BrokerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BrokerError";
  }
}

export interface CommandRequest {
  program: string;
  args: readonly string[];
  /** The project folder. Commands always start here. */
  cwd: string;
  timeoutMs?: number;
  /** Characters kept per stream. */
  maxOutputChars?: number;
  signal?: AbortSignal;
  /** The environment to filter. Defaults to this process's environment. */
  parentEnv?: EnvInput;
  platform?: NodeJS.Platform;
}

export interface CommandResult {
  /** The absolute path that ran. */
  resolved: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  /** True when the program exited but something it started kept its output open, and the broker couldn't confirm it was stopped. */
  leftRunning: boolean;
  durationMs: number;
}

/** An environment to filter; process.env fits. */
export type EnvInput = Readonly<Record<string, string | undefined>>;

export const DEFAULT_TIMEOUT_MS = 5 * 60_000;
export const MAX_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_OUTPUT_CHARS = 64 * 1024;
/** After the program exits, how long its output may stay open before the broker stops waiting. */
const CLOSE_GRACE_MS = 2_000;

const PASS_THROUGH = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "PROGRAMDATA",
  "COMMONPROGRAMFILES",
  "COMMONPROGRAMFILES(X86)",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "USER",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "TERM",
]);

/** The environment a command gets: allowlisted names only, plus flags that keep tools non-interactive. */
export function commandEnv(parent: EnvInput = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(parent)) {
    if (value !== undefined && PASS_THROUGH.has(name.toUpperCase())) env[name] = value;
  }
  return { ...env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0", NO_UPDATE_NOTIFIER: "1" };
}

const WINDOWS_RUNNABLE = [".com", ".exe", ".bat", ".cmd"];

function envValue(env: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/** Finds a program by name on PATH. Only bare names are accepted: "pnpm", "git", "node.exe". */
export async function resolveProgram(program: string, env: Record<string, string>, cwd: string, platform: NodeJS.Platform = process.platform): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(program)) {
    throw new BrokerError("INVALID_PROGRAM", "Give the program's name only, like pnpm or git, without a folder or shell syntax.");
  }
  const win = platform === "win32";
  const pathApi = win ? path.win32 : path.posix;
  const ext = pathApi.extname(program).toLowerCase();
  if (win && ext && !WINDOWS_RUNNABLE.includes(ext)) throw new BrokerError("INVALID_PROGRAM", `${program} isn't a program Windows can run directly.`);
  const exts = win && !ext ? (envValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((e) => WINDOWS_RUNNABLE.includes(e.toLowerCase())) : [""];
  const dirs = (envValue(env, "PATH") ?? "").split(win ? ";" : ":").filter(Boolean);
  for (const dir of dirs) {
    // Relative entries would resolve against the project folder; entries inside it are the project's own.
    if (!pathApi.isAbsolute(dir) || isInside(cwd, dir)) continue;
    for (const e of exts) {
      const candidate = pathApi.join(dir, program + e);
      try {
        const stat = await fs.stat(candidate);
        if (!stat.isFile()) continue;
        if (!win) await fs.access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not here; keep looking.
      }
    }
  }
  throw new BrokerError("NOT_FOUND", `${program} isn't installed, or isn't on PATH.`);
}

const CMD_SPECIAL = /[%!^&|<>"\r\n\u0000]/;

/** The command line cmd.exe gets for a .cmd or .bat file, or an error when an argument can't be passed safely. */
export function cmdCommandLine(resolved: string, args: readonly string[]): string {
  if (CMD_SPECIAL.test(resolved)) throw new BrokerError("UNSAFE_ARGUMENT", "The program's path has a character cmd.exe would interpret.");
  for (const arg of args) {
    if (CMD_SPECIAL.test(arg)) {
      throw new BrokerError("UNSAFE_ARGUMENT", `The argument ${JSON.stringify(arg.slice(0, 60))} has a character cmd.exe would interpret (% ! ^ & | < > " or a line break), so it can't be passed to ${path.win32.basename(resolved)} safely.`);
    }
  }
  // /s strips the outer quotes; inside them every part is quoted, so spaces and delimiters stay in one argument.
  return `/d /v:off /s /c ""${resolved}"${args.map((a) => ` "${a}"`).join("")}"`;
}

function systemTool(env: Record<string, string>, name: string): string {
  return path.win32.join(envValue(env, "SYSTEMROOT") ?? "C:\\Windows", "System32", name);
}

/** Kills a process and everything it started. Resolves once the kill has been issued and, on Windows, taskkill has finished. */
function killTree(child: ChildProcess, env: Record<string, string>, platform: NodeJS.Platform): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return Promise.resolve();
  if (platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn(systemTool(env, "taskkill.exe"), ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      killer.on("error", () => {
        child.kill("SIGKILL");
        resolve();
      });
      killer.on("close", () => resolve());
    });
  }
  try {
    // The child leads its own process group (detached), so a negative pid reaches the whole tree.
    process.kill(-pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  return Promise.resolve();
}

export async function runCommand(request: CommandRequest): Promise<CommandResult> {
  const platform = request.platform ?? process.platform;
  const env = commandEnv(request.parentEnv);
  const resolved = await resolveProgram(request.program, env, request.cwd, platform);
  const timeoutMs = Math.min(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxChars = request.maxOutputChars ?? DEFAULT_OUTPUT_CHARS;

  for (const arg of request.args) if (arg.includes("\u0000")) throw new BrokerError("UNSAFE_ARGUMENT", "An argument contains a NUL byte.");
  const isShim = platform === "win32" && /\.(cmd|bat)$/i.test(resolved);
  // The system's own cmd.exe, not whatever COMSPEC names.
  const file = isShim ? systemTool(env, "cmd.exe") : resolved;
  const argv = isShim ? [cmdCommandLine(resolved, request.args)] : [...request.args];
  if (request.signal?.aborted) throw new BrokerError("SPAWN_FAILED", "The run was cancelled before the command started.");

  const started = Date.now();
  const stdout = new BoundedOutput(maxChars);
  const stderr = new BoundedOutput(maxChars);
  let child: ChildProcess;
  try {
    child = spawn(file, argv, {
      cwd: request.cwd,
      env: env as NodeJS.ProcessEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: isShim,
      detached: platform !== "win32",
    });
  } catch (error) {
    throw new BrokerError("SPAWN_FAILED", `The command couldn't start: ${(error as Error).message}`);
  }
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: string) => stderr.push(chunk));

  return new Promise<CommandResult>((resolve, reject) => {
    let timedOut = false;
    let cancelled = false;
    let leftRunning = false;
    let killing: Promise<void> | null = null;
    let exit: { code: number | null; signal: string | null } | null = null;
    let settled = false;

    const stop = (why: "timeout" | "cancel") => {
      if (killing) return;
      if (why === "timeout") timedOut = true;
      else cancelled = true;
      killing = killTree(child, env, platform);
    };
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    const onAbort = () => stop("cancel");
    request.signal?.addEventListener("abort", onAbort, { once: true });
    let grace: NodeJS.Timeout | null = null;

    const finish = async (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (grace) clearTimeout(grace);
      request.signal?.removeEventListener("abort", onAbort);
      await killing;
      resolve({
        resolved,
        exitCode: code,
        signal,
        stdout: stripAnsi(stdout.text()),
        stderr: stripAnsi(stderr.text()),
        truncated: stdout.truncated || stderr.truncated,
        timedOut,
        cancelled,
        leftRunning,
        durationMs: Date.now() - started,
      });
    };

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
      reject(new BrokerError("SPAWN_FAILED", `The command couldn't start: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      exit = { code, signal };
      // Something the program started may still hold its output open; don't wait on it forever.
      grace = setTimeout(async () => {
        if (settled) return;
        if (platform !== "win32") await killTree(child, env, platform);
        else leftRunning = true;
        child.stdout?.destroy();
        child.stderr?.destroy();
        void finish(exit!.code, exit!.signal);
      }, CLOSE_GRACE_MS);
    });
    child.on("close", (code, signal) => void finish(exit?.code ?? code, exit?.signal ?? signal));
  });
}
