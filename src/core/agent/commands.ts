/**
 * What a command could do, judged from its program and arguments only. The
 * agent never runs a shell string: a command is a program plus a list of
 * arguments, so `;`, `&&` and pipes have no meaning. This classification
 * decides how much approval a command needs; it is deliberately cautious,
 * and anything it doesn't recognize counts as unknown.
 */

export const COMMAND_RISKS = ["read_only", "test_build", "install", "network", "destructive", "unknown"] as const;
export type CommandRisk = (typeof COMMAND_RISKS)[number];

export const COMMAND_RISK_LABELS: Record<CommandRisk, string> = {
  read_only: "Reads only",
  test_build: "Runs project code: tests, builds or scripts",
  install: "Installs packages",
  network: "Reaches the network",
  destructive: "Can delete or overwrite work",
  unknown: "Not recognized",
};

/** "C:\\tools\\Node.EXE" → "node". */
export function programName(program: string): string {
  const base = program.trim().split(/[\\/]/).at(-1) ?? "";
  return base.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
}

const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const READ_ONLY_PROGRAMS = new Set(["ls", "dir", "pwd", "cat", "type", "head", "tail", "wc", "where", "which", "tree", "echo"]);
const DESTRUCTIVE_PROGRAMS = new Set(["rm", "del", "erase", "rmdir", "rd", "format", "mkfs", "dd", "shutdown", "reboot", "diskpart", "shred", "mv", "move"]);
const NETWORK_PROGRAMS = new Set(["curl", "wget", "ssh", "scp", "sftp", "ftp", "nc", "ncat", "telnet", "rsync", "invoke-webrequest"]);
const SYSTEM_INSTALLERS = new Set(["apt", "apt-get", "brew", "choco", "winget", "scoop", "dnf", "yum", "pacman", "snap"]);
const TEST_BUILD_PROGRAMS = new Set(["node", "python", "python3", "py", "pytest", "tsc", "vitest", "jest", "eslint", "prettier", "make", "deno", "go", "cargo", "dotnet", "mvn", "gradle", "ruby", "php", "composer"]);
const READ_ONLY_GIT = new Set(["status", "diff", "log", "show", "branch", "rev-parse", "ls-files", "blame", "describe", "tag"]);
const NETWORK_GIT = new Set(["clone", "fetch", "pull", "push", "remote", "submodule"]);

const isVersionQuery = (args: readonly string[]) => args.length === 1 && ["--version", "-v", "-V", "version"].includes(args[0]!);

export function classifyCommand(program: string, args: readonly string[]): CommandRisk {
  const name = programName(program);
  const first = (args[0] ?? "").toLowerCase();
  if (!name) return "unknown";
  if (isVersionQuery(args)) return "read_only";
  if (READ_ONLY_PROGRAMS.has(name)) return "read_only";
  if (DESTRUCTIVE_PROGRAMS.has(name)) return "destructive";
  if (NETWORK_PROGRAMS.has(name)) return "network";
  if (SYSTEM_INSTALLERS.has(name)) return "install";

  if (name === "git") {
    if (READ_ONLY_GIT.has(first)) return "read_only";
    if (NETWORK_GIT.has(first)) return "network";
    if (["reset", "clean", "checkout", "restore", "rebase", "stash", "rm"].includes(first)) return "destructive";
    return "unknown";
  }

  if (PACKAGE_MANAGERS.has(name)) {
    if (["install", "i", "add", "ci", "update", "upgrade", "up", "remove", "uninstall", "rm", "dlx", "create", "init"].includes(first)) return "install";
    if (["publish", "login", "logout", "adduser", "deploy"].includes(first)) return "network";
    if (["test", "t", "run", "build", "lint", "exec", "typecheck", "start", "dev", "check"].includes(first)) return "test_build";
    if (["list", "ls", "why", "outdated", "view", "info", "audit", "config"].includes(first)) return first === "config" ? "unknown" : "read_only";
    // `pnpm test` style shortcuts for package.json scripts.
    return "test_build";
  }
  if (name === "npx" || name === "pnpx") return "install";
  if (name === "pip" || name === "pip3" || name === "uv" || name === "poetry") {
    if (["install", "add", "sync", "lock", "update"].includes(first)) return "install";
    if (["list", "show", "freeze", "check"].includes(first)) return "read_only";
    return "unknown";
  }
  if (TEST_BUILD_PROGRAMS.has(name)) {
    if (name === "cargo" && first === "install") return "install";
    if (name === "go" && (first === "get" || first === "install")) return "install";
    return "test_build";
  }
  return "unknown";
}

/**
 * Safe defaults added before a command runs: package installs skip lifecycle
 * scripts (postinstall and the like) unless a person approves running them.
 */
export function withSafeDefaults(program: string, args: readonly string[]): string[] {
  const name = programName(program);
  const first = (args[0] ?? "").toLowerCase();
  if (PACKAGE_MANAGERS.has(name) && ["install", "i", "add", "ci"].includes(first) && !args.includes("--ignore-scripts")) return [...args, "--ignore-scripts"];
  return [...args];
}

/** The command as a person reads it in an approval card. Arguments with spaces are quoted. */
export function displayCommand(program: string, args: readonly string[]): string {
  const q = (s: string) => (/^[\w./:=@+-]+$/.test(s) ? s : JSON.stringify(s));
  return [program, ...args].map(q).join(" ");
}
