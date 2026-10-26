/**
 * Impact analysis (ADR 0085): what else in a project reaches the files a
 * change touches. Farbaek reads import statements in JavaScript and
 * TypeScript files, and script and stylesheet tags in HTML, builds who
 * imports what, and walks back from the changed files up to three steps:
 * the files that import them, the pages they reach, the tests that reach
 * them, and the changed files no test reaches. It reads; it never runs
 * anything, and it says what it can't follow.
 */

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;
const HTML = /\.html?$/;
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const MAX_REACH = 200;

export const isScript = (path: string) => SCRIPT.test(path);
/** Files whose imports are read: scripts and HTML pages. */
export const isScanned = (path: string) => SCRIPT.test(path) || HTML.test(path);
export const isTest = (path: string) => /(^|\/)__tests__\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
export function isPage(path: string): boolean {
  if (HTML.test(path)) return true;
  if (/(^|\/)app\/(?:.+\/)?(?:page|layout)\.[jt]sx?$/.test(path)) return true;
  return /(^|\/)pages\/(?!api\/).+\.[jt]sx?$/.test(path);
}

/** Literal module names a script imports. Comments are removed first; names built at run time can't be read. */
export function importSpecifiers(content: string): string[] {
  const code = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const out = new Set<string>();
  for (const re of [/\bfrom\s*["']([^"'\n]+)["']/g, /\bimport\s*["']([^"'\n]+)["']/g, /\bimport\(\s*["']([^"'\n]+)["']\s*\)/g, /\brequire\(\s*["']([^"'\n]+)["']\s*\)/g]) {
    for (const m of code.matchAll(re)) if (m[1]) out.add(m[1]);
  }
  return [...out];
}

/** Scripts and stylesheets an HTML page loads. */
export function htmlReferences(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) if (m[1]) out.add(m[1]);
  for (const m of content.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+\.css)["']/gi)) if (m[1]) out.add(m[1]);
  return [...out].filter((s) => !/^(?:[a-z]+:)?\/\//i.test(s));
}

export interface Alias {
  /** What an import starts with, such as "@/". */
  prefix: string;
  /** The project folder it stands for, such as "src/". */
  target: string;
}

function normalize(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}
const dirOf = (path: string) => path.split("/").slice(0, -1).join("/");

/** Path aliases from the project's tsconfig.json or jsconfig.json; when there are none, `@/` is assumed to mean `src/` if the project has one. */
export function aliasesFrom(files: ReadonlyMap<string, string>): { aliases: Alias[]; assumed: boolean } {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const text = files.get(name);
    if (text === undefined) continue;
    try {
      const json = JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1").replace(/,(\s*[}\]])/g, "$1")) as {
        compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
      };
      const base = normalize(json.compilerOptions?.baseUrl ?? ".") ?? "";
      const aliases: Alias[] = [];
      for (const [key, targets] of Object.entries(json.compilerOptions?.paths ?? {})) {
        const target = targets?.[0];
        if (!target) continue;
        const prefix = key.replace(/\*$/, "");
        const to = normalize(`${base}/${target.replace(/\*$/, "")}`);
        if (to !== null) aliases.push({ prefix, target: to ? `${to}/` : "" });
      }
      if (aliases.length > 0) return { aliases, assumed: false };
    } catch {
      // An unreadable config falls through to the assumption below.
    }
  }
  const hasSrc = [...files.keys()].some((p) => p.startsWith("src/"));
  return { aliases: hasSrc ? [{ prefix: "@/", target: "src/" }] : [], assumed: hasSrc };
}

