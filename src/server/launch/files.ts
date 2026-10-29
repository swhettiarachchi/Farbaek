/**
 * Exactly what a launch sends (ADR 0078, ADR 0093): the project's text files
 * and its images as bytes (ADR 0108), sorted by path. The Launch page's
 * fingerprint and the authorized launch both come from this list, so what a
 * person approves is what goes.
 */
import { createHash } from "node:crypto";
import type { WorkspaceReader } from "@/server/workspace/types";
import { fileSha256, type LaunchFile } from "./provider-launch";

export async function projectLaunchFiles(reader: Pick<WorkspaceReader, "getProjectContents" | "getProjectImages">, orgId: string, projectId: string): Promise<LaunchFile[]> {
  const [text, images] = await Promise.all([reader.getProjectContents(orgId, projectId), reader.getProjectImages(orgId, projectId)]);
  return [
    ...text.map((f) => ({ path: f.path, content: f.content, sha256: fileSha256(f.content) })),
    ...images.map((i) => ({ path: i.path, content: i.base64, encoding: "base64" as const, sha256: createHash("sha256").update(Buffer.from(i.base64, "base64")).digest("hex") })),
  ].sort((a, b) => a.path.localeCompare(b.path));
}
