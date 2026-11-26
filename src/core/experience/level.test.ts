import { describe, expect, it } from "vitest";
import { DEFAULT_LEVEL, LEVELS, LEVEL_COOKIE, LEVEL_WORDS, atLevel, choosesModel, hiddenLine, isLevel, levelCookie, levelInCookies, levelsThatShow, readLevel, shows, type Level } from "./level";

describe("the three experience levels (stage 285, ADR 0293)", () => {
  it("are Standard, Advanced and Professional, in that order, and Standard when nothing is chosen", () => {
    expect(LEVELS).toEqual(["standard", "advanced", "professional"]);
    expect(DEFAULT_LEVEL).toBe("standard");
    for (const level of LEVELS) expect(LEVEL_WORDS[level].name.length).toBeGreaterThan(0);
  });

  it("read a saved choice, and take anything else as Standard", () => {
    expect(readLevel("advanced")).toBe("advanced");
    expect(readLevel("professional")).toBe("professional");
    for (const odd of [undefined, null, "", "Advanced", "expert", "professional ", "standard;x", "__proto__"]) expect(readLevel(odd)).toBe("standard");
    expect(isLevel("standard")).toBe(true);
    expect(isLevel(2)).toBe(false);
    expect(isLevel(["advanced"])).toBe(false);
  });

  it("find the choice in a browser's cookie text, the first of that name", () => {
    expect(levelInCookies(`a=1; ${LEVEL_COOKIE}=advanced; b=2`)).toBe("advanced");
    expect(levelInCookies(`${LEVEL_COOKIE}=professional; ${LEVEL_COOKIE}=standard`)).toBe("professional");
    expect(levelInCookies("fb_theme=dark")).toBeNull();
    expect(levelInCookies(`x${LEVEL_COOKIE}=advanced`)).toBeNull();
    expect(levelInCookies(`${LEVEL_COOKIE}=everything`)).toBeNull();
    expect(levelInCookies("")).toBeNull();
  });

  it("write a cookie the reader takes back, for a year, for every page", () => {
    for (const level of LEVELS) {
      const written = levelCookie(level, true);
      expect(levelInCookies(written.split("; ")[0]!)).toBe(level);
      expect(written).toContain("path=/");
      expect(written).toContain("max-age=31536000");
      expect(written).toContain("samesite=lax");
      expect(written.endsWith("; secure")).toBe(true);
    }
    expect(levelCookie("advanced", false)).not.toContain("secure");
  });

  it("show at each level everything the one before it shows", () => {
    const from: (Level | undefined)[] = [undefined, "standard", "advanced", "professional"];
    expect(from.map((f) => shows("standard", f))).toEqual([true, true, false, false]);
    expect(from.map((f) => shows("advanced", f))).toEqual([true, true, true, false]);
    expect(from.map((f) => shows("professional", f))).toEqual([true, true, true, true]);
    // A level that isn't one of the three is read as Standard, never as more.
    expect(shows("everything" as Level, "advanced")).toBe(false);
    expect(shows("everything" as Level)).toBe(true);
  });

  it("let Chat list its models from Advanced up", () => {
    expect(choosesModel("standard")).toBe(false);
    expect(choosesModel("advanced")).toBe(true);
    expect(choosesModel("professional")).toBe(true);
  });

  const menu = [
    { id: "work" },
    { id: "tests", from: "advanced" as const },
    { id: "rules", from: "professional" as const },
    { id: "links", from: "standard" as const },
    { id: "history", from: "advanced" as const },
  ];

  it("list a menu at a level in the menu's own order, and say what is left for a higher one", () => {
    const ids = (level: Level) => atLevel(menu, level).rows.map((r) => r.id);
    expect(ids("standard")).toEqual(["work", "links"]);
    expect(ids("advanced")).toEqual(["work", "tests", "links", "history"]);
    expect(ids("professional")).toEqual(["work", "tests", "rules", "links", "history"]);
    expect(atLevel(menu, "standard").hidden.map((r) => r.id)).toEqual(["tests", "rules", "history"]);
    expect(atLevel(menu, "professional").hidden).toEqual([]);
    // Nothing is in both, and nothing is lost.
    for (const level of LEVELS) {
      const { rows, hidden } = atLevel(menu, level);
      expect([...rows, ...hidden].map((r) => r.id).sort()).toEqual(menu.map((r) => r.id).sort());
    }
  });

  it("always list the page a person is on", () => {
    const { rows, hidden } = atLevel(menu, "standard", (item) => item.id === "rules");
    expect(rows.map((r) => r.id)).toEqual(["work", "rules", "links"]);
    expect(hidden.map((r) => r.id)).toEqual(["tests", "history"]);
  });

  it("say in one plain line where the rest is", () => {
    expect(levelsThatShow(atLevel(menu, "standard").hidden)).toBe("Advanced and Professional");
    expect(levelsThatShow(atLevel(menu, "advanced").hidden)).toBe("Professional");
    expect(levelsThatShow([])).toBe("");
    expect(hiddenLine(atLevel(menu, "standard").hidden)).toBe("3 more are shown at Advanced and Professional.");
    expect(hiddenLine(atLevel(menu, "advanced").hidden)).toBe("1 more is shown at Professional.");
    expect(hiddenLine(atLevel(menu, "professional").hidden)).toBe("");
  });
});
