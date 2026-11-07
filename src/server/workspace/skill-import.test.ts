import { describe, expect, it } from "vitest";
import { IMPORT_LIMITS, importSkillFromLink, type Fetcher } from "./skill-import";

const SKILL = "---\nname: house-style\ndescription: How our brand looks.\n---\n- One accent colour.\n";
const MIT = "MIT License\n\nCopyright (c) 2026 Someone\n\nPermission is hereby granted, free of charge, to any person";

/** A stand-in for GitHub: each address answers with its file, or 404. */
function github(files: Record<string, string | { status: number; headers?: Record<string, string> } | Error>) {
  const asked: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    asked.push({ url, init });
    const f = files[url];
    if (f instanceof Error) throw f;
    if (f === undefined) return new Response("404: Not Found", { status: 404 });
    if (typeof f === "string") return new Response(f, { status: 200, headers: { "content-type": "text/plain" } });
    return new Response(null, { status: f.status, headers: f.headers });
  };
  return { fetcher, asked };
}

const RAW = "https://raw.githubusercontent.com/someone/brand/main";

describe("bringing in a skill from GitHub (ADR 0179)", () => {
  it("reads the skill and the licence beside it, without following redirects", async () => {
    const { fetcher, asked } = github({ [`${RAW}/skills/house-style/SKILL.md`]: SKILL, [`${RAW}/skills/house-style/LICENSE`]: MIT });
    const r = await importSkillFromLink(fetcher, "https://github.com/someone/brand/tree/main/skills/house-style");
    expect(r).toMatchObject({ ok: true, value: { text: SKILL, skill: { name: "house-style" }, licence: { name: "MIT" } } });
    expect(asked.every((a) => a.init.redirect === "manual")).toBe(true);
  });

  it("finds a licence at the top of the repository, and says when there's none", async () => {
    const atTop = github({ [`${RAW}/skills/house-style/SKILL.md`]: SKILL, [`${RAW}/LICENSE.md`]: MIT });
    expect(await importSkillFromLink(atTop.fetcher, `${RAW}/skills/house-style/SKILL.md`)).toMatchObject({ ok: true, value: { licence: { name: "MIT" } } });
    const none = github({ [`${RAW}/skills/house-style/SKILL.md`]: SKILL });
    expect(await importSkillFromLink(none.fetcher, `${RAW}/skills/house-style/SKILL.md`)).toMatchObject({ ok: true, value: { licence: null } });
    expect(none.asked).toHaveLength(7);
  });

  it("stops looking for a licence when GitHub stops answering", async () => {
    const down = github({ [`${RAW}/skills/house-style/SKILL.md`]: SKILL, [`${RAW}/skills/house-style/LICENSE`]: new Error("network") });
    expect(await importSkillFromLink(down.fetcher, `${RAW}/skills/house-style/SKILL.md`)).toMatchObject({ ok: true, value: { licence: null } });
    expect(down.asked).toHaveLength(2);
  });

  it("refuses what isn't there, has moved, is too big or isn't a skill", async () => {
    const link = `${RAW}/skills/house-style/SKILL.md`;
    expect(await importSkillFromLink(github({}).fetcher, link)).toMatchObject({ ok: false, message: expect.stringMatching(/no SKILL\.md at that link/) });
    expect(await importSkillFromLink(github({ [link]: { status: 301, headers: { location: "https://evil.example/" } } }).fetcher, link)).toMatchObject({ ok: false, message: expect.stringMatching(/moved/) });
    expect(await importSkillFromLink(github({ [link]: "x".repeat(IMPORT_LIMITS.skillBytes + 1) }).fetcher, link)).toMatchObject({ ok: false, message: expect.stringMatching(/too big/) });
    expect(await importSkillFromLink(github({ [link]: { status: 200, headers: { "content-length": String(10 * 1024 * 1024) } } }).fetcher, link)).toMatchObject({ ok: false, message: expect.stringMatching(/too big/) });
    expect(await importSkillFromLink(github({ [link]: "   " }).fetcher, link)).toMatchObject({ ok: false, message: expect.stringMatching(/isn't a skill/) });
    expect(await importSkillFromLink(github({ [link]: new Error("down") }).fetcher, link)).toMatchObject({ ok: false, message: expect.stringMatching(/didn't answer/) });
  });

  it("never asks anything but GitHub's raw file host", async () => {
    const { fetcher, asked } = github({});
    expect(await importSkillFromLink(fetcher, "https://evil.example/SKILL.md")).toMatchObject({ ok: false });
    expect(asked).toEqual([]);
  });
});
