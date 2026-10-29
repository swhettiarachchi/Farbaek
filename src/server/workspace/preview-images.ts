/**
 * A project's images as data URLs, for previews that run without a network
 * (ADR 0108): the project page, a run's preview and project thumbnails. Only
 * while they fit a budget, so a page never carries megabytes it won't show.
 */
import { imageMime } from "@/core/workspace/images";
import type { WorkspaceReader } from "./types";

/** Images for an interactive preview: all of them, while they total 8 MB or less. */
export const PREVIEW_IMAGE_BUDGET = 8 * 1024 * 1024;

const dataUrl = (path: string, base64: string) => `data:${imageMime(path) ?? "application/octet-stream"};base64,${base64}`;

/** Every image in the project, as data URLs by path, or undefined when there are none or they're over the budget. */
export async function previewImages(reader: Pick<WorkspaceReader, "listFiles" | "getProjectImages">, orgId: string, projectId: string, budget = PREVIEW_IMAGE_BUDGET): Promise<Record<string, string> | undefined> {
  const files = await reader.listFiles(orgId, projectId).catch(() => []);
  const bytes = files.filter((f) => f.encoding === "base64").reduce((n, f) => n + f.sizeBytes, 0);
  if (bytes === 0 || bytes > budget) return undefined;
  const images = await reader.getProjectImages(orgId, projectId).catch(() => []);
  return images.length > 0 ? Object.fromEntries(images.map((i) => [i.path, dataUrl(i.path, i.base64)])) : undefined;
}

/** Image paths a page refers to: src, href, poster and srcset attributes, and CSS url(). Not resolved. */
export function referencedImageRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(/\s(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) refs.add(m[1]!);
  for (const m of text.matchAll(/\ssrcset\s*=\s*["']([^"']+)["']/gi)) for (const part of m[1]!.split(",")) refs.add(part.trim().split(/\s+/)[0] ?? "");
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) refs.add(m[1]!);
  refs.delete("");
  return [...refs];
}

/** Specific images, read one by one, as data URLs, while they fit the budget. For thumbnails, which show one page. */
export async function someImages(reader: Pick<WorkspaceReader, "getFile">, orgId: string, projectId: string, paths: readonly { path: string; sizeBytes: number }[], budget: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let left = budget;
  for (const p of paths) {
    if (p.sizeBytes > left) continue;
    const file = await reader.getFile(orgId, projectId, p.path).catch(() => null);
    if (!file || file.encoding !== "base64") continue;
    out[p.path] = dataUrl(p.path, file.content);
    left -= p.sizeBytes;
  }
  return out;
}
