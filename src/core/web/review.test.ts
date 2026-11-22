/**
 * The fresh review's cases (stage 206): a second agent read the stage without having written it and found these. Each test
 * holds one of its findings fixed.
 */
import { describe, expect, it } from "vitest";
import { readAction } from "@/core/chat/intent";
import { parseInline, parseMarkdown, plainText } from "@/core/chat/markdown";
import { checkCitations, readCitations } from "./citations";
import type { WebDoc } from "./context";
import { glossSinhala } from "./gloss";
import { readSearchNeed } from "./intent";
import { cleanQuery, localPlan } from "./plan";
import type { WebSource } from "./sources";

const YEAR = 2026;
const need = (text: string) => readSearchNeed({ text, year: YEAR }).need;
const timed = (run: () => unknown) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

describe("one message can't hold the server up (the review, stage 206)", () => {
  it("a long run of spaces after 'calculate' is read at once", () => {
    for (const lead of ["calculate", "what is", "compute", "solve"]) {
      const hostile = `${lead}${" ".repeat(31_000)}1+1 a`;
      expect(timed(() => readSearchNeed({ text: hostile, year: YEAR })), lead).toBeLessThan(250);
    }
  });

  it("a 32,000-character message of anything is planned, read for an action and read into search words at once", () => {
    for (const hostile of ["a@".repeat(16_000), `mata ${"aaaa.".repeat(6_000)}`, "[".repeat(32_000), `${"x ".repeat(16_000)}`]) {
      expect(timed(() => localPlan(hostile, YEAR))).toBeLessThan(400);
      expect(timed(() => cleanQuery(hostile))).toBeLessThan(250);
      expect(timed(() => glossSinhala(hostile))).toBeLessThan(250);
      expect(timed(() => readAction(hostile))).toBeLessThan(250);
      expect(timed(() => readSearchNeed({ text: hostile, year: YEAR }))).toBeLessThan(250);
    }
  });

  it("a 190,000-character answer of brackets, dots or spaces is checked for citations at once", () => {
    const sources: WebSource[] = [{ n: 1, url: "https://a.example/", title: "A", site: "a.example", published: null, read: true }];
    const docs: WebDoc[] = [{ ...sources[0]!, updated: null, text: "Some page text. ".repeat(20_000) }];
    for (const hostile of [`${".".repeat(190_000)}[1]`, `${" ".repeat(190_000)}[1]`, `${"[".repeat(190_000)}[1]`, "[1]".repeat(63_000), `Colombo had 84 mm ${"[x](".repeat(40_000)}[1]`]) {
      expect(timed(() => checkCitations(hostile, sources, docs))).toBeLessThan(1_500);
    }
    // However many marks, only so many citations are read.
    expect(readCitations("[1]".repeat(63_000), sources).citations.length).toBeLessThanOrEqual(300);
  });
});

describe("a message that needs the web is never read as needing none (the review, stage 206)", () => {
  it("a job on their text that itself asks about now is searched, or left to the planner", () => {
    for (const text of [
      "Polish election results today",
      "Polish zloty exchange rate today",
      "Summarize this week's AI news",
      "Translate the latest BBC headlines into Sinhala",
      "Tell me who won best rap album at the Grammys",
      "Give me the latest song by Drake",
      "Is this correct: the current president of Sri Lanka is Mahinda Rajapaksa",
      "Is this still the latest way to do it?\n```js\nfetch(url)\n```",
      "Summarize the latest news on this: OpenAI and Microsoft",
      "Write a poem about today's election results",
    ]) {
      expect(need(text), text).not.toBe("none");
    }
  });

  it("and the plain jobs are still answered at once", () => {
    for (const text of ["Write a catchy slogan for a lemonade stand", "Tell me a joke", "Summarize this: The meeting was long and nothing was decided.", "Fix this:\n```js\nconst a = [1, 2, 3\n```", "Proofread this: Their going to the park tomorow."]) {
      expect(need(text), text).toBe("none");
    }
  });

  it("when the plan made without a model finds nothing to search for, the question as typed is never the query", () => {
    expect(localPlan("mata kiyanna", YEAR).queries).toEqual([]);
    expect(localPlan("oyata puluwanda mata kiyanna", YEAR).queries).toEqual([]);
  });
});

describe("square brackets are citations only in an answer with sources (the review, stage 206)", () => {
  it("without sources, references and intervals stay exactly as written", () => {
    const text = "As shown by Smith [1]. Later work [2], [3] extended this. The interval [0, 1] and element [0][1].";
    expect(parseInline(text)).toEqual([{ t: "text", v: text }]);
    expect(plainText(text)).toBe(text);
    expect(JSON.stringify(parseMarkdown(text))).not.toContain('"cite"');
  });

  it("with sources, an interval or an index with a zero is not a citation, and a real one is", () => {
    const nodes = parseInline("The interval [0, 1], element [0][1] of m, and rain fell today [2].", 0, true);
    expect(nodes.filter((n) => n.t === "cite")).toEqual([{ t: "cite", n: [2] }]);
    expect(readCitations("The interval [0, 1] is closed.", [{ n: 1, url: "https://a.example/" }])).toEqual({ citations: [], invalid: 0 });
  });
});

describe("a continued answer keeps what was found before (the review, stage 206)", () => {
  it("a source checked earlier keeps its standing when its page is gone", () => {
    const saved: WebSource[] = [
      { n: 1, url: "https://a.example/", title: "A", site: "a.example", published: null, read: true, cited: true, support: "matched" },
      { n: 2, url: "https://b.example/", title: "B", site: "b.example", published: null, read: true, cited: false },
    ];
    const checked = checkCitations("Rain fell [1]. And more [2].", saved, []);
    expect(checked.sources.map((s) => [s.n, s.cited, s.support])).toEqual([
      [1, true, "matched"],
      [2, true, "unchecked"],
    ]);
  });
});
