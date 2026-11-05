/**
 * Context Readiness and the Context Passport (spec §8, ADR 0116).
 *
 * Before a plan is approved or the agent starts, Farbaek checks that the task
 * has what it needs, from the project's real records only: its files (path,
 * hash, revision, when each changed), its manifests, the plan, and the last
 * checks. Each fact carries where it came from and one status:
 *
 * - verified_current: read from a current file or record;
 * - possibly_stale: true when recorded, but something it depends on changed since;
 * - conflicting: two sources disagree, and Farbaek doesn't pick one;
 * - inferred: written by a person or the AI, not yet confirmed by a file or a check;
 * - missing: the task needs it and the project doesn't have it;
 * - unavailable: it exists, but Farbaek can't see it (secret values, images).
 *
 * Nothing is guessed: a contradiction stays a contradiction. The passport
 * carries references (paths and hashes), never file contents or secret
 * values, so it can travel with the task.
 */
import type { IntentContract } from "./contract";
import { pathScope } from "./change-proposal";
import { setupReport } from "@/core/agent/setup-report";

export const CONTEXT_PASSPORT_SCHEMA = "farbaek.context-passport/v1";

export type FactStatus = "verified_current" | "possibly_stale" | "conflicting" | "inferred" | "missing" | "unavailable";

export const FACT_STATUSES: readonly FactStatus[] = ["missing", "conflicting", "possibly_stale", "inferred", "unavailable", "verified_current"];

export const FACT_LABELS: Record<FactStatus, string> = {
  verified_current: "Verified, current",
  possibly_stale: "Possibly stale",
  conflicting: "Conflicting",
  inferred: "Inferred",
  missing: "Missing",
  unavailable: "Not visible to Farbaek",
};

export interface ContextSource {
  kind: "file" | "plan" | "checks" | "task";
  /** A path for a file, otherwise what the record is ("plan v3", "checks"). */
  ref: string;
  sha256?: string;
  revision?: number;
  /** When the source last changed or was recorded. */
  at?: string;
}

export interface ContextFact {
  id: string;
  statement: string;
  status: FactStatus;
  sources: ContextSource[];
}

export type Readiness = "ready" | "ready_with_warnings" | "not_ready";

export const READINESS_LABELS: Record<Readiness, string> = {
  ready: "Ready",
  ready_with_warnings: "Ready, with things to check",
  not_ready: "Not ready",
};

export interface ContextPassport {
  schema: typeof CONTEXT_PASSPORT_SCHEMA;
  taskId: string;
  projectId: string;
  goal: string;
  assembledAt: string;
  readiness: Readiness;
  facts: ContextFact[];
  /** Every file the passport looked at, by reference only. */
  sources: ContextSource[];
  constraints: string[];
  openQuestions: string[];
  assumptions: string[];
  conflicts: string[];
  plan: { version: number; sha256: string; approved: boolean } | null;
  /** What makes this passport out of date: re-assemble it when any of these change. */
  freshness: string[];
  nextSteps: string[];
}

export interface PassportFile {
  path: string;
  sha256: string;
  revision: number;
  updatedAt: string;
  encoding?: "base64";
}

export interface PassportInput {
  taskId: string;
  projectId: string;
  goal: string;
  now: Date;
  files: readonly PassportFile[];
  /** A text file's content, for the manifests and README only. Null when absent or unreadable. */
  read(path: string): string | null;
  plan: { version: number; sha256: string; approved: boolean; approvedAt: string | null; contract: IntentContract } | null;
  lastChecks: { result: "verified" | "partially_verified" | "failed" | "unverified" | null; finishedAt: string | null } | null;
}

