import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { projectLaunchFiles } from "./files";

describe("what a launch sends (ADR 0108)", () => {
  it("is the text files and the images, sorted by path, each hashed over the bytes sent", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const files = await projectLaunchFiles(
      {
        getProjectContents: async () => [{ path: "index.html", content: "<img src=\"a.png\">" }],
        getProjectImages: async () => [{ path: "a.png", base64: png.toString("base64") }],
      },
      "o1",
      "p1",
    );
    expect(files.map((f) => f.path)).toEqual(["a.png", "index.html"]);
    expect(files[0]).toMatchObject({ encoding: "base64", sha256: createHash("sha256").update(png).digest("hex") });
    expect(files[1]).toMatchObject({ sha256: createHash("sha256").update("<img src=\"a.png\">", "utf8").digest("hex") });
    expect(files[1]).not.toHaveProperty("encoding");
  });
});
