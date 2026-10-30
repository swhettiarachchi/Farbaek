/**
 * Known vulnerabilities from OSV.dev (ADR 0130), the open database behind
 * OSV-Scanner. Farbaek reads the exact versions a project's lockfiles pin,
 * never a guess from a range, and turns the advisories OSV.dev returns
 * into findings. Only package names and versions are ever sent.
 */
import type { Finding, Severity } from "./findings";
import type { ProjectFile } from "./rules";

export type Ecosystem = "npm" | "PyPI";

export interface LockedPackage {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  /** The lockfile it came from, for the finding's location. */
  file: string;
}

const MAX_PACKAGES = 3_000;
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i;
const VERSION = /^[0-9][0-9A-Za-z.+_-]{0,63}$/;
const PY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** PEP 503: Python names compare lowercased, with runs of -, _ and . as one -. */
export const pythonName = (n: string) => n.toLowerCase().replace(/[-_.]+/g, "-");

function fromPackageLock(file: ProjectFile, out: LockedPackage[]) {
  let data: { packages?: Record<string, { version?: unknown; link?: unknown }>; dependencies?: Record<string, unknown> };
  try {
    data = JSON.parse(file.content);
  } catch {
    return;
  }
  if (data.packages && typeof data.packages === "object") {
    for (const [key, info] of Object.entries(data.packages)) {
      if (!key || info?.link) continue;
      const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
      if (typeof info?.version === "string") out.push({ ecosystem: "npm", name, version: info.version, file: file.path });
    }
    return;
  }
  // Lockfile v1: nested dependencies.
  const walk = (deps: Record<string, unknown> | undefined) => {
    for (const [name, raw] of Object.entries(deps ?? {})) {
      const info = raw as { version?: unknown; dependencies?: Record<string, unknown> } | null;
      if (typeof info?.version === "string") out.push({ ecosystem: "npm", name, version: info.version, file: file.path });
      walk(info?.dependencies);
    }
  };
  walk(data.dependencies);
}