const MANIFESTS = ["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "requirements.txt", "pyproject.toml", ".env.example", "README.md"];
const SCRIPT_RUNNERS = /^(npm|pnpm|yarn|bun)\s+(?:run\s+)?([A-Za-z0-9:_.-]+)/;
const RUNNER_BUILTINS = new Set(["install", "ci", "add", "exec", "dlx", "x", "create", "init", "i"]);
const FRAMEWORK_CONFIGS: { name: string; test: RegExp }[] = [
  { name: "Next.js", test: /^next\.config\.(js|mjs|ts|cjs)$/ },
  { name: "Vite", test: /^vite\.config\.(js|mjs|ts|cjs)$/ },
  { name: "Astro", test: /^astro\.config\.(js|mjs|ts)$/ },
  { name: "SvelteKit", test: /^svelte\.config\.(js|mjs)$/ },
  { name: "Nuxt", test: /^nuxt\.config\.(js|ts)$/ },
];

const list = (items: readonly string[], max = 5) => (items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} and ${items.length - max} more`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The npm-style script a check command runs, or null when it isn't one. */
export function scriptOf(command: string): string | null {
  const m = SCRIPT_RUNNERS.exec(command.trim());
  if (!m) return null;
  const name = m[2]!;
  return RUNNER_BUILTINS.has(name) ? null : name;
}

function inScope(scope: readonly string[], path: string): boolean {
  return scope.length === 0 || scope.some((s) => path === s || path.startsWith(`${s}/`));
}

export function assemblePassport(input: PassportInput): ContextPassport {
  const facts: ContextFact[] = [];
  const conflicts: string[] = [];
  const nextSteps: string[] = [];
  const byPath = new Map(input.files.map((f) => [f.path, f]));
  const fileSource = (path: string): ContextSource => {
    const f = byPath.get(path);
    return f ? { kind: "file", ref: path, sha256: f.sha256, revision: f.revision, at: f.updatedAt } : { kind: "file", ref: path };
  };
  const add = (id: string, statement: string, status: FactStatus, sources: ContextSource[]) => facts.push({ id, statement, status, sources });
  const paths = input.files.map((f) => f.path);
  const textPaths = input.files.filter((f) => f.encoding !== "base64").map((f) => f.path);

  // The project itself.
  if (input.files.length === 0) {
    add("project.empty", "The project has no files yet, so the agent starts from nothing.", "missing", [{ kind: "task", ref: "project" }]);
  } else {
    const newest = input.files.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
    add("project.files", `The project has ${plural(input.files.length, "file")}; the newest change is to ${newest.path}.`, "verified_current", [fileSource(newest.path)]);
  }

  // Stack and commands, from the manifests (the Setup Report).
  const report = setupReport(textPaths, input.read);
  const scripts = new Map(report.scripts.map((s) => [s.name, s.command]));
  if (byPath.has("package.json")) {
    add("stack.runtime", `It runs on ${list(report.runtimes)}${report.packageManager ? `, with ${report.packageManager}` : ""}.`, "verified_current", [fileSource("package.json")]);
    const named = ["build", "test", "lint", "dev", "start"].filter((n) => scripts.has(n));
    if (named.length) add("stack.scripts", `package.json defines ${list(named.map((n) => `"${n}"`))}.`, "verified_current", [fileSource("package.json")]);
    if (!report.lockfile) add("stack.lockfile", "There's no lockfile, so installs may resolve different versions each time.", "missing", [fileSource("package.json")]);
  } else if (byPath.has("index.html")) {
    add("stack.static", "A static website: index.html with no package.json, so there's nothing to install or build.", "verified_current", [fileSource("index.html")]);
  } else if (report.runtimes.length) {
    add("stack.runtime", `It runs on ${list(report.runtimes)}.`, "verified_current", MANIFESTS.filter((p) => byPath.has(p)).map(fileSource));
  }
  for (const risk of report.risks) add(`stack.risk.${facts.length}`, risk, "verified_current", [fileSource("package.json")]);

  // Two frameworks claiming the same project: say so, don't pick one.
  const frameworks = FRAMEWORK_CONFIGS.filter((fw) => paths.some((p) => fw.test.test(p)));
  if (frameworks.length > 1) {
    const which = frameworks.map((fw) => `${fw.name} (${paths.find((p) => fw.test.test(p))})`);
    const statement = `More than one framework is configured: ${which.join(" and ")}.`;
    add("stack.frameworks", statement, "conflicting", frameworks.map((fw) => fileSource(paths.find((p) => fw.test.test(p))!)));
    conflicts.push(statement);
  }

  // The README's commands against package.json's scripts.
  const readme = byPath.has("README.md") ? input.read("README.md") : null;
  if (readme && byPath.has("package.json")) {
    const told = new Set<string>();
    for (const m of readme.matchAll(/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([A-Za-z0-9:_.-]+)/g)) {
      const name = m[1]!;
      if (!RUNNER_BUILTINS.has(name) && !scripts.has(name) && name !== "test") told.add(name);
    }
    if (told.size) {
      const statement = `README.md mentions ${list([...told].map((n) => `"${n}"`))}, which package.json doesn't define.`;
      add("readme.commands", statement, "conflicting", [fileSource("README.md"), fileSource("package.json")]);
      conflicts.push(statement);
    }
  }

  // Environment variables: their names are known, their values never are.
  if (report.envVarNames.length) {
    add("env.names", `It needs ${plural(report.envVarNames.length, "environment variable")} (${list(report.envVarNames)}). Their values aren't in the project and the test space doesn't have them.`, "unavailable", [fileSource(".env.example")]);
  }
  const images = input.files.filter((f) => f.encoding === "base64").length;
  if (images) add("files.images", `${plural(images, "image")} can be seen but not read as text.`, "unavailable", []);

  // The plan.
  const plan = input.plan;
  if (!plan) {
    add("plan.none", "There's no plan yet: nothing says what this task may change or how to check it.", "missing", [{ kind: "task", ref: input.taskId }]);
    nextSteps.push("Write or draft the plan.");
  } else {
    const c = plan.contract;
    const planSource: ContextSource = { kind: "plan", ref: `plan v${plan.version}`, sha256: plan.sha256, ...(plan.approvedAt ? { at: plan.approvedAt } : {}) };
    if (plan.approved) add("plan.approved", `Plan v${plan.version} is approved.`, "verified_current", [planSource]);
    else add("plan.draft", `Plan v${plan.version} isn't approved yet. Until it is, it's only a suggestion.`, "inferred", [planSource]);

    // Its scope against the files that exist.
    const scope = pathScope(c);
    const creates = c.allowedOperations.includes("files.create");
    const absent = scope.filter((s) => !paths.some((p) => p === s || p.startsWith(`${s}/`)));
    if (absent.length) {
      add(
        "plan.scope.absent",
        creates ? `The plan names ${list(absent)}, which don't exist yet; it allows creating files, so the agent may add them.` : `The plan names ${list(absent)}, which aren't in the project, and it doesn't allow creating files.`,
        creates ? "inferred" : "missing",
        [planSource],
      );
      if (!creates) nextSteps.push(`Fix the plan's scope: ${list(absent)} ${absent.length === 1 ? "isn't" : "aren't"} in the project.`);
    }
    const inside = input.files.filter((f) => inScope(scope, f.path));
    if (scope.length && inside.length) add("plan.scope.files", `${plural(inside.length, "file")} in the project fall within the plan's scope.`, "verified_current", [planSource]);

    // Files that changed after the plan was approved.
    if (plan.approved && plan.approvedAt) {
      const changed = inside.filter((f) => f.updatedAt > plan.approvedAt!).map((f) => f.path);
      if (changed.length) {
        add("plan.stale", `${plural(changed.length, "file")} in the plan's scope changed after it was approved: ${list(changed)}.`, "possibly_stale", [planSource, ...changed.slice(0, 5).map(fileSource)]);
        nextSteps.push("Review the plan again: files it covers changed since it was approved.");
      }
    }

    // The plan's checks against the scripts that exist.
    for (const command of c.requiredChecks) {
      const script = scriptOf(command);
      if (script === null) continue;
      if (!byPath.has("package.json")) {
        add(`check.${script}`, `The check "${command}" needs a package.json, and the project has none.`, "missing", [planSource]);
        nextSteps.push(`Change the check "${command}", or add a package.json.`);
      } else if (!scripts.has(script)) {
        add(`check.${script}`, `The check "${command}" runs the "${script}" script, which package.json doesn't define.`, "missing", [planSource, fileSource("package.json")]);
        nextSteps.push(`Add a "${script}" script to package.json, or change the check "${command}".`);
      } else {
        add(`check.${script}`, `The check "${command}" runs a script package.json defines.`, "verified_current", [planSource, fileSource("package.json")]);
      }
    }
    if (c.requiredChecks.length === 0) add("check.none", "The plan has no checks, so nothing will verify the change automatically.", "missing", [planSource]);

    for (const q of c.openQuestions) if (q.trim()) add(`plan.question.${facts.length}`, q, "inferred", [planSource]);
    if (c.openQuestions.some((q) => q.trim())) nextSteps.push("Answer the plan's open questions, or confirm they don't matter.");
  }

  // The last checks against what changed since.
  const checks = input.lastChecks;
  if (checks?.finishedAt && checks.result) {
    const since = input.files.filter((f) => f.updatedAt > checks.finishedAt!).map((f) => f.path);
    const source: ContextSource = { kind: "checks", ref: "checks", at: checks.finishedAt };
    const word = checks.result === "verified" ? "passed" : checks.result === "failed" ? "failed" : checks.result.replace("_", " ");
    if (since.length) {
      add("checks.stale", `The last checks ${word}, but ${plural(since.length, "file")} changed since: ${list(since)}.`, "possibly_stale", [source, ...since.slice(0, 5).map(fileSource)]);
      nextSteps.push("Run the checks again: files changed since they last ran.");
    } else {
      add("checks.current", `The last checks ${word}, and no file changed since.`, "verified_current", [source]);
      if (checks.result === "failed") nextSteps.push("Fix what made the last checks fail; the agent sees their result.");
    }
  }

  const blocking = facts.some((f) => f.status === "missing" && (f.id === "plan.none" || f.id === "plan.scope.absent"));
  const warnings = facts.some((f) => f.status !== "verified_current" && f.status !== "unavailable");
  const readiness: Readiness = blocking ? "not_ready" : warnings ? "ready_with_warnings" : "ready";

  const c = plan?.contract;
  return {
    schema: CONTEXT_PASSPORT_SCHEMA,
    taskId: input.taskId,
    projectId: input.projectId,
    goal: input.goal,
    assembledAt: input.now.toISOString(),
    readiness,
    facts: [...facts].sort((a, b) => FACT_STATUSES.indexOf(a.status) - FACT_STATUSES.indexOf(b.status)),
    sources: input.files.slice(0, 2_000).map((f) => ({ kind: "file" as const, ref: f.path, sha256: f.sha256, revision: f.revision, at: f.updatedAt })),
    constraints: c ? [...c.forbiddenOperations.map((o) => `Never ${o}.`), ...c.protectedFields.map((f) => `Don't change ${f}.`), ...c.protectedInvariants.map((i) => i.statement)] : [],
    openQuestions: c ? c.openQuestions.filter((q) => q.trim()) : [],
    assumptions: c ? c.assumptions.filter((a) => a.trim()) : [],
    conflicts,
    plan: plan ? { version: plan.version, sha256: plan.sha256, approved: plan.approved } : null,
    freshness: [
      ...MANIFESTS.filter((p) => byPath.has(p)).map((p) => `${p} changes`),
      ...(plan ? ["the plan changes", "a file in the plan's scope changes"] : []),
      ...(checks ? ["the checks run again"] : []),
    ],
    nextSteps: [...new Set(nextSteps)],
  };
}

/** The facts as short lines for a model's brief: what's confirmed, and what isn't. */
export function passportBrief(p: ContextPassport, max = 40): { status: FactStatus; statement: string }[] {
  return p.facts.slice(0, max).map((f) => ({ status: f.status, statement: f.statement }));
}
