import { describe, expect, it } from "vitest";
import { APP_PAGES } from "./app-nav";
import { ASK_MIN, BUILD_MIN, matchScore, rankCommands, readsAsBuild, typedScores, type Rankable } from "./command-match";

describe("matchScore", () => {
  it("matches every word typed, in the label or the keywords", () => {
    expect(matchScore("", "Projects")).toBe(1);
    expect(matchScore("bill", "Billing and usage")).toBe(4);
    expect(matchScore("usage", "Billing and usage")).toBe(3);
    expect(matchScore("ling", "Billing and usage")).toBe(2);
    expect(matchScore("bakery site", "One-page site for Sunrise Bakery")).toBe(3);
    expect(matchScore("bakery cafe", "One-page site for Sunrise Bakery")).toBe(0);
  });

  it("counts a page's other name, typed from its start, as its name (stage 289)", () => {
    expect(matchScore("money", "Billing and usage", ["plan", "money"])).toBe(3);
    expect(matchScore("sandbox", "Test space", ["Test space", "Sandbox", "Terminal"])).toBe(3);
    expect(matchScore("mission con", "Home", ["Home", "Mission Control"])).toBe(3);
    // Inside another name, not at its start: contained, not named.
    expect(matchScore("ontrol", "Home", ["Home", "Mission Control"])).toBe(1);
  });

  it("does not take a question for a page because the page holds its letters", () => {
    // "Who can do what" holds "what", "can" and "do", and "i" is inside "permissions": still not the page's name.
    expect(matchScore("what can I do", "Who can do what", ["Access", "Trust graph", "Permissions"])).toBeLessThan(3);
    expect(matchScore("what do I do", "Who can do what", ["Access", "Trust graph", "Permissions"])).toBeLessThan(3);
    // Words that each start one of its words do name it.
    expect(matchScore("who can", "Who can do what")).toBe(4);
    expect(matchScore("can what", "Who can do what")).toBe(3);
  });
});

