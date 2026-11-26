import { describe, expect, it } from "vitest";
import { choicesToKeep, opensPage } from "./keep-choices";

const jar = (cookies: Record<string, string>) => (name: string) => cookies[name];
const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

describe("keeping a person's look and level for a year (stage 285, ADR 0293)", () => {
  it("sends a known choice back unchanged, for a year, for every page, still readable by the page", () => {
    const kept = choicesToKeep(jar({ fb_theme: "dark", fb_level: "advanced" }), true);
    expect(kept.map((k) => [k.name, k.value])).toEqual([
      ["fb_theme", "dark"],
      ["fb_level", "advanced"],
    ]);
    for (const k of kept) expect(k.options).toEqual({ path: "/", maxAge: 31_536_000, sameSite: "lax", secure: true, httpOnly: false });
    expect(choicesToKeep(jar({ fb_level: "professional" }), false)[0]!.options.secure).toBe(false);
  });

  it("sends nothing when no choice was made", () => {
    expect(choicesToKeep(jar({}), true)).toEqual([]);
    expect(choicesToKeep(jar({ other: "1", fb_memory: "off" }), true)).toEqual([]);
  });

  it("never puts a value a browser made up into a header", () => {
    const line = String.fromCharCode(13, 10);
    for (const odd of ["", "everything", "Advanced", "advanced ", `advanced${line}set-cookie: x=1`, "advanced; domain=example.com", "dark"]) {
      expect(choicesToKeep(jar({ fb_level: odd }), true), JSON.stringify(odd)).toEqual([]);
    }
    for (const odd of ["", "night", "dark; path=/x", "standard"]) expect(choicesToKeep(jar({ fb_theme: odd }), true), JSON.stringify(odd)).toEqual([]);
    // One made-up value doesn't cost the other choice its year.
    expect(choicesToKeep(jar({ fb_theme: "night", fb_level: "advanced" }), true).map((k) => k.name)).toEqual(["fb_level"]);
  });

  it("does it when a browser loads a page afresh, and leaves a page's own requests alone", () => {
    expect(opensPage("GET", headers({ "sec-fetch-mode": "navigate" }))).toBe(true);
    // The app's own move between pages: the page is open and could change the choice while this is on its way.
    expect(opensPage("GET", headers({ rsc: "1", "sec-fetch-mode": "cors" }))).toBe(false);
    expect(opensPage("GET", headers({ "sec-fetch-mode": "cors", accept: "text/html" }))).toBe(false);
    expect(opensPage("GET", headers({ "sec-fetch-mode": "no-cors" }))).toBe(false);
    // An older browser that sends no fetch mode: a page asks for HTML.
    expect(opensPage("GET", headers({ accept: "text/html,application/xhtml+xml" }))).toBe(true);
    expect(opensPage("GET", headers({ accept: "text/event-stream" }))).toBe(false);
    expect(opensPage("GET", headers({}))).toBe(false);
    for (const method of ["POST", "PUT", "DELETE", "HEAD", "OPTIONS"]) expect(opensPage(method, headers({ "sec-fetch-mode": "navigate", rsc: "1" })), method).toBe(false);
  });
});
