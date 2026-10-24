/**
 * Farbaek's fallback checks (ADR 0054, ADR 0058): what a verification runs
 * when the approved plan lists no checks of its own, so an applied change
 * can still be verified instead of waiting in "Verifying" for good.
 *
 *   - A static site: Farbaek's site check (site-check.ts).
 *   - An app with packages: its own build, and its tests when it has real
 *     ones, with the package manager its lockfile names. The verification
 *     sandbox installs the packages first, never running install scripts.
 *   - A Python project: every .py file compiles.
 *
 * Nothing here runs anything; it only names the commands. People see them on
 * the task before they press the button, and the receipt records them.
 */
import { isStaticSite, SITE_CHECK_COMMAND } from "./site-check";

/** npm's placeholder test script, which only fails. */
const NPM_PLACEHOLDER = /no test specified/i;
/** A test script that watches for changes never finishes in a sandbox. */
const WATCHES = /(^|\s)(--watch|--watchAll|-w)(\s|$)/;

/** The package.json scripts, or null when there's no readable package.json. */
function scriptsOf(read: (path: string) => string | null): Record<string, unknown> | null {
  const text = read("package.json");
  if (!text) return null;
  try {
    const pkg: unknown = JSON.parse(text);
    if (!pkg || typeof pkg !== "object") return null;
    const scripts = (pkg as { scripts?: unknown }).scripts;
    return scripts && typeof scripts === "object" ? (scripts as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

/**
 * An app's own checks. `CI=1` keeps test runners and builds from waiting for
 * a person (watch modes, prompts, telemetry notices).
 */
export function appChecks(paths: readonly string[], read: (path: string) => string | null): string[] {
  if (paths.includes("package.json")) {
    const scripts = scriptsOf(read);
    if (!scripts) return [];
    const pm = paths.includes("pnpm-lock.yaml") ? "corepack pnpm" : "npm";
    const out: string[] = [];
    const script = (name: string) => (typeof scripts[name] === "string" ? (scripts[name] as string).trim() : "");
    if (script("build")) out.push(`CI=1 ${pm} run build`);
    const test = script("test");
    if (test && !NPM_PLACEHOLDER.test(test) && !WATCHES.test(test)) out.push(`CI=1 ${pm} test`);
    return out;
  }
  if (paths.some((p) => p.endsWith(".py")) && (paths.includes("requirements.txt") || paths.includes("pyproject.toml"))) {
    return ["python3 -m compileall -q ."];
  }
  return [];
}

/**
 * The checks a verification runs: the plan's own, or when it lists none,
 * Farbaek's site check for a static site or the app's own checks. A project
 * with nothing to check gets none, and the task page says so.
 */
export function checksToRun(planChecks: readonly string[], paths: readonly string[], read: (path: string) => string | null = () => null): string[] {
  if (planChecks.length > 0) return [...planChecks];
  if (isStaticSite(paths)) return [SITE_CHECK_COMMAND];
  return appChecks(paths, read);
}

/** How the task page says which fallback runs, before anyone presses the button. */
export function fallbackChecksWords(checks: readonly string[]): { kind: "site" | "app" | "python"; text: string } {
  if (checks.includes(SITE_CHECK_COMMAND)) return { kind: "site", text: "The plan lists no checks, so Farbaek checks the site itself." };
  if (checks.some((c) => c.includes("compileall"))) return { kind: "python", text: "The plan lists no checks, so Farbaek checks that every Python file in the project compiles." };
  const build = checks.some((c) => / run build$/.test(c));
  const test = checks.some((c) => / test$/.test(c));
  const what = build && test ? "build and its tests" : build ? "build" : "tests";
  return { kind: "app", text: `The plan lists no checks, so Farbaek runs the app's own ${what}.` };
}
