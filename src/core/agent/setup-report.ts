/**
 * The Setup Report (spec §7, "Dependency setup"): what a project needs to run,
 * read from its manifests and lockfiles, without running anything. It lists
 * runtimes, the package manager, build and test commands, the names (never
 * values) of environment variables, and risk flags such as lifecycle scripts.
 */

export interface SetupReport {
  runtimes: string[];
  packageManager: string | null;
  lockfile: string | null;
  scripts: { name: string; command: string }[];
  envVarNames: string[];
  risks: string[];
  missing: string[];
}

const LOCKFILES: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "uv.lock": "uv",
  "poetry.lock": "poetry",
  "Cargo.lock": "cargo",
  "go.sum": "go",
  "composer.lock": "composer",
  "Gemfile.lock": "bundler",
};

const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare", "prepublish"];

/**
 * @param paths every file path in the project
 * @param read returns a file's text when it exists (used for package.json and .env.example only)
 */
export function setupReport(paths: readonly string[], read: (path: string) => string | null): SetupReport {
  const names = new Set(paths);
  const has = (p: string) => names.has(p);
  const runtimes: string[] = [];
  const risks: string[] = [];
  const missing: string[] = [];
  const scripts: { name: string; command: string }[] = [];

  const lockfile = Object.keys(LOCKFILES).find(has) ?? null;
  let packageManager = lockfile ? LOCKFILES[lockfile]! : null;

  if (has("package.json")) {
    let pkg: Record<string, unknown> = {};
    try {
      pkg = JSON.parse(read("package.json") ?? "{}");
    } catch {
      risks.push("package.json isn't valid JSON.");
    }
    const engines = (pkg.engines ?? {}) as Record<string, string>;
    runtimes.push(engines.node ? `Node.js ${engines.node}` : "Node.js");
    if (typeof pkg.packageManager === "string") packageManager = pkg.packageManager;
    for (const [name, command] of Object.entries((pkg.scripts ?? {}) as Record<string, string>)) {
      if (typeof command !== "string") continue;
      scripts.push({ name, command: command.slice(0, 300) });
      if (LIFECYCLE.includes(name)) risks.push(`A "${name}" script runs on install. Installs skip it unless you approve.`);
    }
    if (!lockfile) missing.push("No lockfile, so installs may resolve different versions each time.");
  }
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) runtimes.push("Python");
  if (has("Cargo.toml")) runtimes.push("Rust");
  if (has("go.mod")) runtimes.push("Go");
  if (has("composer.json")) runtimes.push("PHP");
  if (has("Gemfile")) runtimes.push("Ruby");
  if (has("Dockerfile") || has("docker-compose.yml") || has("compose.yaml")) runtimes.push("Docker");
  if (runtimes.length === 0) missing.push("No manifest found, so there's nothing to install or build.");

  const envVarNames: string[] = [];
  for (const file of [".env.example", ".env.sample", ".env.template"]) {
    const text = has(file) ? read(file) : null;
    if (!text) continue;
    for (const line of text.split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]{1,80})\s*=/.exec(line);
      if (m && !envVarNames.includes(m[1]!)) envVarNames.push(m[1]!);
    }
  }
  if (paths.some((p) => /(^|\/)\.env(\.local|\.production)?$/.test(p))) risks.push("An .env file is in the project. Its values are never read or sent.");

  return { runtimes, packageManager, lockfile, scripts: scripts.slice(0, 40), envVarNames: envVarNames.slice(0, 80), risks, missing };
}
