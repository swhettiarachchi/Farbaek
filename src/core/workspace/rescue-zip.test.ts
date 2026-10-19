import { describe, expect, it } from "vitest";
import { commonRoot, rescueFilesFromZip } from "./rescue-zip";
import { zipFiles } from "./zip";

describe("rescueFilesFromZip", () => {
  it("drops the top folder, keeps source files and leaves out secrets, binaries and dependency folders", async () => {
    const zip = zipFiles([
      { path: "my-app-main/index.html", content: "<h1>Hi</h1>\n" },
      { path: "my-app-main/src/app.js", content: "export const x = 1;\n" },
      { path: "my-app-main/.env", content: "API_KEY=abc\n" },
      { path: "my-app-main/node_modules/left-pad/index.js", content: "module.exports = 1;\n" },
      { path: "my-app-main/dist/bundle.js", content: "minified();\n" },
    ]);
    const r = await rescueFilesFromZip(zip, { maxFileBytes: 10_000 });
    expect(r.files.map((f) => f.path)).toEqual(["index.html", "src/app.js"]);
    expect(r.skipped).toEqual([{ path: ".env", reason: "secret_file" }]);
    expect(r.ignored).toBe(2);
    expect(r.bytes).toBe(new TextEncoder().encode("<h1>Hi</h1>\nexport const x = 1;\n").length);
  });

  it("keeps paths as they are when there's no single top folder", () => {
    expect(commonRoot(["index.html", "src/a.js"])).toBeNull();
    expect(commonRoot(["a/x.js", "b/y.js"])).toBeNull();
    expect(commonRoot(["app/x.js", "app/src/y.js"])).toBe("app");
  });
});
