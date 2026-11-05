/**
 * The Launch Planner (LaunchOS A, ADR 0033): what a project is, how it
 * builds and runs, which settings it reads and where it can launch today,
 * judged only from its files. It never sees or keeps a setting's value:
 * env files give their key names and nothing else. Every decision carries
 * the evidence it came from, and anything assumed says so.
 */

import { isStaticSite } from "@/core/workspace/static-site";

export const LAUNCH_KINDS = ["static", "nextjs", "vite", "astro", "node_server", "python", "unknown"] as const;
export type LaunchKind = (typeof LAUNCH_KINDS)[number];

export const KIND_LABELS: Record<LaunchKind, string> = {
  static: "A static website",
  nextjs: "A Next.js app",
  vite: "A Vite app",
  astro: "An Astro site",
  node_server: "A Node.js server",
  python: "A Python app",
  unknown: "A project Farbaek can't place yet",
};

export interface PlanCommand {
  command: string;
  /** "found" when it's in the project's own files, "assumed" when it's the framework's usual default. */
  source: "found" | "assumed";
}

export interface EnvName {
  name: string;
  /** Bundled into the browser by its framework, so it must never hold a secret. */
  public: boolean;
  /** Where it was seen: an example env file, the code, or both. */
  seenIn: ("example" | "code")[];
}

export const SERVICE_KINDS = ["database", "auth", "payments", "storage", "email", "ai"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export interface ServiceNeed {
  kind: ServiceKind;
  via: string;
}

export type ProviderId = "vercel" | "netlify" | "render" | "railway" | "flyio";
export interface Destination {
  id: "farbaek_sites" | ProviderId;
  name: string;
  available: boolean;
  /** Why it's available or not, in a sentence. */
  reason: string;
  suits: string;
}

export interface LaunchPlan {
  kind: LaunchKind;
  /** What decided the kind, such as "next.config.ts" or "index.html without package.json". */
  evidence: string[];
  hosting: "static" | "server" | "unknown";
  build: PlanCommand | null;
  output: PlanCommand | null;
  start: PlanCommand | null;
  nodeVersion: string | null;
  envNames: EnvName[];
  services: ServiceNeed[];
  notes: string[];
  destinations: Destination[];
  fileCount: number;
}

export interface PlannerInput {
  paths: readonly string[];
  /** Text of the files read for planning, by path. Others are known by path only. */
  texts: Readonly<Record<string, string>>;
}

/** Files worth reading in full to plan; the server reads these and a capped set of source files. */
export const KEY_FILES = [
  "package.json",
  ".env.example",
  ".env.sample",
  ".env.template",
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "vite.config.ts",
  "vite.config.js",
  "astro.config.mjs",
  "astro.config.ts",
  "requirements.txt",
  "pyproject.toml",
  "Procfile",
  "Dockerfile",
  // Read for what will cost money (ADR 0141): scheduled jobs.
  "vercel.json",
  "netlify.toml",
] as const;

/** Source files scanned for setting names. */
export const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|astro|vue|svelte|py)$/i;
export const PLAN_LIMITS = { sourceFiles: 200, bytesPerFile: 200_000 } as const;

const ENV_EXAMPLES = [".env.example", ".env.sample", ".env.template"];
const ENV_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
/** Names the platforms and frameworks set themselves; nobody has to provide them. */
const BUILT_IN = new Set(["NODE_ENV", "PORT", "HOST", "HOSTNAME", "PWD", "HOME", "PATH", "CI", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "NEXT_RUNTIME", "MODE", "DEV", "PROD", "SSR", "BASE_URL", "TZ"]);
const PUBLIC_PREFIXES = ["NEXT_PUBLIC_", "VITE_", "PUBLIC_", "EXPO_PUBLIC_"];

