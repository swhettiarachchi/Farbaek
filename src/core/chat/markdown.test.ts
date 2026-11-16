import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, plainText, safeHref, speakable, type Block } from "./markdown";

const blocks = (text: string): Block[] => parseMarkdown(text).map((b) => b.block);

describe("parseMarkdown", () => {
  it("reads headings, paragraphs and rules", () => {
    expect(blocks("# Title\n\nSome words.\n\n---\n\n### Smaller")).toEqual([
      { t: "h", level: 1, c: [{ t: "text", v: "Title" }] },
      { t: "p", c: [{ t: "text", v: "Some words." }] },
      { t: "hr" },
      { t: "h", level: 3, c: [{ t: "text", v: "Smaller" }] },
    ]);
  });

  it("keeps a line break inside a paragraph", () => {
    expect(blocks("one\ntwo")).toEqual([{ t: "p", c: [{ t: "text", v: "one" }, { t: "br" }, { t: "text", v: "two" }] }]);
  });

  it("reads fenced code, and a fence still being written as open", () => {
    expect(blocks("```ts\nconst a = 1;\n```")).toEqual([{ t: "code", lang: "ts", v: "const a = 1;", open: false }]);
    expect(blocks("Here:\n\n```python\nprint('hi')")).toEqual([
      { t: "p", c: [{ t: "text", v: "Here:" }] },
      { t: "code", lang: "python", v: "print('hi')", open: true },
    ]);
  });

  it("reads lists: bullets, numbers, tasks and nesting", () => {
    const list = blocks("- one\n- two\n  - inner\n- [x] done\n- [ ] todo")[0]!;
    expect(list).toMatchObject({ t: "list", ordered: false, tight: true });
    if (list.t !== "list") throw new Error();
    expect(list.items).toHaveLength(4);
    expect(list.items[1]!.blocks[1]).toMatchObject({ t: "list", items: [{ blocks: [{ t: "p", c: [{ t: "text", v: "inner" }] }] }] });
    expect(list.items[2]!.checked).toBe(true);
    expect(list.items[3]!.checked).toBe(false);
    const [ordered] = blocks("3. three\n4. four");
    expect(ordered).toMatchObject({ t: "list", ordered: true, start: 3 });
  });

  it("doesn't turn a year at the start of a line into a list inside a paragraph", () => {
    expect(blocks("It started in\n2019. A good year.")).toHaveLength(1);
  });

  it("reads tables with alignment", () => {
    const table = blocks("| Name | Price |\n| :--- | ---: |\n| Bread | $3 |\n| Cake | $12 |")[0]!;
    expect(table).toMatchObject({ t: "table", align: ["left", "right"] });
    if (table.t !== "table") throw new Error();
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]![1]).toEqual([{ t: "text", v: "$12" }]);
  });

  it("reads quotes and maths blocks", () => {
    expect(blocks("> quoted\n> more")).toEqual([{ t: "quote", blocks: [{ t: "p", c: [{ t: "text", v: "quoted" }, { t: "br" }, { t: "text", v: "more" }] }] }]);
    expect(blocks("$$\nE = mc^2\n$$")).toEqual([{ t: "math", v: "E = mc^2", open: false }]);
    expect(blocks("\\[ a^2 + b^2 \\]")).toEqual([{ t: "math", v: "a^2 + b^2", open: false }]);
  });

  it("keeps each block's source so a streaming answer redraws only what changed", () => {
    const parsed = parseMarkdown("First.\n\nSecond.");
    expect(parsed.map((b) => b.src)).toEqual(["First.", "Second."]);
  });
});

describe("parseInline", () => {
  it("reads emphasis, code and strikethrough", () => {
    expect(parseInline("**bold** and *it* and `code` and ~~gone~~")).toEqual([
      { t: "strong", c: [{ t: "text", v: "bold" }] },
      { t: "text", v: " and " },
      { t: "em", c: [{ t: "text", v: "it" }] },
      { t: "text", v: " and " },
      { t: "code", v: "code" },
      { t: "text", v: " and " },
      { t: "del", c: [{ t: "text", v: "gone" }] },
    ]);
  });

  it("leaves snake_case and lone stars alone", () => {
    expect(parseInline("a snake_case_name and 2 * 3")).toEqual([{ t: "text", v: "a snake_case_name and 2 * 3" }]);
  });

  it("reads inline maths but not money", () => {
    expect(parseInline("area $\\pi r^2$ here")).toEqual([{ t: "text", v: "area " }, { t: "math", v: "\\pi r^2" }, { t: "text", v: " here" }]);
    expect(parseInline("costs $5 and $10")).toEqual([{ t: "text", v: "costs $5 and $10" }]);
  });

  it("makes safe links only, and never loads a picture the model linked", () => {
    expect(parseInline("[site](https://example.com)")).toEqual([{ t: "link", href: "https://example.com/", c: [{ t: "text", v: "site" }] }]);
    expect(parseInline("[bad](javascript:alert(1))")).toEqual([{ t: "text", v: "bad" }]);
    expect(parseInline("![chart](https://example.com/c.png)")).toEqual([{ t: "link", href: "https://example.com/c.png", c: [{ t: "text", v: "chart" }] }]);
    expect(parseInline("see https://example.com/a_b.")).toEqual([{ t: "text", v: "see " }, { t: "link", href: "https://example.com/a_b", c: [{ t: "text", v: "https://example.com/a_b" }] }, { t: "text", v: "." }]);
  });

  it("shows HTML as text", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([{ t: "text", v: "<script>alert(1)</script>" }]);
  });
});

describe("safeHref", () => {
  it("accepts web and mail addresses only", () => {
    expect(safeHref("https://farbaek.com")).toBe("https://farbaek.com/");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("javascript:x")).toBeNull();
    expect(safeHref("/relative")).toBeNull();
  });
});

describe("plain text and speech", () => {
  it("drops marks for copying, and code for speaking", () => {
    const answer = "## Steps\n\n1. **Mix** the flour.\n2. Bake it.\n\n```sh\nnpm run bake\n```";
    expect(plainText(answer)).toBe("Steps\n\nMix the flour.\nBake it.\n\nnpm run bake");
    expect(speakable(answer)).toEqual(["Steps Mix the flour.", "Bake it."]);
  });
});
