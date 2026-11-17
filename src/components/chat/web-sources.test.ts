import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SearchMeta } from "@/core/web/sources";
import { searchLine, WebSources } from "./web-sources";

const base: SearchMeta = { at: "2026-11-17T09:00:00.000Z", status: "done", queries: ["colombo weather"], sources: [] };

describe("live web search on screen (stage 205)", () => {
  it("the status line says what's happening, in plain words", () => {
    expect(searchLine({ stage: "planning" })).toBe("Checking the web");
    expect(searchLine({ stage: "searching", queries: ["colombo weather"] })).toBe("Searching the web for “colombo weather”");
    expect(searchLine({ stage: "reading", pages: 1 })).toBe("Reading 1 page");
    expect(searchLine({ stage: "reading", pages: 5 })).toBe("Reading 5 pages");
    expect(searchLine({ stage: "done" })).toBeNull();
    expect(searchLine(null)).toBeNull();
  });

  it("sources are safe links with their site and date, the first four shown", () => {
    const sources = Array.from({ length: 6 }, (_, i) => ({ n: i + 1, url: `https://site${i}.example/a`, title: `Story ${i + 1}`, site: `site${i}.example`, published: "2026-11-16T10:00:00.000Z", read: i !== 1 }));
    const html = renderToStaticMarkup(createElement(WebSources, { search: { ...base, sources } }));
    expect(html).toContain('aria-label="Sources"');
    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("site0.example · 16 Nov 2026");
    expect(html).toContain("from the search result only");
    expect(html).toContain("Show all 6 sources");
  });

  it("a search that didn't work, or was off, is said plainly with its badge", () => {
    const failed = renderToStaticMarkup(createElement(WebSources, { search: { ...base, status: "failed", reason: "the search service didn't answer" } }));
    expect(failed).toContain("Web not checked");
    expect(failed).toContain("The search service didn&#x27;t answer.");
    expect(renderToStaticMarkup(createElement(WebSources, { search: { ...base, status: "off" } }))).toContain("Web search off");
    expect(renderToStaticMarkup(createElement(WebSources, { search: base }))).toContain("found no pages");
  });
});
