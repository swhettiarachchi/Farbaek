/**
 * A picture of a project's site for project cards: its index.html and the
 * stylesheets it links, folded into one document by the static preview
 * builder (ADR 0027). Only those few files are read, within a size budget,
 * and the card shows it in a frame that runs no scripts (`sandbox=""`), so
 * it's a picture, never a running page.
 */
import { runProfile } from "@/content/starters";
import { buildStaticSrcdoc, pictureSrcdoc, resolveSitePath } from "@/core/workspace/static-preview";
import type { WorkspaceReader } from "./types";

export type ProjectThumbnail =
  | { kind: "static"; srcdoc: string }
  /** An app that needs a server (Next.js and the like): it previews in a sandbox, not as a picture. */
  | { kind: "app" }
  | { kind: "empty" };

/** At most this much HTML and CSS goes into one picture. */
export const THUMBNAIL_BUDGET_BYTES = 600 * 1024;
const MAX_STYLESHEETS = 4;

type Reader = Pick<WorkspaceReader, "listFiles" | "getFile">;

export async function projectThumbnail(reader: Reader, orgId: string, projectId: string): Promise<ProjectThumbnail> {
  const files = await reader.listFiles(orgId, projectId);
  if (files.length === 0) return { kind: "empty" };
  const paths = files.map((f) => f.path);
  const index = files.find((f) => f.path === "index.html");
  if (runProfile(paths).kind === "node" || (!index && paths.includes("package.json"))) return { kind: "app" };
  if (!index || index.sizeBytes > THUMBNAIL_BUDGET_BYTES) return { kind: "empty" };

  const html = (await reader.getFile(orgId, projectId, "index.html"))?.content;
  if (html === undefined) return { kind: "empty" };

  const sizes = new Map(files.map((f) => [f.path, f.sizeBytes]));
  const wanted = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /\brel\s*=\s*["']?stylesheet/i.test(tag))
    .map((tag) => /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1])
    .map((href) => (href ? resolveSitePath("index.html", href) : null))
    .filter((p): p is string => p !== null && sizes.has(p))
    .slice(0, MAX_STYLESHEETS);

  let budget = THUMBNAIL_BUDGET_BYTES - index.sizeBytes;
  const parts: Record<string, string> = { "index.html": html };
  for (const path of wanted) {
    const size = sizes.get(path)!;
    if (size > budget) continue;
    const css = (await reader.getFile(orgId, projectId, path))?.content;
    if (css === undefined) continue;
    parts[path] = css;
    budget -= size;
  }
  const srcdoc = buildStaticSrcdoc(parts, "index.html");
  return srcdoc ? { kind: "static", srcdoc: pictureSrcdoc(srcdoc) } : { kind: "empty" };
}
