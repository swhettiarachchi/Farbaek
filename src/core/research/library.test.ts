import { describe, expect, it } from "vitest";
import { RESEARCH_LIMITS, checksLine, latestByConversation, researchItems, researchLine, researchTitle, sitesLine, type ResearchAnswer } from "./library";

const source = (n: number, url: string, over: Record<string, unknown> = {}) => ({ n, url, title: `Source ${n}`, site: new URL(url).hostname, published: null, read: true, ...over });
const search = (over: Record<string, unknown> = {}) => ({
  at: "2026-11-26T08:00:00.000Z",
  status: "done",
  queries: ["solar panels price"],
  sources: [source(1, "https://www.example.org/a"), source(2, "https://example.com/b"), source(3, "https://example.org/c", { read: false })],
  ...over,
});
const answer = (over: Partial<ResearchAnswer> = {}): ResearchAnswer => ({
  id: "a1",
  conversationId: "c1",
  parentId: "q1",
  createdAt: "2026-11-26T08:00:05.000Z",
  meta: { search: search() },
  conversation: { title: "Solar panels", projectId: null, archived: false },
  ...over,
});
const questions = new Map([["q1", "What do solar panels cost for a small house this year?"]]);

describe("the research a person can find again (stage 288, ADR 0296)", () => {
  it("lists an answer that read the web, by its question, with what its own record says", () => {
    const [item] = researchItems([answer()], questions);
    expect(item).toEqual({
      id: "a1",
      conversationId: "c1",
      title: "What do solar panels cost for a small house this year?",
      at: "2026-11-26T08:00:05.000Z",
      pages: 3,
      cited: null,
      sites: ["example.org", "example.com"],
      siteCount: 2,
      depth: "quick",
      rounds: 1,
      roundup: false,
      checks: null,
      projectId: null,
    });
  });

  it("leaves out what was not research: no search, a failed or skipped one, no pages, an archived chat, a record that doesn't read", () => {
    const not = [
      answer({ id: "n1", parentId: "p1", meta: {} }),
      answer({ id: "n2", parentId: "p2", meta: { search: search({ status: "failed", sources: [] }) } }),
      answer({ id: "n3", parentId: "p3", meta: { search: search({ status: "skipped", sources: [] }) } }),
      answer({ id: "n4", parentId: "p4", meta: { search: search({ sources: [] }) } }),
      answer({ id: "n5", parentId: "p5", conversation: { title: "Old", projectId: null, archived: true } }),
      answer({ id: "n6", parentId: "p6", conversation: null }),
      answer({ id: "n7", parentId: "p7", meta: { search: { status: "done", sources: "many" } } }),
      answer({ id: "n8", parentId: "p8", meta: null }),
      answer({ id: "n9", parentId: "p9", meta: "search" }),
    ];
    expect(researchItems(not, questions)).toEqual([]);
    expect(latestByConversation(not, questions)).toEqual([]);
  });

  it("lists a question once when it was answered again, by its newest answer, and newest first", () => {
    const items = researchItems(
      [
        answer({ id: "old", createdAt: "2026-11-25T08:00:00.000Z" }),
        answer({ id: "new", createdAt: "2026-11-26T09:00:00.000Z" }),
        answer({ id: "other", parentId: "q2", createdAt: "2026-11-26T08:30:00.000Z" }),
        answer({ id: "first", parentId: "q3", createdAt: "2026-11-24T08:00:00.000Z" }),
      ],
      questions,
    );
    expect(items.map((i) => i.id)).toEqual(["new", "other", "first"]);
  });

  it("lists research Farbaek repeats by itself once for each conversation, by its newest run", () => {
    // A scheduled task asks the same thing every morning: each run is a new question in the task's own conversation.
    const runs = Array.from({ length: 30 }, (_, day) => answer({ id: `run${day}`, parentId: `ask${day}`, conversationId: "task-chat", createdAt: new Date(Date.UTC(2026, 9, 1 + day, 6)).toISOString() }));
    const other = answer({ id: "other", parentId: "askx", conversationId: "agent-chat", createdAt: "2026-10-05T06:00:00.000Z" });
    const items = latestByConversation([...runs, other], questions);
    expect(items.map((i) => i.id)).toEqual(["run29", "other"]);
    // A run that searched nothing doesn't hide the last one that did.
    const quiet = answer({ id: "quiet", parentId: "askq", conversationId: "task-chat", createdAt: "2026-11-20T06:00:00.000Z", meta: {} });
    expect(latestByConversation([...runs, quiet], questions).map((i) => i.id)).toEqual(["run29"]);
    // Listed as the person's own research they would be thirty rows.
    expect(researchItems(runs, questions)).toHaveLength(30);
  });

  it("counts and names what the answer cites, once its citations were counted", () => {
    const [item] = researchItems(
      [
        answer({
          meta: {
            search: search({
              sources: [
                source(1, "https://a.org/1", { cited: true }),
                source(2, "https://b.com/1", { cited: true }),
                source(3, "https://c.net/1", { cited: false }),
                source(4, "https://d.org/1", { cited: false }),
              ],
              checks: { cited: 2, matched: 1, unmatched: 1, invalid: 0 },
            }),
          },
        }),
      ],
      questions,
    );
    expect(item).toMatchObject({ pages: 4, cited: 2, sites: ["a.org", "b.com"], siteCount: 2, checks: { cited: 2, matched: 1, unmatched: 1 } });
    // Pages that were found and not used are not named as where it read.
    expect(sitesLine(item!)).toBe("From a.org and b.com.");
  });

  it("names every page checked when the answer cited none, and says so", () => {
    const [item] = researchItems([answer({ meta: { search: search({ sources: [source(1, "https://a.org/1", { cited: false }), source(2, "https://b.com/1", { cited: false })] }) } })], questions);
    expect(item).toMatchObject({ pages: 2, cited: 0, sites: ["a.org", "b.com"] });
    expect(researchLine(item!)).toBe("A quick check: 2 pages checked, none cited in the answer.");
  });

  it("names sites by their address as Chat does, each once, never by what a page calls itself", () => {
    const [item] = researchItems(
      [
        answer({
          meta: {
            search: search({
              sources: [
                source(1, "https://WWW.Example.org/a", { site: "The Best Source Ever" }),
                source(2, "https://amp.example.org/b"),
                source(3, "https://m.example.org/c"),
                source(4, "https://news.example.com/c"),
                source(5, "https://example.net/d"),
                source(6, "https://example.edu/e"),
              ],
            }),
          },
        }),
      ],
      questions,
    );
    expect(item!.sites).toEqual(["example.org", "news.example.com", "example.net"]);
    expect(item!.sites).toHaveLength(RESEARCH_LIMITS.sites);
    // Six pages from four different sites: the phone and the fast versions of a site are that site.
    expect(item!.siteCount).toBe(4);
  });

  it("carries the depth, the rounds and a roundup when the record has them", () => {
    const [item] = researchItems([answer({ meta: { search: search({ depth: "deep", rounds: 2, roundup: true }) } })], questions);
    expect(item).toMatchObject({ depth: "deep", rounds: 2, roundup: true });
  });

  it("never lists more than the page shows", () => {
    const many = Array.from({ length: RESEARCH_LIMITS.list + 25 }, (_, i) => answer({ id: `a${i}`, parentId: `q${i}`, conversationId: `c${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    expect(researchItems(many, questions)).toHaveLength(RESEARCH_LIMITS.list);
    expect(latestByConversation(many, questions)).toHaveLength(RESEARCH_LIMITS.list);
  });

  it("makes a title from the question: its first line, on one line, cut at a word", () => {
    expect(researchTitle("  Compare   heat pumps\nand boilers  ", "x")).toBe("Compare heat pumps");
    expect(researchTitle("\n\n  Second line is the first with words", "x")).toBe("Second line is the first with words");
    expect(researchTitle(null, "The chat's name")).toBe("The chat's name");
    expect(researchTitle("", "")).toBe("Research");
    const long = researchTitle(`${"word ".repeat(60)}end`, "x");
    expect([...long].length).toBeLessThanOrEqual(RESEARCH_LIMITS.title + 3);
    expect(long.endsWith("...")).toBe(true);
    expect(long).not.toMatch(/\s\.\.\.$/);
    // A long run with no spaces is cut where it must be, and a surrogate pair is never split.
    const emoji = researchTitle(String.fromCodePoint(0x1f600).repeat(200), "x");
    expect([...emoji].length).toBe(RESEARCH_LIMITS.title + 3);
    expect(
      [...emoji].every((ch) => {
        const code = ch.codePointAt(0)!;
        return code < 0xd800 || code > 0xdfff;
      }),
    ).toBe(true);
    // Without its question, a row takes its chat's name.
    expect(researchItems([answer({ parentId: "unknown" })], questions)[0]!.title).toBe("Solar panels");
  });

  it("says what a piece of research was in one plain sentence: what was cited, of what was checked", () => {
    expect(researchLine({ depth: "quick", rounds: 1, pages: 1, cited: null, roundup: false })).toBe("A quick check: 1 page checked.");
    expect(researchLine({ depth: "standard", rounds: 1, pages: 6, cited: 6, roundup: false })).toBe("A search: 6 sources cited.");
    expect(researchLine({ depth: "standard", rounds: 1, pages: 6, cited: 1, roundup: false })).toBe("A search: 1 source cited, of 6 pages checked.");
    expect(researchLine({ depth: "deep", rounds: 2, pages: 12, cited: 9, roundup: false })).toBe("A deep study in 2 rounds: 9 sources cited, of 12 pages checked.");
    expect(researchLine({ depth: "deep", rounds: 1, pages: 10, cited: 10, roundup: true })).toBe("A roundup: 10 sources cited.");
  });

  it("says how the citations checked in the check's own terms, and never that an answer is verified", () => {
    expect(checksLine(null)).toBeNull();
    expect(checksLine({ cited: 0, matched: 0, unmatched: 0 })).toBeNull();
    expect(checksLine({ cited: 1, matched: 1, unmatched: 0 })).toBe("The names and numbers cited were found on its cited page.");
    expect(checksLine({ cited: 5, matched: 5, unmatched: 0 })).toBe("The names and numbers cited were found on all 5 cited pages.");
    // Partly found or only a snippet to compare: fewer were found, and nothing is said to be missing.
    expect(checksLine({ cited: 3, matched: 2, unmatched: 0 })).toBe("The names and numbers cited were found on 2 of 3 cited pages.");
    expect(checksLine({ cited: 5, matched: 3, unmatched: 1 })).toBe("The names and numbers cited were found on 3 of 5 cited pages. On 1, they weren't found.");
    for (const line of [checksLine({ cited: 5, matched: 5, unmatched: 0 }), checksLine({ cited: 5, matched: 3, unmatched: 1 })]) expect(line).not.toMatch(/verif|proved|confirm|correct|true/i);
  });

  it("says where it read, and says 'and others' only when there were more sites than it names", () => {
    expect(sitesLine({ sites: [], siteCount: 0 })).toBe("");
    expect(sitesLine({ sites: ["a.org"], siteCount: 1 })).toBe("From a.org.");
    expect(sitesLine({ sites: ["a.org", "b.com"], siteCount: 2 })).toBe("From a.org and b.com.");
    expect(sitesLine({ sites: ["a.org", "b.com", "c.net"], siteCount: 3 })).toBe("From a.org, b.com and c.net.");
    expect(sitesLine({ sites: ["a.org", "b.com", "c.net"], siteCount: 7 })).toBe("From a.org, b.com, c.net and others.");
    // Several pages from few sites is not "others".
    const [item] = researchItems([answer({ meta: { search: search({ sources: [source(1, "https://a.org/1"), source(2, "https://a.org/2"), source(3, "https://a.org/3"), source(4, "https://b.com/1")] }) } })], questions);
    expect(sitesLine(item!)).toBe("From a.org and b.com.");
  });
});
