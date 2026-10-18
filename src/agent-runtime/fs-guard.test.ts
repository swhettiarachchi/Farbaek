import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAgentPath } from "@/core/agent/paths";
import { FolderGuardError, ProjectFolder } from "./fs-guard";

let base: string;
let root: string;
let outside: string;
let folder: ProjectFolder;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (error) {
    return error instanceof FolderGuardError ? error.code : `other:${(error as NodeJS.ErrnoException).code}`;
  }
}

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-guard-"));
  root = path.join(base, "project");
  outside = path.join(base, "outside");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "x"), { recursive: true });
  await fs.mkdir(outside);
  await fs.writeFile(path.join(root, "README.md"), "# Demo\nRun pnpm test.\n");
  await fs.writeFile(path.join(root, "src", "app.ts"), "export const answer = 42;\n");
  await fs.writeFile(path.join(root, "node_modules", "x", "index.js"), "module.exports = 1;\n");
  await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0x89, 0x50, 0x00, 0x01]));
  await fs.writeFile(path.join(outside, "secret.txt"), "outside the project\n");
  // A junction needs no admin rights on Windows; elsewhere this makes a directory symlink.
  await fs.symlink(outside, path.join(root, "escape"), "junction");
  folder = await ProjectFolder.open(root);
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

describe("agent path rules", () => {
  it("refuse Windows-only hazards on top of the workspace rules", () => {
    expect(checkAgentPath("src/app.ts")).toEqual({ ok: true, path: "src/app.ts" });
    for (const bad of ["../x", "/etc/passwd", "C:/Windows", "a:stream", "CON", "src/nul.txt", "README.md.", "src /a", "ENVLOC~1.LOC", "a\\b"]) {
      expect(checkAgentPath(bad).ok, bad).toBe(false);
    }
  });
});

describe("project folder guard", () => {
  it("reads, lists, walks and searches inside the root", async () => {
    expect(await folder.read("README.md")).toContain("pnpm test");
    const listing = await folder.list("");
    expect(listing.entries.map((e) => `${e.name}:${e.kind}`)).toEqual(expect.arrayContaining(["README.md:file", "src:folder", "escape:link"]));
    const walk = await folder.walk();
    expect(walk.files).toEqual(["README.md", "image.bin", "src/app.ts"]);
    const found = await folder.search("ANSWER");
    expect(found.matches).toEqual([{ path: "src/app.ts", line: 1, text: "export const answer = 42;" }]);
  });

  it("refuses traversal, absolute and device paths before touching the disk", async () => {
    expect(await code(folder.read("../outside/secret.txt"))).toBe("INVALID_PATH");
    expect(await code(folder.read(path.join(outside, "secret.txt")))).toBe("INVALID_PATH");
    expect(await code(folder.write("NUL", "x"))).toBe("INVALID_PATH");
    expect(await code(folder.list("../"))).toBe("INVALID_PATH");
  });

  it("refuses to follow a junction or symlink that leads outside", async () => {
    expect(await code(folder.read("escape/secret.txt"))).toBe("LINK");
    expect(await code(folder.write("escape/new.txt", "x"))).toBe("LINK");
    expect(await code(folder.list("escape"))).toBe("LINK");
    expect(await fs.readdir(outside)).toEqual(["secret.txt"]);
  });

  it("refuses a file symlink, when this computer allows creating one", async () => {
    try {
      await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"), "file");
    } catch (error) {
      // Windows only lets administrators or Developer Mode create file symlinks.
      expect((error as NodeJS.ErrnoException).code).toBe("EPERM");
      return;
    }
    expect(await code(folder.read("link.txt"))).toBe("LINK");
    expect(await code(folder.write("link.txt", "overwritten"))).toBe("LINK");
    expect(await fs.readFile(path.join(outside, "secret.txt"), "utf8")).toBe("outside the project\n");
    await fs.unlink(path.join(root, "link.txt"));
  });

  it("refuses a hard link, which could name a file outside the project", async () => {
    await fs.link(path.join(outside, "secret.txt"), path.join(root, "hard.txt"));
    expect(await code(folder.read("hard.txt"))).toBe("LINK");
    expect(await code(folder.write("hard.txt", "overwritten"))).toBe("LINK");
    expect(await fs.readFile(path.join(outside, "secret.txt"), "utf8")).toBe("outside the project\n");
    await fs.unlink(path.join(root, "hard.txt"));
  });

  it("writes through a new file and a rename, creating folders one at a time", async () => {
    await folder.write("docs/guide/setup.md", "Setup\n");
    expect(await fs.readFile(path.join(root, "docs", "guide", "setup.md"), "utf8")).toBe("Setup\n");
    await folder.write("README.md", "# Demo\nRun pnpm test, then pnpm build.\n");
    expect(await folder.read("README.md")).toContain("pnpm build");
    expect((await fs.readdir(root)).some((n) => n.startsWith(".farbaek-"))).toBe(false);
    await folder.remove("docs/guide/setup.md");
    expect(await folder.exists("docs/guide/setup.md")).toBe(false);
  });

  it("refuses binary files, missing files and files over the limit", async () => {
    expect(await code(folder.read("image.bin"))).toBe("BINARY");
    expect(await code(folder.read("missing.md"))).toBe("NOT_FOUND");
    expect(await code(folder.read("src"))).toBe("NOT_A_FILE");
    const small = await ProjectFolder.open(root, { maxReadBytes: 8 });
    expect(await code(small.read("README.md"))).toBe("TOO_LARGE");
  });

  it("resolves a root given through a link once, then works inside the resolved folder", async () => {
    const viaLink = await ProjectFolder.open(path.join(root, "escape"));
    expect(viaLink.root).toBe(await fs.realpath(outside));
    expect(await viaLink.read("secret.txt")).toBe("outside the project\n");
  });
});
