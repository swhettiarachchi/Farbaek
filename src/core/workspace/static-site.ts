/**
 * Whether a package.json leaves a project a plain static site: it parses, and
 * it names nothing to install, build or run. Projects often carry one with
 * just a name and a version. With an index.html beside it, that site is served
 * exactly as it is by Farbaek Sites, Vercel and Netlify, so it shouldn't be
 * treated as an app Farbaek can't place. Any dependency, or a build, start or
 * dev script, means it isn't.
 */
const RUN_SCRIPTS = ["build", "start", "dev", "serve", "preview", "prestart", "postinstall", "prepare"];

export function inertPackageJson(text: string | null | undefined): boolean {
  if (text === null || text === undefined) return false;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return false;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const pkg = raw as Record<string, unknown>;
  const hasKeys = (v: unknown) => Boolean(v) && typeof v === "object" && Object.keys(v as object).length > 0;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "workspaces"]) {
    if (hasKeys(pkg[field])) return false;
  }
  const scripts = pkg.scripts && typeof pkg.scripts === "object" ? Object.keys(pkg.scripts as object) : [];
  return !scripts.some((s) => RUN_SCRIPTS.includes(s));
}

/** A project's paths and, when it has one, its package.json's text: a static site? */
export function isStaticSite(paths: readonly string[], packageJson?: string | null): boolean {
  const has = new Set(paths);
  return has.has("index.html") && (!has.has("package.json") || inertPackageJson(packageJson));
}

/** Whether a caller needs package.json's text to decide (index.html and package.json both there). */
export function needsPackageJson(paths: readonly string[]): boolean {
  return paths.includes("index.html") && paths.includes("package.json");
}
