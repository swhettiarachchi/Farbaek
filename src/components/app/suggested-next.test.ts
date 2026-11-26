/**
 * The Suggested next card (stage 283, ADR 0291): nothing is drawn until the browser can say what the person has put away, so a
 * suggestion they dismissed never flashes back; and the switches in Settings name every kind.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SUGGESTION_KIND_WORDS, SUGGESTION_ORDER, type Suggestion } from "@/core/telepathy/next-steps";
import { SuggestedNext, SuggestionSwitches } from "./suggested-next";

const one: Suggestion = {
  id: "fix:t1:2026-11-26T04:00:00.000Z",
  kind: "fix",
  title: "Fix what failed",
  body: '"Add an order form", in Storefront.',
  why: { before: "Its checks failed ", at: "2026-11-26T04:00:00.000Z", after: ", and nothing newer has been started in Storefront." },
  action: { label: "Open the task", href: "/app/tasks/t1" },
};

describe("the Suggested next card", () => {
  it("draws nothing on the server: what was put away is only known in the browser", () => {
    expect(renderToStaticMarkup(createElement(SuggestedNext, { candidates: [one] }))).toBe("");
    expect(renderToStaticMarkup(createElement(SuggestedNext, { candidates: [] }))).toBe("");
  });
});

describe("the switches for what Home may suggest", () => {
  it("name every kind in plain words, each with its own checkbox, and wait for the browser before they can be changed", () => {
    const html = renderToStaticMarkup(createElement(SuggestionSwitches));
    for (const kind of SUGGESTION_ORDER) {
      const words = SUGGESTION_KIND_WORDS[kind];
      expect(html, kind).toContain(`${words.charAt(0).toUpperCase()}${words.slice(1)}`);
    }
    expect(html.match(/type="checkbox"/g)).toHaveLength(SUGGESTION_ORDER.length);
    expect(html.match(/disabled=""/g)).toHaveLength(SUGGESTION_ORDER.length);
    expect(html.match(/checked=""/g)).toHaveLength(SUGGESTION_ORDER.length);
  });
});
