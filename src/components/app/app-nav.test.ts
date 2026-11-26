import { describe, expect, it } from "vitest";
import { LEVELS } from "@/core/experience/level";
import { APP_PAGES, LEVEL_SETTING, MORE_PAGES, moreRowsAt, toolsAt } from "./app-nav";

describe("the app's navigation (ADR 0170)", () => {
  it("still reaches every page it always did, under its plain name", () => {
    const hrefs = APP_PAGES.map((p) => p.href);
    for (const route of ["/app", "/app/build", "/app/projects", "/app/tasks", "/app/approvals", "/app/sandbox", "/app/agents", "/app/mesh", "/app/workflows", "/app/policies", "/app/incidents", "/app/activity", "/app/integrations", "/app/trust", "/app/billing", "/app/settings", "/app/help"]) {
      expect(hrefs).toContain(route);
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("says what each page is for, in one short line, and search finds the old names", () => {
    for (const page of APP_PAGES) {
      expect(page.about.length, page.href).toBeGreaterThan(0);
      expect(page.about.length, page.href).toBeLessThan(70);
    }
    const also = (href: string) => APP_PAGES.find((p) => p.href === href)?.also ?? [];
    expect(also("/app/mesh")).toContain("Mesh");
    expect(also("/app/sandbox")).toContain("Sandbox");
    expect(also("/app/trust")).toContain("Trust graph");
    expect(also("/app")).toContain("Mission Control");
    expect(also("/app/policies")).toContain("Policies");
    expect(also("/app/skills")).toContain("SKILL.md");
  });

  it("gives phones every page the tabs don't show, including who can do what", () => {
    const rows = MORE_PAGES.map((p) => p.href);
    expect(rows).toContain("/app/trust");
    expect(rows).toContain("/app/tasks");
    // Chat is a tab of its own (ADR 0228), so it isn't a row here; Projects is, since its tab went to Chat.
    expect(rows).toContain("/app/projects");
    expect(rows).not.toContain("/app/chat");
    expect(rows).not.toContain("/app");
    expect(rows).not.toContain("/app/build");
    expect(rows).not.toContain("/app/approvals");
  });
});

describe("the tools each level lists (stage 285, ADR 0293)", () => {
  const hrefs = (level: (typeof LEVELS)[number], pathname = "/app") => toolsAt(level, pathname).rows.map((r) => r.href);

  it("lists the everyday tools at Standard, the building tools from Advanced, and everything at Professional", () => {
    expect(hrefs("standard")).toEqual(["/app/work", "/app/tasks", "/app/survey", "/app/agents", "/app/integrations"]);
    expect(hrefs("advanced")).toEqual(["/app/work", "/app/tasks", "/app/survey", "/app/sandbox", "/app/skills", "/app/agents", "/app/mesh", "/app/workflows", "/app/activity", "/app/integrations"]);
    expect(toolsAt("professional", "/app").hidden).toEqual([]);
    expect(hrefs("professional")).toHaveLength(13);
  });

  it("shows at each level everything the one before it shows, and loses no tool", () => {
    const standard = new Set(hrefs("standard"));
    const advanced = new Set(hrefs("advanced"));
    const professional = new Set(hrefs("professional"));
    for (const href of standard) expect(advanced.has(href), href).toBe(true);
    for (const href of advanced) expect(professional.has(href), href).toBe(true);
    for (const level of LEVELS) {
      const { rows, hidden } = toolsAt(level, "/app");
      expect(rows.length + hidden.length, level).toBe(13);
    }
  });

  it("always lists the tool a person is on, and its pages", () => {
    expect(hrefs("standard", "/app/policies")).toContain("/app/policies");
    expect(hrefs("standard", "/app/policies/new")).toContain("/app/policies");
    expect(hrefs("standard", "/app/policies")).not.toContain("/app/trust");
    expect(toolsAt("standard", "/app/policies").hidden.map((r) => r.href)).not.toContain("/app/policies");
  });

  it("keeps Survey Studio, All work with its pause, and the desktop app at every level", () => {
    for (const level of LEVELS) {
      for (const href of ["/app/survey", "/app/work", "/app/agents", "/app/tasks"]) expect(hrefs(level), `${level} ${href}`).toContain(href);
    }
  });

  it("gives the phone's More page the same tools, with one row that says where the rest are", () => {
    const standard = moreRowsAt("standard");
    const labels = standard.map((r) => r.label);
    // The row comes after the last tool and before the account pages.
    expect(labels.slice(-6)).toEqual(["Connections", "Show more tools", "Billing and usage", "Settings", "Shared with you", "Help and support"]);
    const more = standard.find((r) => r.label === "Show more tools")!;
    expect(more.href).toBe(LEVEL_SETTING);
    expect(more.about).toBe("8 more are shown at Advanced and Professional.");
    expect(moreRowsAt("advanced").find((r) => r.label === "Show more tools")!.about).toBe("3 more are shown at Professional.");
    // At Professional the rows are the ones the page always had, and nothing says more exist.
    expect(moreRowsAt("professional").map((r) => r.href)).toEqual(MORE_PAGES.map((r) => r.href));
    // No row twice, at any level: each is a list key.
    for (const level of LEVELS) {
      const rows = moreRowsAt(level).map((r) => r.href);
      expect(new Set(rows).size, level).toBe(rows.length);
      for (const href of ["/app/projects", "/app/images", "/app/video", "/app/scheduled", "/app/settings", "/app/help"]) expect(rows, `${level} ${href}`).toContain(href);
    }
  });

  it("is a choice of what the menus list, never of what search reaches", () => {
    // The command palette reads APP_PAGES, which has no level: every page is found at Standard.
    const all = APP_PAGES.map((p) => p.href);
    for (const href of ["/app/policies", "/app/incidents", "/app/trust", "/app/sandbox", "/app/activity"]) expect(all).toContain(href);
    // Only tools carry a level: the spaces and the account pages are for everyone.
    const levelled = APP_PAGES.filter((p) => p.from !== undefined).map((p) => p.href);
    for (const href of ["/app", "/app/chat", "/app/images", "/app/video", "/app/build", "/app/projects", "/app/scheduled", "/app/approvals", "/app/billing", "/app/settings", "/app/help"]) expect(levelled).not.toContain(href);
    expect(LEVEL_SETTING).toBe("/app/settings#experience");
  });
});