const SERVICE_DEPENDENCIES: { kind: ServiceKind; deps: string[] }[] = [
  { kind: "database", deps: ["@supabase/supabase-js", "prisma", "@prisma/client", "pg", "postgres", "mysql2", "mongoose", "mongodb", "drizzle-orm", "@neondatabase/serverless", "better-sqlite3", "@libsql/client", "firebase"] },
  { kind: "auth", deps: ["next-auth", "@auth/core", "@clerk/nextjs", "@clerk/clerk-react", "better-auth", "lucia", "@supabase/ssr"] },
  { kind: "payments", deps: ["stripe", "@stripe/stripe-js", "@paddle/paddle-js", "@lemonsqueezy/lemonsqueezy.js"] },
  { kind: "storage", deps: ["@aws-sdk/client-s3", "@vercel/blob", "uploadthing", "cloudinary"] },
  { kind: "email", deps: ["resend", "nodemailer", "@sendgrid/mail", "postmark"] },
  { kind: "ai", deps: ["@anthropic-ai/sdk", "openai", "ai", "@google/genai"] },
];
const PYTHON_SERVICES: { kind: ServiceKind; deps: string[] }[] = [
  { kind: "database", deps: ["psycopg", "psycopg2", "psycopg2-binary", "sqlalchemy", "pymongo", "supabase"] },
  { kind: "payments", deps: ["stripe"] },
  { kind: "ai", deps: ["anthropic", "openai"] },
];

/** The providers a project could go to once LaunchOS connects them. None is connected; there are no prices here. */
export const PROVIDERS: { id: ProviderId; name: string; suits: string; hosts: ("static" | "server")[] }[] = [
  { id: "vercel", name: "Vercel", suits: "Next.js apps and static sites, with previews for every change.", hosts: ["static", "server"] },
  { id: "netlify", name: "Netlify", suits: "Static sites and front-end apps with serverless functions.", hosts: ["static", "server"] },
  { id: "render", name: "Render", suits: "Long-running Node.js and Python servers, plus managed databases.", hosts: ["static", "server"] },
  { id: "railway", name: "Railway", suits: "Servers and databases from a repository, with little setup.", hosts: ["server"] },
  { id: "flyio", name: "Fly.io", suits: "Servers in containers, close to people in many regions.", hosts: ["server"] },
];

interface PackageJson {
  scripts: Record<string, string>;
  deps: Set<string>;
  engines: string | null;
  main: string | null;
}

function readPackage(text: string | undefined): PackageJson | null {
  if (text === undefined) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const record = (v: unknown): Record<string, string> =>
      v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string")) : {};
    const engines = record(raw.engines).node ?? null;
    return {
      scripts: record(raw.scripts),
      deps: new Set([...Object.keys(record(raw.dependencies)), ...Object.keys(record(raw.devDependencies))]),
      engines: engines ? engines.slice(0, 40) : null,
      main: typeof raw.main === "string" ? raw.main.slice(0, 200) : null,
    };
  } catch {
    return null;
  }
}

/** Key names from an example env file. Values are dropped as each line is read. */
export function envExampleNames(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m && ENV_NAME.test(m[1]!)) names.push(m[1]!);
  }
  return names;
}