/** The project file an import names, or null for packages and anything not found. */
export function resolveSpecifier(from: string, spec: string, files: ReadonlySet<string>, aliases: readonly Alias[]): string | null {
  let base: string | null = null;
  if (spec.startsWith("./") || spec.startsWith("../")) base = normalize(`${dirOf(from)}/${spec}`);
  else if (spec.startsWith("/") && HTML.test(from)) base = normalize(spec);
  else if (HTML.test(from) && !spec.includes(":")) base = normalize(`${dirOf(from)}/${spec}`);
  else {
    const alias = aliases.find((a) => spec.startsWith(a.prefix));
    if (alias) base = normalize(alias.target + spec.slice(alias.prefix.length));
  }
  if (base === null) return null;
  const stem = base.replace(/\.[cm]?jsx?$/, "");
  const tries = [base, ...EXTENSIONS.map((e) => stem + e), ...EXTENSIONS.map((e) => `${base}/index${e}`)];
  return tries.find((t) => files.has(t)) ?? null;
}

export interface Reach {
  path: string;
  /** The file it imports that leads to the change. */
  via: string;
  depth: number;
}

export interface ImpactResult {
  changed: { path: string; importers: number; tested: boolean }[];
  direct: Reach[];
  further: Reach[];
  pages: string[];
  tests: string[];
  /** Changed scripts that no test reaches. */
  untested: string[];
  scanned: number;
  truncated: boolean;
  alias: { prefix: string; target: string; assumed: boolean } | null;
}

/** Walks back from the changed files to everything that imports them, up to `depth` steps. */
export function analyzeImpact(changed: readonly string[], files: ReadonlyMap<string, string>, depth = 3): ImpactResult {
  const set = new Set(files.keys());
  const { aliases, assumed } = aliasesFrom(files);
  const importers = new Map<string, Set<string>>();
  const imports = new Map<string, Set<string>>();
  let scanned = 0;
  for (const [path, content] of files) {
    if (!isScanned(path)) continue;
    scanned++;
    const specs = HTML.test(path) ? htmlReferences(content) : importSpecifiers(content);
    for (const spec of specs) {
      const target = resolveSpecifier(path, spec, set, aliases);
      if (!target || target === path) continue;
      let by = importers.get(target);
      if (!by) importers.set(target, (by = new Set()));
      by.add(path);
      let to = imports.get(path);
      if (!to) imports.set(path, (to = new Set()));
      to.add(target);
    }
  }

  // Breadth-first from the changed files; each file is reached once, by its shortest route.
  const reached = new Map<string, Reach>();
  const changedSet = new Set(changed);
  let frontier = [...changedSet];
  for (let d = 1; d <= depth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const target of frontier) {
      for (const importer of importers.get(target) ?? []) {
        if (changedSet.has(importer) || reached.has(importer)) continue;
        reached.set(importer, { path: importer, via: target, depth: d });
        next.push(importer);
      }
    }
    frontier = next;
  }

  const all = [...reached.values()];
  const truncated = all.length > MAX_REACH;
  const touched = [...changed, ...all.map((r) => r.path)];
  const tests = touched.filter(isTest);
  // A changed file is tested when some test imports it, directly or within the same number of steps.
  const testedChanges = new Set<string>();
  for (const t of tests) {
    const seen = new Set([t]);
    let front = [t];
    for (let d = 0; d < depth && front.length > 0; d++) {
      const next: string[] = [];
      for (const from of front) {
        for (const target of imports.get(from) ?? []) {
          if (seen.has(target)) continue;
          seen.add(target);
          if (changedSet.has(target)) testedChanges.add(target);
          next.push(target);
        }
      }
      front = next;
    }
  }
  return {
    changed: changed.map((path) => ({ path, importers: importers.get(path)?.size ?? 0, tested: isTest(path) || testedChanges.has(path) })),
    direct: all.filter((r) => r.depth === 1).slice(0, MAX_REACH),
    further: all.filter((r) => r.depth > 1).slice(0, MAX_REACH),
    pages: [...new Set(touched.filter(isPage))].slice(0, MAX_REACH),
    tests: [...new Set(tests)].slice(0, MAX_REACH),
    untested: changed.filter((p) => isScript(p) && !isTest(p) && !testedChanges.has(p)),
    scanned,
    truncated,
    alias: aliases[0] ? { ...aliases[0], assumed } : null,
  };
}