function fromPnpmLock(file: ProjectFile, out: LockedPackage[]) {
  // Keys under packages: "  /name@1.2.3:" (v6) or "  name@1.2.3:" / "  '@scope/name@1.2.3':" (v9), maybe with "(peer@x)" after.
  for (const m of file.content.matchAll(/^ {2}['"]?\/?((?:@[^@/\s'"]+\/)?[^@\s'"/(]+)@([0-9][^(:\s'"]*)(?:\([^\n]*?\))*['"]?:\s*$/gm)) {
    out.push({ ecosystem: "npm", name: m[1]!, version: m[2]!, file: file.path });
  }
}

function fromYarnLock(file: ProjectFile, out: LockedPackage[]) {
  // An entry: one or more "name@range" keys, then an indented version line.
  const blocks = file.content.split(/\n(?=\S)/);
  for (const block of blocks) {
    const [head, ...body] = block.split("\n");
    if (!head || head.startsWith("#") || !head.trimEnd().endsWith(":")) continue;
    const firstKey = head.replace(/:$/, "").split(",")[0]!.trim().replace(/^"|"$/g, "");
    const at = firstKey.lastIndexOf("@");
    const name = at > 0 ? firstKey.slice(0, at) : null;
    const version = body.map((l) => /^\s+version:?\s+"?([^"\s]+)"?/.exec(l)?.[1]).find(Boolean);
    if (name && version) out.push({ ecosystem: "npm", name, version, file: file.path });
  }
}

function fromRequirements(file: ProjectFile, out: LockedPackage[]) {
  for (const line of file.content.split("\n")) {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([0-9][^\s;#,]*)/.exec(line);
    if (m) out.push({ ecosystem: "PyPI", name: pythonName(m[1]!), version: m[2]!, file: file.path });
  }
}

function fromPoetryLock(file: ProjectFile, out: LockedPackage[]) {
  for (const block of file.content.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (name && version) out.push({ ecosystem: "PyPI", name: pythonName(name), version, file: file.path });
  }
}

const READERS: [RegExp, (f: ProjectFile, out: LockedPackage[]) => void][] = [
  [/(^|\/)package-lock\.json$/, fromPackageLock],
  [/(^|\/)pnpm-lock\.yaml$/, fromPnpmLock],
  [/(^|\/)yarn\.lock$/, fromYarnLock],
  [/(^|\/)requirements[^/]*\.txt$/, fromRequirements],
  [/(^|\/)poetry\.lock$/, fromPoetryLock],
];

/** Every exact version the project's lockfiles pin, and which lockfiles were read. */
export function lockfilePackages(files: readonly ProjectFile[]): { packages: LockedPackage[]; lockfiles: string[]; capped: boolean } {
  const found: LockedPackage[] = [];
  const lockfiles: string[] = [];
  for (const f of files) {
    if (/(^|\/)node_modules\//.test(f.path)) continue;
    const reader = READERS.find(([re]) => re.test(f.path))?.[1];
    if (!reader) continue;
    lockfiles.push(f.path);
    reader(f, found);
  }
  const seen = new Set<string>();
  const packages = found.filter((p) => {
    const valid = VERSION.test(p.version) && (p.ecosystem === "npm" ? NPM_NAME.test(p.name) : PY_NAME.test(p.name));
    const key = `${p.ecosystem}|${p.name}|${p.version}`;
    if (!valid || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { packages: packages.slice(0, MAX_PACKAGES), lockfiles, capped: packages.length > MAX_PACKAGES };
}

/** The body of one OSV.dev batch query. */
export function osvQueries(pkgs: readonly LockedPackage[]) {
  return { queries: pkgs.map((p) => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) };
}

export interface OsvAdvisory {
  id: string;
  summary: string | null;
  severity: string | null;
  aliases: string[];
  affected: { package: { name: string; ecosystem: string }; ranges: { events: Record<string, string>[] }[] }[];
}

const SEVERITY: Record<string, Severity> = { CRITICAL: "critical", HIGH: "high", MODERATE: "medium", MEDIUM: "medium", LOW: "low" };

/** The first version that fixes the advisory for this package, as OSV.dev lists it. */
export function fixedVersion(advisory: OsvAdvisory, pkg: LockedPackage): string | null {
  const name = (n: string) => (pkg.ecosystem === "PyPI" ? pythonName(n) : n);
  for (const a of advisory.affected) {
    if (a.package.ecosystem !== pkg.ecosystem || name(a.package.name) !== pkg.name) continue;
    for (const r of a.ranges) for (const e of r.events) if (typeof e.fixed === "string") return e.fixed;
  }
  return null;
}

/**
 * One finding per vulnerable package and advisory. An advisory OSV.dev
 * named but whose details couldn't be fetched still counts, at medium,
 * with its id so people can look it up.
 */
export function osvFindings(hits: { pkg: LockedPackage; ids: string[] }[], details: ReadonlyMap<string, OsvAdvisory>, maxFindings = 60): Finding[] {
  const out: Finding[] = [];
  for (const { pkg, ids } of hits) {
    for (const id of ids) {
      const a = details.get(id) ?? null;
      const fixed = a ? fixedVersion(a, pkg) : null;
      const cve = a?.aliases.find((x) => x.startsWith("CVE-"));
      out.push({
        id: "",
        rule: id,
        severity: (a?.severity && SEVERITY[a.severity.toUpperCase()]) || "medium",
        source: "dependencies",
        title: `${pkg.name} ${pkg.version}: ${(a?.summary ?? `a known vulnerability (${id})`).slice(0, 160)}`,
        detail: `${id}${cve ? ` (${cve})` : ""} affects this version of ${pkg.name}, according to OSV.dev. Details: https://osv.dev/vulnerability/${encodeURIComponent(id)}`,
        fix: fixed ? `Update ${pkg.name} to ${fixed} or later, then refresh the lockfile.` : `No fixed version of ${pkg.name} is listed yet. Check whether the project uses the affected part, or replace the package.`,
        file: pkg.file,
        line: null,
      });
    }
  }
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]).slice(0, maxFindings);
}
