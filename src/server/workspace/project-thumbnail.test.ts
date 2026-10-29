import { describe, expect, it } from "vitest";
import { THUMBNAIL_BUDGET_BYTES, projectThumbnail } from "./project-thumbnail";
import type { ProjectFile } from "./types";

function reader(files: Record<string, string>, sizes: Record<string, number> = {}) {
  const read: string[] = [];
  const list: ProjectFile[] = Object.entries(files).map(([path, content]) => ({
    path,
    revision: 1,
    sizeBytes: sizes[path] ?? content.length,
    ...(/.(png|jpe?g|webp|gif)$/.test(path) ? { encoding: "base64" as const } : {}),
    sha256: "0".repeat(64),
    updatedAt: "2026-10-20T00:00:00Z",
  }));
  return {
    read,
    r: {
      listFiles: async () => list,
      getFile: async (_o: string, _p: string, path: string) => {
        read.push(path);
        const f = list.find((x) => x.path === path);
        return f ? { ...f, content: files[path]! } : null;
      },
    },
  };
}

describe("project thumbnails", () => {
  it("show the images the page and its stylesheet use (ADR 0108)", async () => {
    const { r, read } = reader({
      "index.html": '<link rel="stylesheet" href="css/site.css"><img src="assets/logo.png" alt=""><img src="assets/unused.png" hidden>',
      "css/site.css": "body{background:url(../assets/bg.jpg)}",
      "assets/logo.png": "TE9HTw==",
      "assets/bg.jpg": "QkdCRw==",
      "assets/other.webp": "T1RIRVI=",
    });
    const t = await projectThumbnail(r, "o1", "p1");
    expect(t.kind).toBe("static");
    const doc = t.kind === "static" ? t.srcdoc : "";
    expect(doc).toContain('src="data:image/png;base64,TE9HTw=="');
    expect(doc).toContain("url(data:image/jpeg;base64,QkdCRw==)");
    // Only images the page refers to are read.
    expect(read).not.toContain("assets/other.webp");
  });

  it("fold the home page and the stylesheets it links into one locked-down document", async () => {
    const { r, read } = reader({
      "index.html": '<html><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="https://cdn.example.com/x.css"><script src="script.js"></script></head><body><h1>Hi</h1></body></html>',
      "styles.css": "h1{color:red}",
      "script.js": "alert(1)",
      "notes.md": "# notes",
    });
    const t = await projectThumbnail(r, "o", "p");
    expect(t.kind).toBe("static");
    if (t.kind !== "static") return;
    expect(t.srcdoc).toContain("h1{color:red}");
    expect(t.srcdoc).toContain("Content-Security-Policy");
    // Only the page and its own stylesheet are read: never scripts or other files.
    expect(read).toEqual(["index.html", "styles.css"]);
  });

  it("skip stylesheets beyond the size budget", async () => {
    const { r, read } = reader({ "index.html": '<link rel="stylesheet" href="big.css"><p>x</p>', "big.css": "a{}" }, { "big.css": THUMBNAIL_BUDGET_BYTES });
    const t = await projectThumbnail(r, "o", "p");
    expect(t.kind).toBe("static");
    expect(read).toEqual(["index.html"]);
  });

  it("call apps with a server apps, and say when there's nothing to show", async () => {
    expect(await projectThumbnail(reader({ "package.json": "{}", "next.config.ts": "", "app/page.tsx": "" }).r, "o", "p")).toEqual({ kind: "app" });
    expect(await projectThumbnail(reader({}).r, "o", "p")).toEqual({ kind: "empty" });
    expect(await projectThumbnail(reader({ "package.json": "{}", "src/main.ts": "" }).r, "o", "p")).toEqual({ kind: "app" });
    expect(await projectThumbnail(reader({ "README.md": "# x" }).r, "o", "p")).toEqual({ kind: "empty" });
    expect(await projectThumbnail(reader({ "index.html": "x" }, { "index.html": THUMBNAIL_BUDGET_BYTES + 1 }).r, "o", "p")).toEqual({ kind: "empty" });
  });
});
