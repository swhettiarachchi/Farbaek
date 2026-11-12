/**
 * LaunchOS to hosts that run a server (ADR 0191): Render and Railway build
 * from the project's linked GitHub repository, and Fly.io runs Node's own
 * image with the project's files. The parts that need no network: names,
 * which projects fit which host, and the commands they run.
 */
import type { LaunchPlan } from "./planner";
import type { ServerProvider } from "./providers";

/** A service or app name on all three: lowercase letters, digits and hyphens, at most 63 characters. */
export const SERVER_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A service name from a Farbaek project's name. */
export function serverName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return slug || "farbaek-app";
}

/** The branch Farbaek owns in a linked repository for launches (Render and Railway build from it). */
export const LAUNCH_BRANCH = "farbaek/launch";

/** Fly.io's machine configuration has an undocumented size limit, so files stay well under it (ADR 0191). */
export const FLY_MAX_BYTES = 512 * 1024;
export const FLY_MAX_FILES = 200;

/** The port a launched server listens on, given to it as PORT. */
export const SERVER_PORT = 8080;

interface PackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  main: string | null;
}

function readPackage(text: string | null): PackageJson | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { dependencies?: unknown; devDependencies?: unknown; scripts?: unknown; main?: unknown };
    const record = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});
    return { dependencies: record(raw.dependencies), devDependencies: record(raw.devDependencies), scripts: record(raw.scripts), main: typeof raw.main === "string" ? raw.main : null };
  } catch {
    return null;
  }
}

/** The file Node runs, from `node <file>` in the start script or package.json's main, when it's a plain relative path. */
export function nodeEntry(pkgText: string | null, paths: readonly string[]): string | null {
  const pkg = readPackage(pkgText);
  const start = pkg?.scripts.start?.trim();
  const fromStart = /^node\s+([A-Za-z0-9_./-]+\.m?js)\s*$/.exec(start ?? "")?.[1] ?? null;
  // A start script that does more than run one file (flags, other tools) isn't guessed at: main may be a different program.
  if (start && !fromStart) return null;
  const candidate = (fromStart ?? pkg?.main ?? "").replace(/^\.\//, "");
  if (!candidate || candidate.startsWith("/") || candidate.split("/").includes("..")) return null;
  return paths.includes(candidate) ? candidate : null;
}

export interface ServerCommands {
  /** Run once on the host before starting; null when nothing needs building. */
  build: string | null;
  start: string;
}

/**
 * What the host runs. Install scripts stay off, as everywhere in Farbaek: a
 * package that needs one says so in its build log, and the person decides.
 */
export function serverCommands(plan: Pick<LaunchPlan, "build" | "start">, pkgText: string | null): ServerCommands | null {
  const pkg = readPackage(pkgText);
  if (!pkg) return null;
  const build = pkg.scripts.build ? "npm run build" : null;
  // A build usually needs the dev tools too (tsc, esbuild), so a build installs whenever there's anything to install.
  const hasDeps = Object.keys(pkg.dependencies).length > 0 || (build !== null && Object.keys(pkg.devDependencies).length > 0);
  const install = hasDeps ? "npm install --ignore-scripts --no-audit --no-fund" : null;
  const start = pkg.scripts.start ? "npm start" : plan.start?.command ?? null;
  if (!start) return null;
  const steps = [install, build].filter((s): s is string => s !== null);
  return { build: steps.length > 0 ? steps.join(" && ") : null, start };
}

/** Why a project can't go to this host as it is, or null when it can. */
export function serverFit(
  provider: ServerProvider,
  plan: Pick<LaunchPlan, "kind" | "hosting" | "start" | "build">,
  project: { pkgText: string | null; paths: readonly string[]; totalBytes: number; linkedRepo: boolean },
): string | null {
  if (plan.hosting === "static") return "This is a static site. Vercel or Netlify serve it as it is, or publish it on Farbaek.";
  if (!project.pkgText) return "This project has no package.json, so there's no Node app to run. Render, Railway and Fly.io launches here run Node apps.";
  if (plan.kind === "python") return "Python apps aren't launched from here yet. Render and Railway can run them from your repository directly.";
  const commands = serverCommands(plan, project.pkgText);
  if (!commands) return "package.json needs a start script (for example \"start\": \"node src/server.js\"), so the host knows how to run it.";
  if (provider === "flyio") {
    const pkg = readPackage(project.pkgText);
    if (pkg && Object.keys(pkg.dependencies).length > 0) return "Fly.io launches from here run apps with no dependencies, on Node's own image. Use Render or Railway for this one, or deploy it to Fly.io with a Dockerfile.";
    if (commands.build) return "Fly.io launches from here run apps with no build step. Use Render or Railway for this one.";
    if (!nodeEntry(project.pkgText, project.paths)) return "Fly.io needs a start script of the form node <file>, naming a file in the project.";
    if (project.paths.length > FLY_MAX_FILES || project.totalBytes > FLY_MAX_BYTES) return "This project is larger than a Fly.io launch from here can carry (200 files or 512 KB). Use Render or Railway.";
    return null;
  }
  if (!project.linkedRepo) return "Link this project to a GitHub repository first (the project's GitHub page). Render and Railway build from it.";
  return null;
}
