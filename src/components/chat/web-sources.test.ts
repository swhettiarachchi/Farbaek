import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SearchMeta, WebSource } from "@/core/web/sources";
import { AnswerPartsContext } from "./answer-parts";
import { MarkdownView } from "./markdown-view";
import { searchLine, siteList, WebSources } from "./web-sources";

const base: SearchMeta = { at: "2026-11-17T09:00:00.000Z", status: "done", queries: ["colombo weather"], sources: [] };
const source = (i: number, extra: Partial<WebSource> = {}): WebSource => ({ n: i + 1, url: `https://site${i}.example/a`, title: `Story ${i + 1}`, site: `site${i}.example`, published: "2026-11-16T10:00:00.000Z", read: i !== 1, ...extra });

describe("live web search on screen (stage 205)", () => {
  it("the status line says what's happening, in plain words", () => {
    expect(searchLine({ stage: "planning" })).toBe("Checking the web");
    expect(searchLine({ stage: "searching", queries: ["colombo weather"] })).toBe("Searching the web for “colombo weather”");
    expect(searchLine({ stage: "reading", pages: 1 })).toBe("Reading 1 page");
    expect(searchLine({ stage: "reading", pages: 5 })).toBe("Reading 5 pages");
    expect(searchLine({ stage: "done" })).toBeNull();
    expect(searchLine(null)).toBeNull();
  });

  it("a deep task's second round is said as such (stage 206)", () => {
    expect(searchLine({ stage: "checking" })).toBe("Checking what's still missing");
    expect(searchLine({ stage: "searching", queries: ["ai chip exports"], round: 2 })).toBe("Looking again for “ai chip exports”");
    expect(searchLine({ stage: "reading", pages: 3, round: 2 })).toBe("Reading 3 more pages");
    expect(searchLine({ stage: "skipped" })).toBeNull();
  });

  it("a search that didn't work, or was off, is said plainly with its badge", () => {
    const failed = renderToStaticMarkup(createElement(WebSources, { search: { ...base, status: "failed", reason: "the search service didn't answer" } }));
    expect(failed).toContain("Web not checked");
    expect(failed).toContain("The search service didn&#x27;t answer.");
    expect(renderToStaticMarkup(createElement(WebSources, { search: { ...base, status: "off" } }))).toContain("Web search off");
    expect(renderToStaticMarkup(createElement(WebSources, { search: base }))).toContain("found no pages");
  });
});

describe("the sources under an answer (stage 206)", () => {
  it("stay closed until asked for: one button, and the sites beside it", () => {
    const html = renderToStaticMarkup(createElement(WebSources, { search: { ...base, sources: Array.from({ length: 6 }, (_, i) => source(i)) } }));
    expect(html).toContain('aria-label="Sources"');
    expect(html).toContain('aria-expanded="false"');
    // Closed: no list, no links.
    expect(html).not.toContain("<ol");
    expect(html.match(/<a /g)).toBeNull();
    expect(html).toContain("site0.example, site1.example and 4 more");
  });

  it("once the answer is written, the button counts what it cites, and says so when it cites nothing", () => {
    const sources = [source(0, { cited: true, support: "matched" }), source(1, { cited: false }), source(2, { cited: true, support: "partly" })];
    const cited = renderToStaticMarkup(createElement(WebSources, { search: { ...base, sources } }));
    expect(cited).toContain("2 sources");
    expect(cited).toContain("site0.example, site2.example");
    const unused = renderToStaticMarkup(createElement(WebSources, { search: { ...base, sources: sources.map((s) => ({ ...s, cited: false })) } }));
    expect(unused).toContain("3 pages checked, none cited in the answer");
  });

  it("an answer that needed no search shows nothing", () => {
    expect(renderToStaticMarkup(createElement(WebSources, { search: { ...base, status: "skipped", reason: "this message didn't need current information" } }))).toBe("");
  });

  it("names the sites in order, each once", () => {
    expect(siteList([source(0), source(0), source(1)])).toBe("site0.example, site1.example");
    expect(siteList([source(0)])).toBe("site0.example");
  });
});

describe("citations in the answer's text (stage 206)", () => {
  const sources = new Map([source(0), source(1), source(2)].map((s) => [s.n, s]));
  const draw = (text: string, withSources = true) =>
    renderToStaticMarkup(createElement(AnswerPartsContext.Provider, { value: { sources: withSources ? sources : null } }, createElement(MarkdownView, { text })));

  it("a citation is a small safe link to the page, named by its site", () => {
    const html = draw("Colombo had rain today [1].");
    expect(html).toContain('href="https://site0.example/a"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html).toContain(">site0.example<");
    expect(html).toContain('aria-label="Source: Story 1, site0.example"');
    expect(html).not.toContain("[1]");
  });

  it("citations side by side are one link with a count", () => {
    const html = draw("Both agree [1][3]. So does this one [2, 3].");
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain("+1");
    expect(html).toContain("and 1 more listed under Sources");
  });

  it("a number with no source behind it is never drawn", () => {
    const html = draw("An invented one [9] and a real one [2].");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain("[9]");
  });

  it("without web sources, square brackets stay as written, and code is never a citation", () => {
    expect(draw("See note [1] below.", false)).toContain("[1]");
    const code = draw("Use `items[0]` and items[1] here.");
    expect(code).toContain("items[0]");
    expect(code).toContain("items[1]");
    expect(code.match(/<a /g)).toBeNull();
  });
});

describe("choices in an answer (stage 206)", () => {
  const text = "Which news do you want?\n\n```choices\nAI and technology news\n- Sri Lankan news\n<b>World</b> news\n```";

  it("are buttons on the newest answer, and send their own words", () => {
    const html = renderToStaticMarkup(createElement(AnswerPartsContext.Provider, { value: { sources: null, onChoose: () => undefined } }, createElement(MarkdownView, { text })));
    expect(html.match(/<button /g)).toHaveLength(3);
    expect(html).toContain(">Sri Lankan news<");
    // Text only: markup from the model is shown as text, never drawn.
    expect(html).toContain("&lt;b&gt;World&lt;/b&gt; news");
    expect(html).not.toContain("<pre");
  });

  it("are a plain list anywhere they can't be pressed, and nothing while still being written", () => {
    const list = renderToStaticMarkup(createElement(MarkdownView, { text }));
    expect(list).not.toContain("<button");
    expect(list.match(/<li /g)).toHaveLength(3);
    const open = renderToStaticMarkup(createElement(MarkdownView, { text: "Pick one:\n\n```choices\nAI news\nSri Lan", streaming: true }));
    expect(open).not.toContain("AI news");
  });
});
