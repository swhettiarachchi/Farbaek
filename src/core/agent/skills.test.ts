import { describe, expect, it } from "vitest";
import { CORE_SKILL_IDS, FARBAEK_SKILLS, SITE_SKILL_ID, defaultSkills, getBuiltInSkill, suggestSkills } from "@/content/skills";
import { KIT_URL, MEDIA_BASE } from "@/core/media/library";
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
    expect(parseSkill("# House Style\nUse our green.", "", "project")).toMatchObject({ id: "house-style", name: "House Style" });
    expect(parseSkill("No name anywhere.", "", "project")).toBeNull();
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

  it("tick the premium core for anything people will see (ADR 0156)", () => {
    const ids = (p: string) => defaultSkills(p).map((s) => s.id);
    const bakery = ids("A one-page site for my bakery in Galle with the menu and opening hours");
    // A website also gets the flagship craft (the level of the best commercial sites).
    expect(bakery.slice(0, 4)).toEqual([...CORE_SKILL_IDS, SITE_SKILL_ID]);
    expect(bakery.length).toBeLessThanOrEqual(6);
    // An app with pages gets the core, not the website craft.
    expect(ids("A booking web app for my salon with a login and a dashboard")).not.toContain(SITE_SKILL_ID);
    expect(ids("A luxury boutique hotel site with a video hero")).toEqual(expect.arrayContaining(["luxury-and-editorial", "video-and-media"]));
    // Store craft for a shop, product storytelling for a launch (from studies of nordstrom.com, princesspolly.com and apple.com).
    expect(ids("An online store for my streetwear label with a cart and size guides")).toContain("shop-and-product-pages");
    expect(ids("A launch page for our new wireless earbuds with pre-orders")).toContain("product-storytelling");
    // An API with no pages gets no design skills by default.
    expect(ids("A REST API for my inventory with endpoints and tests")).not.toContain("3d-and-depth");
    for (const id of CORE_SKILL_IDS) expect(getBuiltInSkill(id), id).not.toBeNull();
    // Every run's prompt stays within the skill budget with the core, the site craft and two more.
    const longest = [...FARBAEK_SKILLS].sort((a, b) => b.body.length - a.body.length).slice(0, 6);
    expect(longest.reduce((n, s) => n + s.body.length, 0)).toBeLessThanOrEqual(SKILL_LIMITS.totalChars);
  });

  it("give the standard the kit, the library, real photos and the human-made rules", () => {
    expect(STUDIO_STANDARD).toContain(KIT_URL);
    expect(STUDIO_STANDARD).toContain(MEDIA_BASE);
    expect(STUDIO_STANDARD).toContain("data-farbaek-media");
    expect(STUDIO_STANDARD).toContain("data-farbaek-placeholder");
    expect(STUDIO_STANDARD).toContain("https://picsum.photos/id/");
    expect(STUDIO_STANDARD).toMatch(/never generated/);
    expect(STUDIO_STANDARD).toMatch(/No CSS filter/);
    expect(STUDIO_STANDARD).not.toMatch(/no image generator connected/i);
  });

  it("suggest the skills a prompt calls for", () => {
    const ids = (p: string) => suggestSkills(p).map((s) => s.id);
    expect(ids("A futuristic 3D landing page for my drone startup with smooth animations")).toEqual(expect.arrayContaining(["3d-and-depth", "motion-and-interaction"]));
    expect(ids("An online shop for my handmade candles with a cart")).toContain("shop-and-product-pages");
    expect(ids("A booking dashboard for my clinic")).toContain("app-and-dashboard-ui");
    expect(ids("A mobile app for my gym with onboarding and a bottom tab bar")).toContain("mobile-app-screens");
    expect(ids("A one-page site for my bakery with the menu")).not.toContain("mobile-app-screens");
    // A service business's landing page gets identity and motion, not a shop skill for the word "shops".
    const bookkeeping = ids("Make this the landing page for Ledgerline, a bookkeeping service for small shops in Colombo, with a sign-up for a free consultation.");
    expect(bookkeeping).toEqual(expect.arrayContaining(["brand-identity", "motion-and-interaction"]));
    expect(bookkeeping).not.toContain("shop-and-product-pages");
    // A site with a booking form is a brand site, not a dashboard.
    const rental = ids("A futuristic one-page site for Volt Ride, an electric bike rental in Kandy: a 3D hero, a booking form and opening hours.");
    expect(rental).toEqual(expect.arrayContaining(["brand-identity", "3d-and-depth", "motion-and-interaction"]));
    expect(rental).not.toContain("app-and-dashboard-ui");
    expect(suggestSkills("hello")).toEqual([]);
    expect(suggestSkills("animated futuristic modern premium 3d shop portfolio dashboard brand").length).toBe(3);
  });
});
