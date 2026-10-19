/**
 * Publishing a static site (Phase E, ADR 0029): the rules shared by the
 * server, the database checks and the page. A site lives at
 * `<name>.<site domain>`; what goes live is a fixed list of the project's
 * file revisions, recorded with a SHA-256 digest of that list.
 */
import { previewDomainHost } from "@/core/sandbox/preview";
import { canonicalHash } from "@/core/trust/canonical-json";

export const SITE_NAME_MIN = 3;
export const SITE_NAME_MAX = 40;

/**
 * Names that would be confusing or unsafe as someone's site: Farbaek's own
 * services, and anything starting with "p-", which preview hosts use.
 * The database repeats this list.
 */
export const RESERVED_SITE_NAMES: ReadonlySet<string> = new Set([
  "www", "app", "api", "admin", "auth", "login", "signin", "sign-in", "signup", "account", "accounts", "billing",
  "mail", "email", "smtp", "imap", "pop", "ftp", "ssh", "status", "docs", "help", "support", "security", "abuse",
  "farbaek", "preview", "previews", "static", "assets", "cdn", "dashboard", "console", "root", "localhost",
]);

const NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type SiteNameProblem = "length" | "characters" | "reserved";

export function siteNameProblem(name: string): SiteNameProblem | null {
  if (name.length < SITE_NAME_MIN || name.length > SITE_NAME_MAX) return "length";
  if (!NAME.test(name) || name.includes("--")) return "characters";
  if (RESERVED_SITE_NAMES.has(name) || name.startsWith("p-")) return "reserved";
  return null;
}

export const SITE_NAME_MESSAGES: Record<SiteNameProblem, string> = {
  length: `Use ${SITE_NAME_MIN} to ${SITE_NAME_MAX} characters.`,
  characters: "Use lowercase letters, numbers and single hyphens, starting and ending with a letter or number.",
  reserved: "That name is kept for Farbaek. Choose another.",
};

/** The internal route site hosts are rewritten to (src/proxy.ts). */
export const SITE_ROUTE = "/site-serve";

/** The site name a request is for, or null when the host isn't a single valid name on the site domain. */
export function siteNameFromHost(host: string | null, domain: string | null): string | null {
  if (previewDomainHost(host, domain) !== "other" || !host || !domain) return null;
  const label = host.trim().toLowerCase().replace(/\.$/, "").slice(0, -(domain.trim().length + 1));
  return !label.includes(".") && siteNameProblem(label) === null ? label : null;
}

/** A site name suggested from a project's name: "Sunrise Bakery!" becomes "sunrise-bakery". */
export function siteNameFrom(projectName: string): string {
  const slug = projectName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SITE_NAME_MAX)
    .replace(/-+$/, "");
  if (!slug || siteNameProblem(slug) === "reserved") return `site-${slug || "new"}`.slice(0, SITE_NAME_MAX).replace(/-+$/, "");
  return slug.length < SITE_NAME_MIN ? `${slug}-site` : slug;
}

/** One file as published: exactly which stored revision went live. */
export interface PublishedFile {
  path: string;
  revision: number;
  sha256: string;
  size: number;
}

/** The deployment's digest: SHA-256 over the canonical JSON of its project and files, sorted by path. */
export async function deploymentDigest(projectId: string, files: readonly PublishedFile[]): Promise<string> {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((f) => ({ path: f.path, revision: f.revision, sha256: f.sha256, size: f.size }));
  return canonicalHash({ type: "https://farbaek.dev/site-deployment/v1", project: projectId, files: sorted });
}

/** Whether the project's files now differ from what's live, by digest. */
export function hasUnpublishedChanges(liveDigest: string | null, currentDigest: string): boolean {
  return liveDigest !== null && liveDigest !== currentDigest;
}

export type PublishBlock =
  | { code: "NO_DOMAIN"; message: string }
  | { code: "NOT_STATIC"; message: string }
  | { code: "NO_INDEX"; message: string }
  | { code: "NO_CHECK"; message: string }
  | { code: "CHECK_RUNNING"; message: string }
  | { code: "CHECK_STALE"; message: string }
  | { code: "CRITICAL_FINDINGS"; message: string };

export interface GateInput {
  domain: string | null;
  profile: "static" | "node" | "unknown";
  paths: readonly string[];
  /** When the project's files last changed (newest file update). */
  filesChangedAt: string | null;
  /** The project's latest security check. */
  check: { status: "running" | "done" | "failed"; startedAt: string; critical: number } | null;
}

/**
 * What stops a publish, if anything, in the order a person would fix it. A
 * site goes live only after a security check of exactly these files found
 * nothing critical.
 */
export function publishGate(input: GateInput): PublishBlock | null {
  if (!input.domain) return { code: "NO_DOMAIN", message: "Publishing turns on when Farbaek's site domain is connected." };
  if (input.profile === "node") return { code: "NOT_STATIC", message: "Apps with a server can't be published yet. Static sites (HTML, CSS and JavaScript) can." };
  if (!input.paths.includes("index.html")) return { code: "NO_INDEX", message: "Add an index.html first: it's the page people see." };
  if (!input.check || input.check.status === "failed") return { code: "NO_CHECK", message: "Run a security check first. Publishing needs one that found nothing critical." };
  if (input.check.status === "running") return { code: "CHECK_RUNNING", message: "The security check is still running. Publish when it's done." };
  if (input.filesChangedAt && Date.parse(input.filesChangedAt) > Date.parse(input.check.startedAt)) {
    return { code: "CHECK_STALE", message: "The files changed after the last security check. Run it again, then publish." };
  }
  if (input.check.critical > 0) return { code: "CRITICAL_FINDINGS", message: `The last check found ${input.check.critical} critical ${input.check.critical === 1 ? "problem" : "problems"}. Fix ${input.check.critical === 1 ? "it" : "them"} first.` };
  return null;
}
