import { describe, expect, it } from "vitest";
import { siteThemeScript } from "./site-script";
import { themeInCookies } from "./theme";

/** Runs the script as a browser would, against a page with one mark and the given cookies. */
function run(cookie: string, withMark = true): string | null {
  let value: string | null = withMark ? "light" : null;
  const mark = {
    setAttribute(name: string, next: string) {
      if (name === "data-page-theme") value = next;
    },
  };
  const page = {
    cookie,
    querySelector: (selector: string) => (withMark && selector === "[data-page-theme]" ? mark : null),
  };
  new Function("document", siteThemeScript())(page);
  return value;
}

describe("the look's script for pages built ahead of time (ADR 0232)", () => {
  it("writes Dark or Auto on the mark, wherever the cookie sits among the others", () => {
    expect(run("fb_theme=dark")).toBe("dark");
    expect(run("fb_theme=system")).toBe("system");
    expect(run("a=1; fb_theme=dark; b=2")).toBe("dark");
    expect(run("a=1; fb_theme=system")).toBe("system");
  });

  it("leaves the page Light for Light, for no choice, and for anything it doesn't know", () => {
    for (const cookie of ["", "fb_theme=light", "fb_theme=", "fb_theme=DARK", "fb_theme=darker", "fb_theme=dark%22%3E", "fb_theme=sepia", "other=dark"]) {
      expect(run(cookie), cookie).toBe("light");
    }
  });

  it("reads only its own cookie, not one whose name ends the same way", () => {
    expect(run("xfb_theme=dark")).toBe("light");
    expect(run("not_fb_theme=system; a=1")).toBe("light");
  });

  it("does nothing, and throws nothing, on a page without a mark or without cookies", () => {
    expect(run("fb_theme=dark", false)).toBeNull();
    const refuses = {
      get cookie(): string {
        throw new Error("cookies are blocked");
      },
      querySelector: () => null,
    };
    expect(() => new Function("document", siteThemeScript())(refuses)).not.toThrow();
  });

  it("can't end its own script tag", () => {
    expect(siteThemeScript()).not.toMatch(/<\/script|<!--/i);
  });

  it("reads the cookies exactly as the live page does, so the first paint and the page never disagree", () => {
    const cookies = [
      "",
      "fb_theme=dark",
      "fb_theme=system",
      "fb_theme=light",
      "a=1; fb_theme=dark; b=2",
      // Two cookies of the name (another path or a parent domain): the first counts, for both readers.
      "fb_theme=light; fb_theme=dark",
      "fb_theme=dark; fb_theme=light",
      "fb_theme=sepia; fb_theme=dark",
      "fb_theme=; fb_theme=system",
      "xfb_theme=dark; fb_theme=system",
      "fb_theme=darker",
      "fb_theme=dark=1",
      "FB_THEME=dark",
    ];
    for (const cookie of cookies) {
      const live = themeInCookies(cookie);
      expect(run(cookie), cookie).toBe(live === "dark" || live === "system" ? live : "light");
    }
  });
});