/** Setting names read in code: process.env.X, process.env["X"], import.meta.env.X, Deno.env.get("X") and os.environ / os.getenv in Python. */
export function envNamesInCode(text: string): string[] {
  const names: string[] = [];
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]+)/g,
    /process\.env\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
    /Deno\.env\.get\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\)/g,
    /os\.environ(?:\.get)?\(?\[?\s*["']([A-Z][A-Z0-9_]+)["']/g,
    /os\.getenv\(\s*["']([A-Z][A-Z0-9_]+)["']/g,
  ];
  for (const p of patterns) for (const m of text.matchAll(p)) if (ENV_NAME.test(m[1]!)) names.push(m[1]!);
  return names;
}

function collectEnvNames(input: PlannerInput): EnvName[] {
  const seen = new Map<string, Set<"example" | "code">>();
  const add = (name: string, where: "example" | "code") => {
    if (BUILT_IN.has(name)) return;
    seen.set(name, (seen.get(name) ?? new Set()).add(where));
  };
  for (const file of ENV_EXAMPLES) {
    const text = input.texts[file];
    if (text !== undefined) for (const n of envExampleNames(text)) add(n, "example");
  }
  for (const [path, text] of Object.entries(input.texts)) {
    if (SOURCE_FILE.test(path) && !path.split("/").includes("node_modules")) for (const n of envNamesInCode(text)) add(n, "code");
  }
  return [...seen.entries()]
    .map(([name, where]) => ({ name, public: PUBLIC_PREFIXES.some((p) => name.startsWith(p)), seenIn: [...where].sort() as ("example" | "code")[] }))
    .sort((a, b) => Number(a.public) - Number(b.public) || a.name.localeCompare(b.name));
}

function pythonDeps(text: string | undefined): Set<string> {
  const deps = new Set<string>();
  if (!text) return deps;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.-]+)/.exec(line.replace(/#.*/, ""));
    if (m) deps.add(m[1]!.toLowerCase());
  }
  return deps;
}

const found = (command: string): PlanCommand => ({ command, source: "found" });
const assumed = (command: string): PlanCommand => ({ command, source: "assumed" });
const script = (pkg: PackageJson | null, name: string) => (pkg?.scripts[name] !== undefined ? found(`npm run ${name}`) : null);

export function planLaunch(input: PlannerInput): LaunchPlan {
  const has = new Set(input.paths);
  const any = (...files: string[]) => files.find((f) => has.has(f));
  const pkg = readPackage(input.texts["package.json"]);
  const deps = pkg?.deps ?? new Set<string>();
  const evidence: string[] = [];
  const notes: string[] = [];
  let kind: LaunchKind = "unknown";
  let build: PlanCommand | null = null;
  let output: PlanCommand | null = null;
  let start: PlanCommand | null = null;

  const nextConfig = any("next.config.ts", "next.config.mjs", "next.config.js");
  const viteConfig = any("vite.config.ts", "vite.config.js");
  const astroConfig = any("astro.config.mjs", "astro.config.ts");
  const python = any("requirements.txt", "pyproject.toml");

  if (has.has("package.json") && (nextConfig || deps.has("next"))) {
    kind = "nextjs";
    evidence.push(nextConfig ?? "next in package.json");
    build = script(pkg, "build") ?? assumed("next build");
    start = script(pkg, "start") ?? assumed("next start");
  } else if (has.has("package.json") && (astroConfig || deps.has("astro"))) {
    kind = "astro";
    evidence.push(astroConfig ?? "astro in package.json");
    build = script(pkg, "build") ?? assumed("astro build");
    output = assumed("dist");
  } else if (has.has("package.json") && (viteConfig || deps.has("vite"))) {
    kind = "vite";
    evidence.push(viteConfig ?? "vite in package.json");
    build = script(pkg, "build") ?? assumed("vite build");
    output = assumed("dist");
  } else if (has.has("package.json") && (pkg?.scripts.start !== undefined || ["express", "fastify", "koa", "hono", "@hono/node-server"].some((d) => deps.has(d)))) {
    kind = "node_server";
    const framework = ["express", "fastify", "koa", "hono"].find((d) => deps.has(d));
    evidence.push(framework ? `${framework} in package.json` : "a start script in package.json");
    build = script(pkg, "build");
    start = script(pkg, "start") ?? (pkg?.main ? assumed(`node ${pkg.main}`) : null);
  } else if (python) {
    kind = "python";
    evidence.push(python);
    const pdeps = pythonDeps(input.texts["requirements.txt"]);
    const procfile = input.texts.Procfile?.match(/^web:\s*(.+)$/m)?.[1]?.trim();
    start = procfile ? found(procfile.slice(0, 200)) : pdeps.has("fastapi") ? assumed("uvicorn main:app") : pdeps.has("flask") ? assumed("gunicorn app:app") : pdeps.has("django") ? assumed("gunicorn <project>.wsgi") : null;
    if (procfile) evidence.push("Procfile");
  } else if (isStaticSite(input.paths, input.texts["package.json"])) {
    kind = "static";
    evidence.push(has.has("package.json") ? "index.html, and a package.json that installs and runs nothing" : "index.html without package.json");
  }

  const hosting: LaunchPlan["hosting"] = kind === "static" || kind === "vite" || kind === "astro" ? "static" : kind === "unknown" ? "unknown" : "server";
  const envNames = collectEnvNames(input);

  const services: ServiceNeed[] = [];
  for (const group of SERVICE_DEPENDENCIES) {
    const via = group.deps.find((d) => deps.has(d));
    if (via) services.push({ kind: group.kind, via });
  }
  const pdeps = pythonDeps(input.texts["requirements.txt"]);
  for (const group of PYTHON_SERVICES) {
    const via = group.deps.find((d) => pdeps.has(d));
    if (via && !services.some((s) => s.kind === group.kind)) services.push({ kind: group.kind, via });
  }

  if (kind === "static" && !has.has("index.html")) notes.push("There's no index.html, the page people see first.");
  if (kind === "unknown") notes.push(has.has("package.json") ? "package.json has no build or start script Farbaek recognises." : "There's no index.html or package.json to start from.");
  if ((kind === "vite" || kind === "astro") && build) notes.push("It needs a build step first. Farbaek Sites serves files as they are, so publish the built folder or a static version.");
  if (hosting === "server") notes.push("It runs a server, so it needs a host that runs code. Farbaek Sites only serves static files.");
  const secretish = envNames.filter((e) => !e.public).length;
  if (secretish > 0) notes.push(`It reads ${secretish} ${secretish === 1 ? "setting" : "settings"} the host must provide. Keep their values in the host's settings, never in the files.`);
  const leaking = envNames.filter((e) => e.public && /SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|TOKEN/.test(e.name));
  if (leaking.length > 0) notes.push(`${leaking.map((e) => e.name).join(", ")} ${leaking.length === 1 ? "looks" : "look"} like a secret but would be visible in the browser. Rename without the public prefix.`);
  if (pkg && !pkg.engines && hosting === "server") notes.push("package.json doesn't say which Node.js version it needs. Hosts pick their own default.");

  const directStatic = kind === "static";
  const destinations: Destination[] = [
    {
      id: "farbaek_sites",
      name: "Farbaek Sites",
      available: directStatic,
      reason: directStatic
        ? "Ready: it's static files, served at your own address on Farbaek after a clean security check."
        : kind === "vite" || kind === "astro"
          ? "Not yet: it needs a build step, and Farbaek Sites serves files as they are."
          : hosting === "server"
            ? "Not for this project: it runs a server, and Farbaek Sites serves static files."
            : has.has("index.html")
              ? "Not yet: it has an index.html, but its package.json installs or runs something, so Farbaek can't tell how it runs."
              : "Not yet: Farbaek can't tell how this project runs. Add an index.html for a static site.",
      suits: "Static websites built in Farbaek, at their own address on Farbaek's site domain.",
    },
    ...PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      available: false,
      reason: hosting !== "unknown" && !p.hosts.includes(hosting) ? "Not connected, and suited to servers rather than static sites." : "Not connected yet. Connecting your own account comes next.",
      suits: p.suits,
    })),
  ];

  return { kind, evidence, hosting, build, output, start, nodeVersion: pkg?.engines ?? null, envNames, services, notes, destinations, fileCount: input.paths.length };
}

/** Which files the server should read to plan: the key files, then source files, capped. */
export function filesToRead(paths: readonly string[]): string[] {
  const keys = paths.filter((p) => (KEY_FILES as readonly string[]).includes(p));
  const sources = paths.filter((p) => SOURCE_FILE.test(p) && !p.split("/").some((seg) => seg === "node_modules" || seg.startsWith("."))).slice(0, PLAN_LIMITS.sourceFiles);
  return [...keys, ...sources];
}