describe("what the typed words themselves can do (stage 289, ADR 0297)", () => {
  it("reads a request to build from the words: a making word, or the thing itself leading", () => {
    for (const build of [
      "a booking site for my salon",
      "Build me a website for my bakery",
      "can you make a landing page for my course?",
      "please create an online store",
      "portfolio for my photography",
      "dashboard that shows my shop's orders by day",
      "my bakery's new website",
      "online store",
    ]) {
      expect(readsAsBuild(build), build).toBe(true);
    }
  });

  it("does not read a build into words that only mention a site, an app or a shop", () => {
    for (const ask of [
      "how do I speed up my site?",
      "what is a landing page",
      "is my app safe",
      "why is my website slow",
      "my site is down",
      "write a blog post about coffee",
      "find a coffee shop near me",
      "best apps for learning Sinhala",
      "open the dashboard",
      "store hours on Sunday",
      "app store reviews",
      "make this shorter",
      "create a poem about rain",
      "translate hello to Sinhala",
      "what's the weather in Colombo",
      "compare two phone plans",
      "help me with my tasks page layout",
      "",
      "   ",
    ]) {
      expect(readsAsBuild(ask), ask).toBe(false);
    }
  });

  it("stays quick on a very long line", () => {
    const started = performance.now();
    readsAsBuild(`${"a ".repeat(40_000)}site`);
    readsAsBuild(`${"word-".repeat(40_000)} shop for`);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("offers nothing for a letter, a question from two, and a build only from a few words and only to someone who can build", () => {
    expect(typedScores("a", true, 0)).toEqual({ ask: 0, research: 0, build: 0 });
    expect("ab".length).toBe(ASK_MIN);
    const two = typedScores("ab", true, 0);
    expect(two.ask).toBeGreaterThan(0);
    expect(two.research).toBeGreaterThan(0);
    expect(two.build).toBe(0);
    expect(typedScores("x".repeat(BUILD_MIN), true, 0).build).toBeGreaterThan(0);
    expect(typedScores("a site for my bakery shop", false, 0).build).toBe(0);
  });

  it("leads with the question, unless the words read as a build", () => {
    const question = typedScores("what changed in solar panel prices", true, 0);
    expect(question.ask).toBeGreaterThan(question.research);
    expect(question.research).toBeGreaterThan(question.build);
    const build = typedScores("a booking site for my salon", true, 0);
    expect(build.build).toBeGreaterThan(build.ask);
    expect(build.ask).toBeGreaterThan(build.research);
  });
});

describe("what the palette lists, with the app's real pages (stage 289, ADR 0297)", () => {
  const pages: Rankable[] = [
    { id: "new", label: "New build", keywords: ["create", "start", "prompt"] },
    ...APP_PAGES.map((p) => ({ id: p.href, label: p.label, keywords: [p.short, ...(p.also ?? [])] })),
    { id: "p:1", label: "One-page site for Sunrise Bakery" },
  ];
  const first = (typed: string, canBuild = true) => rankCommands(typed, pages, canBuild)[0];

  it("opens the page that was named, by its name or by one of its other names", () => {
    expect(first("bill")).toBe("/app/billing");
    expect(first("settings")).toBe("/app/settings");
    expect(first("projects")).toBe("/app/projects");
    expect(first("sunrise")).toBe("p:1");
    // Other names, which used to open their pages and must still.
    expect(first("sandbox")).toBe("/app/sandbox");
    expect(first("audit")).toBe("/app/activity");
    expect(first("mesh")).toBe("/app/mesh");
    expect(first("dxf")).toBe("/app/survey");
    expect(first("mission control", false)).toBe("/app");
    expect(first("integrations", false)).toBe("/app/integrations");
    expect(first("permissions", false)).toBe("/app/trust");
  });

  it("asks when the words are a question, even one that shares its words with a page", () => {
    for (const question of ["what changed in solar panel prices", "what can I do", "what do I do", "help me with my tasks page layout", "ok"]) expect(first(question), question).toBe("ask");
    expect(rankCommands("what changed in solar panel prices", pages, true).slice(0, 3)).toEqual(["ask", "research", "build"]);
  });

  it("plans a build first only when the words read as one, and never offers one to someone who can't build", () => {
    expect(rankCommands("a booking site for my salon", pages, true).slice(0, 3)).toEqual(["build", "ask", "research"]);
    for (const not of ["write a blog post about coffee", "find a coffee shop near me", "my site is down", "open the dashboard"]) expect(first(not), not).toBe("ask");
    expect(rankCommands("a booking site for my salon", pages, false)).not.toContain("build");
    expect(rankCommands("a booking site for my salon", pages, false)[0]).toBe("ask");
  });

  it("still offers the typed words' commands after a page that was named, and lists nothing twice", () => {
    const listed = rankCommands("bill", pages, true);
    expect(listed.indexOf("ask")).toBeGreaterThan(listed.indexOf("/app/billing"));
    expect(listed).toContain("research");
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("leads with what the assistant answers or does in place when the words are that request, whole (stage 290, ADR 0298)", () => {
    expect(rankCommands("what needs me", pages, true).slice(0, 2)).toEqual(["needs", "ask"]);
    expect(first("What's waiting for me?")).toBe("needs");
    expect(first("what are you working on")).toBe("progress");
    expect(first("pause everything")).toBe("pause");
    expect(first("resume agents", false)).toBe("resume");
    // Only the one that was asked for.
    const listed = rankCommands("pause everything", pages, true);
    for (const other of ["needs", "progress", "resume"]) expect(listed).not.toContain(other);
    // A question that only shares words with one stays a question, and a page that was named still opens.
    expect(first("what needs to change in my essay")).toBe("ask");
    expect(first("how do I pause a video")).toBe("ask");
    expect(first("in progress")).toBe("/app/work");
    expect(rankCommands("bill", pages, true)).not.toContain("needs");
  });

  it("lists every page and no typed command when nothing is typed, and never more than it is given room for", () => {
    const empty = rankCommands("", pages, true, 12);
    expect(empty).toHaveLength(12);
    expect(empty).not.toContain("ask");
    // What needs the person is one press away, then the pages as before.
    expect(empty[0]).toBe("needs");
    expect(empty[1]).toBe("new");
    for (const id of ["research", "build", "progress", "pause", "resume"]) expect(empty).not.toContain(id);
    expect(rankCommands("a", pages, true, 5).length).toBeLessThanOrEqual(5);
  });
});
