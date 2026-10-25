/**
 * GitHub import against real GitHub (ADR 0074): downloads small public
 * repositories through the same code the server uses, then unpacks and
 * screens them. Off unless FARBAEK_SMOKE_GITHUB=1, since it uses the network.
 *
 *   FARBAEK_SMOKE_GITHUB=1 pnpm exec vitest run tests/smoke/github.smoke.test.ts
 */
import { describe, expect, it } from "vitest";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { parseGitHubSource } from "@/core/workspace/github";
import { rescueFilesFromZip } from "@/core/workspace/rescue-zip";
import { GITHUB_MESSAGES, downloadArchive } from "@/server/workspace/github-import";

const on = process.env.FARBAEK_SMOKE_GITHUB === "1";

describe.skipIf(!on)("GitHub import against github.com", () => {
  it("downloads the default branch at an exact commit and screens it", async () => {
    const download = await downloadArchive(parseGitHubSource("https://github.com/octocat/Hello-World")!);
    expect(download.ok).toBe(true);
    if (!download.ok) return;
    expect(download.commit).toMatch(/^[0-9a-f]{40}$/);
    const files = await rescueFilesFromZip(download.data, { maxFileBytes: WORKSPACE_LIMITS.maxFileBytes, maxEntries: 50_000 });
    expect(files.files.map((f) => f.path)).toEqual(["README"]);
  }, 60_000);

  it("downloads a tag, with the commit read from the archive", async () => {
    const download = await downloadArchive(parseGitHubSource("https://github.com/sindresorhus/slugify/tree/v2.2.1")!);
    expect(download.ok).toBe(true);
    if (!download.ok) return;
    expect(download.commit).toMatch(/^[0-9a-f]{40}$/);
    const files = await rescueFilesFromZip(download.data, { maxFileBytes: WORKSPACE_LIMITS.maxFileBytes, maxEntries: 50_000 });
    expect(files.files.some((f) => f.path === "package.json")).toBe(true);
    expect(files.files.every((f) => !f.path.startsWith("slugify-"))).toBe(true);
  }, 60_000);

  it("says plainly when a repository can't be found", async () => {
    expect(await downloadArchive(parseGitHubSource("octocat/no-such-repository-farbaek-check")!)).toEqual({ ok: false, message: GITHUB_MESSAGES.notFound });
  }, 60_000);
});
