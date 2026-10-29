import { describe, expect, it } from "vitest";
import { previewImages, referencedImageRefs, someImages } from "./preview-images";
import type { ProjectFile, ProjectFileContent } from "./types";

const file = (path: string, sizeBytes: number, image = false): ProjectFile => ({ path, revision: 1, sizeBytes, sha256: "a".repeat(64), updatedAt: "2026-10-29T00:00:00Z", ...(image ? { encoding: "base64" as const } : {}) });

describe("images for previews (ADR 0108)", () => {
  it("finds the image references a page or stylesheet makes", () => {
    expect(referencedImageRefs(`<img src="a.png" srcset="b.webp 1x, c.webp 2x"><link rel="icon" href="/favicon.ico"><div style="background:url('d.jpg')"></div>`).sort()).toEqual(["/favicon.ico", "a.png", "b.webp", "c.webp", "d.jpg"]);
    expect(referencedImageRefs("body{background:url(img/bg.png)}")).toEqual(["img/bg.png"]);
  });

  it("returns every image as a data URL while they fit the budget, and nothing past it", async () => {
    const reader = {
      listFiles: async () => [file("index.html", 100), file("a.png", 1000, true), file("b.jpg", 500, true)],
      getProjectImages: async () => [
        { path: "a.png", base64: "QUFB" },
        { path: "b.jpg", base64: "QkJC" },
      ],
    };
    expect(await previewImages(reader, "o1", "p1")).toEqual({ "a.png": "data:image/png;base64,QUFB", "b.jpg": "data:image/jpeg;base64,QkJC" });
    expect(await previewImages(reader, "o1", "p1", 1_200)).toBeUndefined();
    expect(await previewImages({ ...reader, listFiles: async () => [file("index.html", 100)] }, "o1", "p1")).toBeUndefined();
  });

  it("reads only the images asked for, skipping ones that don't fit or aren't images", async () => {
    const asked: string[] = [];
    const reader = {
      getFile: async (_o: string, _p: string, path: string): Promise<ProjectFileContent | null> => (asked.push(path), path === "x.png" ? { ...file("x.png", 10, true), content: "WFhY" } : { ...file(path, 10), content: "text" }),
    };
    const out = await someImages(reader, "o1", "p1", [{ path: "x.png", sizeBytes: 10 }, { path: "big.png", sizeBytes: 5_000 }, { path: "notes.png", sizeBytes: 10 }], 100);
    expect(out).toEqual({ "x.png": "data:image/png;base64,WFhY" });
    expect(asked).toEqual(["x.png", "notes.png"]);
  });
});
