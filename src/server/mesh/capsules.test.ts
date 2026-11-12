import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildCapsule, encodeCapsule } from "@/core/mesh/capsule";
import type { FileDeps } from "@/server/workspace/files";
import type { WorkspaceReader } from "@/server/workspace/types";
import type { WriteDeps } from "@/server/workspace/use-cases";
import { importCapsule, packProject, projectHashes } from "./capsules";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const OTHER_PNG = PNG.slice();
OTHER_PNG[OTHER_PNG.length - 5] ^= 0x01;

const ORG = "org-1";
const PROJECT = "project-1";

/** A project with a page and one image, at revision 3. */
function reader(): WorkspaceReader {
  return {
    getProject: async () => ({ id: PROJECT, name: "Harbor Café", description: null, createdAt: "2026-11-01T00:00:00Z", archivedAt: null }),
    getProjectContents: async () => [{ path: "index.html", content: "<img src=assets/dot.png>" }],
    getProjectImages: async () => [{ path: "assets/dot.png", base64: Buffer.from(OTHER_PNG).toString("base64") }],
    listFiles: async () => [
      { path: "assets/dot.png", revision: 3, sizeBytes: OTHER_PNG.length, sha256: "x", updatedAt: "2026-11-01T00:00:00Z", encoding: "base64" as const },
      { path: "index.html", revision: 1, sizeBytes: 24, sha256: "y", updatedAt: "2026-11-01T00:00:00Z" },
    ],
  } as unknown as WorkspaceReader;
}

function deps() {
  const saved: { path: string; expectedRevision: number; bytes: number }[] = [];
  const imported: string[][] = [];
  const d = {
    role: async () => "owner",
    importFiles: async (i: { files: { path: string }[] }) => {
      imported.push(i.files.map((f) => f.path));
      return { ok: true, value: { created: i.files.length, updated: 0, unchanged: 0 } };
    },
    saveImage: async (i: { path: string; expectedRevision: number; base64: string }) => {
      saved.push({ path: i.path, expectedRevision: i.expectedRevision, bytes: Buffer.from(i.base64, "base64").length });
      return { ok: true, value: i.expectedRevision + 1 };
    },
  } as unknown as WriteDeps & FileDeps;
  return { d, saved, imported };
}

function capsule() {
  return encodeCapsule(
    buildCapsule({
      id: "capsule-images-01",
      createdAt: "2026-11-12T00:00:00.000Z",
      projectId: "elsewhere",
      projectName: "Harbor Café",
      maxFileBytes: 512 * 1024,
      files: [
        { path: "index.html", content: "<img src=assets/dot.png>" },
        { path: "assets/dot.png", content: PNG },
        { path: "assets/new.png", content: PNG },
      ],
    }),
  );
}

describe("Capsules with images on the server (stage 179)", () => {
  it("packs a project's images with its text, and hashes images over their bytes", async () => {
    const packed = await packProject(reader(), ORG, PROJECT);
    expect(packed?.files).toBe(2);
    expect(packed?.excluded).toEqual([]);
    const hashes = await projectHashes(reader(), ORG, PROJECT);
    expect(hashes.map((h) => h.path).sort()).toEqual(["assets/dot.png", "index.html"]);
  });

  it("writes new images and a kept copy beside a differing one, each through the image path", async () => {
    const { d, saved, imported } = deps();
    const r = await importCapsule(d, reader(), {
      orgId: ORG,
      userId: "user-1",
      data: capsule(),
      destination: { kind: "existing", projectId: PROJECT },
      choices: { "assets/dot.png": "keep_both" },
    });
    expect(r.ok).toBe(true);
    // The page is unchanged, so no text is written.
    expect(imported).toEqual([]);
    expect(saved).toEqual([
      { path: "assets/dot.capsule.png", expectedRevision: 0, bytes: PNG.length },
      { path: "assets/new.png", expectedRevision: 0, bytes: PNG.length },
    ]);
  });

  it("replaces a differing image over the revision it replaces, only when chosen", async () => {
    const { d, saved } = deps();
    await importCapsule(d, reader(), { orgId: ORG, userId: "user-1", data: capsule(), destination: { kind: "existing", projectId: PROJECT }, choices: { "assets/dot.png": "take" } });
    expect(saved.find((s) => s.path === "assets/dot.png")).toEqual({ path: "assets/dot.png", expectedRevision: 3, bytes: PNG.length });
    const kept = deps();
    await importCapsule(kept.d, reader(), { orgId: ORG, userId: "user-1", data: capsule(), destination: { kind: "existing", projectId: PROJECT }, choices: {} });
    expect(kept.saved.map((s) => s.path)).toEqual(["assets/new.png"]);
  });
});
