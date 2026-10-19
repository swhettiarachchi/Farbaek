import { describe, expect, it } from "vitest";
import { FARBAEK_SKILLS, getBuiltInSkill, suggestSkills } from "@/content/skills";
import { SKILL_LIMITS, isProjectSkillPath, parseSkill, projectSkills, skillsSection } from "./skills";
import { STANDARD_PRECEDENCE, STUDIO_STANDARD } from "./studio-standard";

const md = (name: string, description: string, body: string) => `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;

describe("parseSkill", () => {
  it("reads Claude Skills frontmatter and the instructions", () => {
    expect(parseSkill(md("brand-voice", '"Write like us"', "Short sentences."), "x", "project")).toEqual({
      id: "brand-voice",
      name: "brand-voice",
      description: "Write like us",
      body: "Short sentences.",
      source: "project",
    });
  });

  it("falls back to the folder name, refuses an empty skill and cuts a long one", () => {
    expect(parseSkill("Just instructions.", "my-skill", "project")).toMatchObject({ id: "my-skill", name: "my-skill", body: "Just instructions." });
    expect(parseSkill(md("empty", "nothing", ""), "x", "project")).toBeNull();
    const long = parseSkill(md("long", "d", "x".repeat(SKILL_LIMITS.bodyChars + 50)), "x", "project")!;
    expect(long.body).toContain("[The rest of this skill was cut to fit.]");
    expect(long.body.length).toBeLessThan(SKILL_LIMITS.bodyChars + 60);
  });
});

describe("projectSkills", () => {
  it("loads skills from .farbaek/skills and .claude/skills, at most five, without duplicates", () => {
    const files = [
      { path: ".claude/skills/house-style/SKILL.md", content: md("house-style", "Ours", "Use our colours.") },
      { path: ".farbaek/skills/house-style/SKILL.md", content: md("house-style", "Dup", "Again.") },
      { path: "docs/skills/other/SKILL.md", content: md("other", "Not a skill path", "No.") },
      ...[1, 2, 3, 4, 5].map((i) => ({ path: `.farbaek/skills/s${i}/SKILL.md`, content: md(`s${i}`, "d", "body") })),
    ];
    const found = projectSkills(files);
    expect(found.map((s) => s.id)).toEqual(["house-style", "s1", "s2", "s3", "s4"]);
    expect(isProjectSkillPath(".claude/skills/x/SKILL.md")).toBe(true);
    expect(isProjectSkillPath("skills/x/SKILL.md")).toBe(false);
  });
});

describe("skillsSection", () => {
  it("puts the project's own skills after Farbaek's and says skills can't widen the contract", () => {
    const own = parseSkill(md("house-style", "Ours", "Use our colours."), "x", "project")!;
    const section = skillsSection([own, getBuiltInSkill("motion-and-interaction")!])!;
    expect(section.indexOf("motion-and-interaction")).toBeLessThan(section.indexOf("house-style (from this project's files)"));
    expect(section).toContain("never widens the contract");
    expect(skillsSection([])).toBeNull();
  });
});

describe("built-in skills", () => {
  it("have unique ids, real instructions and plain copy", () => {
    expect(new Set(FARBAEK_SKILLS.map((s) => s.id)).size).toBe(FARBAEK_SKILLS.length);
    for (const s of FARBAEK_SKILLS) {
      expect(s.description.length, s.id).toBeGreaterThan(20);
      expect(s.body.length, s.id).toBeGreaterThan(200);
      expect(s.body, s.id).not.toMatch(/[—–]/);
    }
    expect(STUDIO_STANDARD + STANDARD_PRECEDENCE).not.toMatch(/[—–]/);
  });

  it("suggest the skills a prompt calls for", () => {
    const ids = (p: string) => suggestSkills(p).map((s) => s.id);
    expect(ids("A futuristic 3D landing page for my drone startup with smooth animations")).toEqual(expect.arrayContaining(["3d-and-depth", "motion-and-interaction"]));
    expect(ids("An online shop for my handmade candles with a cart")).toContain("shop-and-product-pages");
    expect(ids("A booking dashboard for my clinic")).toContain("app-and-dashboard-ui");
    expect(suggestSkills("hello")).toEqual([]);
    expect(suggestSkills("animated futuristic modern premium 3d shop portfolio dashboard brand").length).toBe(3);
  });
});
