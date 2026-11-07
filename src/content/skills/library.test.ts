import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSkill, SKILL_LIMITS } from "@/core/agent/skills";
import { skillText } from "@/core/agent/skill-library";
import { FARBAEK_SKILLS } from "./index";
import { SKILL_LIBRARY } from "./library";
import { LIBRARY_TEXTS } from "./library/texts.generated";

const DIR = path.join(process.cwd(), "src", "content", "skills", "library");
const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null);
/** What a library edition may use, so three fit beside the built-in skills a plan ticks. */
const EDITION_CHARS = 4_500;

describe("the skill library (ADR 0179)", () => {
  it("matches its folders: run node scripts/skills/build-library.mjs after changing one", () => {
    const folders = fs.readdirSync(DIR).filter((d) => fs.statSync(path.join(DIR, d)).isDirectory());
    const onDisk = Object.fromEntries(folders.map((id) => [id, { skill: read(path.join(DIR, id, "SKILL.md")), licence: read(path.join(DIR, id, "LICENSE.txt")) }]));
    expect(LIBRARY_TEXTS).toEqual(onDisk);
    expect(SKILL_LIBRARY.map((s) => s.id).sort()).toEqual(folders.sort());
  });

  it("is made of whole skills that fit a build, with plain names", () => {
    for (const s of SKILL_LIBRARY) {
      const parsed = parseSkill(s.markdown, s.id, "project");
      expect(parsed, s.id).not.toBeNull();
      expect(parsed!.name, s.id).toBe(s.id);
      expect(parsed!.description.length, s.id).toBeGreaterThan(20);
      expect(parsed!.description.length, s.id).toBeLessThanOrEqual(300);
      expect(skillText(s.markdown).length, s.id).toBeLessThanOrEqual(EDITION_CHARS);
      expect(s.label.length, s.id).toBeLessThanOrEqual(40);
      expect(s.summary, s.id).toMatch(/^[A-Z].{20,160}\.$/);
      expect(s.uses.length, s.id).toBeGreaterThan(0);
      expect(`${s.markdown} ${s.label} ${s.summary}`, s.id).not.toMatch(/[–—]/);
    }
    expect(new Set(SKILL_LIBRARY.map((s) => s.label)).size).toBe(SKILL_LIBRARY.length);
  });

  it("credits every author and carries every licence that asks to be kept", () => {
    for (const s of SKILL_LIBRARY) {
      const first = skillText(s.markdown).split("\n")[0]!;
      if (s.licence === "Farbaek") {
        expect(first, s.id).toMatch(/^Farbaek's own skill/);
        expect(s.licenceText, s.id).toBeNull();
        continue;
      }
      // Each edition says whose it is, under what, where it came from, and that it was changed (Apache 2.0, section 4b).
      expect(first, s.id).toContain(`by ${s.author}`);
      expect(first, s.id).toContain(s.source!.split("/tree/")[0]!);
      expect(first, s.id).toMatch(/Shortened to fit a build/);
      expect(first, s.id).toMatch(/LICENSE\.txt beside this file/);
      expect(s.source, s.id).toMatch(/^https:\/\/github\.com\//);
      if (s.licence === "MIT") {
        expect(s.licenceText, s.id).toMatch(/^MIT License\n\nCopyright \(c\) \d{4} .+/);
        expect(s.licenceText, s.id).toMatch(/Permission is hereby granted, free of charge/);
        expect(s.licenceText, s.id).toContain(s.author === "Next Level Builder" ? "Next Level Builder" : s.author);
      } else {
        expect(s.licenceText, s.id).toMatch(/Apache License\s+Version 2\.0/);
      }
    }
  });

  it("leaves room in one build for the plan's built-in skills and three editions", () => {
    const builtIn = [...FARBAEK_SKILLS].sort((a, b) => b.body.length - a.body.length).slice(0, 6).reduce((n, s) => n + s.body.length, 0);
    const editions = SKILL_LIBRARY.map((s) => skillText(s.markdown).length).sort((a, b) => b - a).slice(0, 3).reduce((n, x) => n + x, 0);
    expect(builtIn + editions).toBeLessThanOrEqual(SKILL_LIMITS.totalChars);
  });

  it("holds only skills whose licence lets anyone share them", () => {
    // mobile-app-ui-design (github.com/ceorkm/mobile-app-ui-design) has no licence, so it isn't shared here.
    expect(SKILL_LIBRARY.map((s) => s.id)).not.toContain("mobile-app-ui-design");
    expect(SKILL_LIBRARY.every((s) => ["MIT", "Apache-2.0", "Farbaek"].includes(s.licence))).toBe(true);
  });
});
