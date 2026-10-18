import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, zipFiles } from "./zip";

/** Extracts with an independent tool: Windows' bsdtar, or unzip elsewhere. */
function extract(archive: string, out: string) {
  if (process.platform === "win32") execFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", archive, "-C", out]);
  else execFileSync("unzip", ["-q", archive, "-d", out]);
}

describe("project zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes an archive the system tar extracts byte for byte, with UTF-8 names and folders", () => {
    const files = [
      { path: "README.md", content: "# Demo\n" },
      { path: "app/page.tsx", content: "export default function Page() {\n  return <p>Héllo, 世界</p>;\n}\n" },
      { path: "docs/naïve notes.md", content: "" },
    ];
    const dir = mkdtempSync(path.join(os.tmpdir(), "farbaek-zip-"));
    try {
      const archive = path.join(dir, "project.zip");
      writeFileSync(archive, zipFiles(files, new Date("2026-10-18T12:34:56Z")));
      const out = path.join(dir, "out");
      mkdirSync(out);
      extract(archive, out);
      for (const f of files) expect(readFileSync(path.join(out, ...f.path.split("/")), "utf8")).toBe(f.content);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is a valid empty archive with no files", () => {
    const empty = zipFiles([]);
    expect(empty.length).toBe(22);
    expect(new DataView(empty.buffer).getUint32(0, true)).toBe(0x06054b50);
  });
});
