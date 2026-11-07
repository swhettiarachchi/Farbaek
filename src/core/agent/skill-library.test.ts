import { describe, expect, it } from "vitest";
import { libraryFiles, licenceName, parseSkillLink, skillFilePath, skillText } from "./skill-library";

const RAW = "https://raw.githubusercontent.com";

describe("parseSkillLink (ADR 0179)", () => {
  const ok = (url: string) => {
    const r = parseSkillLink(url);
    if ("error" in r) throw new Error(r.error);
    return r;
  };

  it("reads a SKILL.md link, a folder link, a raw link and a repository", () => {
    expect(ok("https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md")).toMatchObject({
      url: `${RAW}/anthropics/skills/main/skills/frontend-design/SKILL.md`,
      label: "anthropics/skills/skills/frontend-design/SKILL.md",
    });
    expect(ok("https://github.com/anthropics/skills/tree/main/skills/frontend-design").url).toBe(`${RAW}/anthropics/skills/main/skills/frontend-design/SKILL.md`);
    expect(ok(`${RAW}/Leonxlnx/taste-skill/main/skills/soft-skill/SKILL.md`).url).toBe(`${RAW}/Leonxlnx/taste-skill/main/skills/soft-skill/SKILL.md`);
    expect(ok("https://github.com/someone/house-style").url).toBe(`${RAW}/someone/house-style/HEAD/SKILL.md`);
    expect(ok("https://github.com/someone/house-style.git").repo).toBe("house-style");
  });

  it("looks for a licence beside the skill first, then at the top of the repository", () => {
    const urls = ok("https://github.com/a/b/tree/main/skills/x").licenceUrls;
    expect(urls[0]).toBe(`${RAW}/a/b/main/skills/x/LICENSE`);
    expect(urls).toContain(`${RAW}/a/b/main/LICENSE`);
    expect(ok("https://github.com/a/b").licenceUrls).toEqual([`${RAW}/a/b/HEAD/LICENSE`, `${RAW}/a/b/HEAD/LICENSE.txt`, `${RAW}/a/b/HEAD/LICENSE.md`]);
  });

  it("only ever reads from raw.githubusercontent.com, whatever is pasted", () => {
    for (const bad of [
      "http://github.com/a/b",
      "https://gitlab.com/a/b/-/raw/main/SKILL.md",
      "https://github.com.evil.example/a/b",
      "https://evil.example/raw.githubusercontent.com/a/b/main/SKILL.md",
      "https://user:pass@github.com/a/b",
      "https://github.com:8443/a/b",
      "https://github.com/a/b/issues/1",
      "https://github.com/a",
      "javascript:alert(1)",
      "not a link",
    ]) {
      expect("error" in parseSkillLink(bad), bad).toBe(true);
    }
    for (const good of ["https://github.com/a/b/tree/main/skills/x", "https://github.com/a/b"]) {
      const r = ok(good);
      for (const u of [r.url, ...r.licenceUrls]) expect(new URL(u).origin).toBe(RAW);
    }
    // The URL standard resolves dot segments, plain or encoded, before the path is read. At most they name another public
    // repository, which the person could have linked anyway: what's fetched is still only ever on GitHub's raw host.
    for (const climb of ["https://github.com/a/b/blob/main/../../etc/passwd", "https://github.com/a/b/blob/main/%2e%2e/%2e%2e/x.md", `${RAW}/a/b/main/%2E%2E/%2E%2E/c/d/SKILL.md`]) {
      const r = parseSkillLink(climb);
      if ("error" in r) continue;
      for (const u of [r.url, ...r.licenceUrls]) expect(new URL(u).origin, `${climb} -> ${u}`).toBe(RAW);
    }
  });
});

describe("licenceName", () => {
  it("names the common licences and leaves anything else unnamed", () => {
    expect(licenceName("MIT License\n\nCopyright (c) 2026 Someone\n\nPermission is hereby granted, free of charge")).toBe("MIT");
    expect(licenceName("\n                                 Apache License\n                           Version 2.0, January 2004")).toBe("Apache 2.0");
    expect(licenceName("GNU GENERAL PUBLIC LICENSE\nVersion 3")).toBe("GPL");
    expect(licenceName("All rights reserved.")).toBeNull();
  });
});

describe("a library skill's files", () => {
  it("puts its SKILL.md and its licence side by side, and leaves Farbaek's own without one", () => {
    expect(libraryFiles({ id: "gpt-taste", markdown: "---\nname: gpt-taste\n---\nRules", licenceText: "MIT License" })).toEqual([
      { path: ".farbaek/skills/gpt-taste/SKILL.md", content: "---\nname: gpt-taste\n---\nRules" },
      { path: ".farbaek/skills/gpt-taste/LICENSE.txt", content: "MIT License" },
    ]);
    expect(libraryFiles({ id: "premium-app-ui", markdown: "x", licenceText: null })).toEqual([{ path: skillFilePath("premium-app-ui"), content: "x" }]);
    expect(skillText("---\r\nname: a\r\n---\r\nThe rules.\r\n")).toBe("The rules.");
  });
});
