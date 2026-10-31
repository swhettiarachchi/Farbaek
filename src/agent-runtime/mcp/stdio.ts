/**
 * Starts an MCP server the person added (ADR 0148) as a child process and
 * talks to it over stdin and stdout, one JSON-RPC message per line. It's
 * started like the agent's commands (ADR 0005): a bare program name found
 * on PATH, arguments passed as they are with no shell, and only the
 * environment variables a developer tool needs, so this app's own secrets
 * never reach it. It runs on this computer, not in a sandbox.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cmdCommandLine, commandEnv, killTree, resolveProgram, systemTool, type EnvInput } from "../broker";
import { McpError, type LineTransport } from "./client";

const MAX_STDERR = 8_000;

export interface StdioServer {
  command: string;
  args: readonly string[];
  /** Where it starts: a folder of its own, never a project's copy. */
  cwd: string;
}

export async function spawnStdioTransport(server: StdioServer, options: { parentEnv?: EnvInput; platform?: NodeJS.Platform } = {}): Promise<LineTransport & { stderr(): string }> {
  const platform = options.platform ?? process.platform;
  const env = commandEnv(options.parentEnv);
  for (const arg of server.args) if (arg.includes("\u0000")) throw new McpError("An argument contains a NUL byte.");
  let resolved: string;
  try {
    resolved = await resolveProgram(server.command, env, server.cwd, platform);
  } catch (e) {
    throw new McpError(e instanceof Error ? e.message : `${server.command} wasn't found.`);
  }
  const isShim = platform === "win32" && /\.(cmd|bat)$/i.test(resolved);
  const file = isShim ? systemTool(env, "cmd.exe") : resolved;
  const argv = isShim ? [cmdCommandLine(resolved, server.args)] : [...server.args];

  let child: ChildProcess;
  try {
    child = spawn(file, argv, { cwd: server.cwd, env: env as NodeJS.ProcessEnv, shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: isShim, detached: platform !== "win32" });
  } catch (e) {
    throw new McpError(`The MCP server couldn't start: ${(e as Error).message}`);
  }

  const lineListeners: ((line: string) => void)[] = [];
  const closeListeners: ((reason: string) => void)[] = [];
  let buffer = "";
  let stderr = "";
  let done = false;
  const finish = (reason: string) => {
    if (done) return;
    done = true;
    for (const l of closeListeners) l(reason);
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    buffer += chunk;
    let at: number;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).replace(/\r$/, "");
      buffer = buffer.slice(at + 1);
      if (line.trim()) for (const l of lineListeners) l(line);
    }
    // A server that never ends a line is cut off rather than allowed to fill memory.
    if (buffer.length > 4_000_000) buffer = "";
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-MAX_STDERR);
  });
  child.on("error", (e) => finish(`The MCP server couldn't run: ${e.message}`));
  child.on("exit", (code) => finish(`The MCP server stopped${code === null ? "" : ` with code ${code}`}.`));
  child.stdin?.on("error", () => undefined);

  return {
    send(line) {
      if (!done) child.stdin?.write(`${line}\n`);
    },
    onLine(listener) {
      lineListeners.push(listener);
    },
    onClose(listener) {
      closeListeners.push(listener);
    },
    close() {
      if (done) return;
      child.stdin?.end();
      void killTree(child, env, platform).catch(() => undefined);
      finish("Closed.");
    },
    stderr: () => stderr,
  };
}
