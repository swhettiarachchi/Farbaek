import { describe, expect, it } from "vitest";
import { APP_PAGES, MORE_PAGES } from "./app-nav";

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
  });

  it("gives phones every page the tabs don't show, including who can do what", () => {
    const rows = MORE_PAGES.map((p) => p.href);
    expect(rows).toContain("/app/trust");
    expect(rows).toContain("/app/tasks");
    expect(rows).not.toContain("/app/projects");
  });
});
