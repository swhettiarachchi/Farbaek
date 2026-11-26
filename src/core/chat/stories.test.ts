import { describe, expect, it } from "vitest";
import { parseMarkdown, type Inline } from "./markdown";
import { countStories, groupStories, STORY_BLOCKS, type AnswerPiece } from "./stories";

const read = (text: string, citations = true) => groupStories(parseMarkdown(text, { citations }));
const words = (nodes: Inline[]): string => nodes.map((n) => (n.t === "text" || n.t === "code" || n.t === "math" ? n.v : n.t === "br" || n.t === "cite" ? "" : words(n.c))).join("");
const shape = (pieces: AnswerPiece[]) => pieces.map((p) => (p.kind === "story" ? `story:${words(p.story.title)}:${p.story.cites.join(",")}:${p.story.body.length}` : `block:${p.block.block.t}`));

const ROUNDUP = [
  "# Tech updates, 26 November 2026",
  "",
  "Three things stand out today.",
  "",
  "## AI",
  "",
  "### A satellite network for AI computing is approved [1]",
  "",
  "The regulator approved the plan on 25 November. It is not yet built.",
  "",
  "### An API moved to Rust by agents [2][4]",
  "",
  "The company said agents did the migration.",
  "",
  "Engineers reviewed every change.",
  "",
  "## What to watch",
  "",
  "Prices, mostly [3].",
].join("\n");

describe("the stories in an answer", () => {
  it("are the headings that end with a source's number, each with the sentences under it", () => {
    expect(shape(read(ROUNDUP))).toEqual([
      "block:h",
      "block:p",
      "block:h",
      "story:A satellite network for AI computing is approved:1:1",
      "story:An API moved to Rust by agents:2,4:2",
      "block:h",
      "block:p",
    ]);
    expect(countStories(read(ROUNDUP))).toBe(2);
  });

  it("keep the heading's level and its words as written, without the citation or what hangs before it", () => {
    const [a, b, c] = read("### **OpenAI** ships `gpt-6` [2].\n\nText.\n\n#### Second one: [1] [3]\n\nText.\n\n## Third, a bigger heading [5]\n\nText.");
    expect(a).toMatchObject({ kind: "story", story: { level: 3, cites: [2] } });
    expect(a!.kind === "story" && words(a!.story.title)).toBe("OpenAI ships gpt-6");
    // Emphasis and code in a title survive.
    expect(a!.kind === "story" && a!.story.title.map((n) => n.t)).toEqual(["strong", "text", "code"]);
    expect(b).toMatchObject({ kind: "story", story: { level: 4, cites: [1, 3] } });
    expect(b!.kind === "story" && words(b!.story.title)).toBe("Second one");
    expect(c).toMatchObject({ kind: "story", story: { level: 2, cites: [5] } });
  });

  it("name each source once, in the order written", () => {
    const [a] = read("### One story [3][1][3]\n\nText.");
    expect(a!.kind === "story" && a!.story.cites).toEqual([3, 1]);
  });

  it("are not found in an answer without numbered sources: there a bracketed number is only text", () => {
    expect(shape(read(ROUNDUP, false))).toEqual(["block:h", "block:p", "block:h", "block:h", "block:p", "block:h", "block:p", "block:p", "block:h", "block:p"]);
    expect(countStories(read(ROUNDUP, false))).toBe(0);
  });

  it("leave a heading alone when only its sentences cite sources: a section is not one page's story", () => {
    expect(shape(read("### How it works\n\nIt signs each request [2].\n\n### Why it matters\n\nFewer faults [1]."))).toEqual(["block:h", "block:p", "block:h", "block:p"]);
  });

  it("leave the answer's own title alone, and a heading that is nothing but a number", () => {
    expect(shape(read("# Today's news [1]\n\nText.\n\n### [2]\n\nText."))).toEqual(["block:h", "block:p", "block:h", "block:p"]);
  });

  it("take lists and quotes under a story as part of it", () => {
    expect(shape(read("### A launch [1]\n\nWhat changed:\n\n- one\n- two\n\n> a quoted line\n\n### Next [2]\n\nText."))).toEqual(["story:A launch:1:3", "story:Next:2:1"]);
  });

  it("leave a heading alone when a table, code or maths follows its text: it heads a section", () => {
    expect(shape(read("### Prices compared [1]\n\nThe plans:\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n### Next [2]\n\nText."))).toEqual(["block:h", "block:p", "block:table", "story:Next:2:1"]);
    expect(shape(read("### The fix [1]\n\n```js\nx()\n```"))).toEqual(["block:h", "block:code"]);
  });

  it("hold their first few blocks; what is written after them follows as it was, so a story never turns back into a heading", () => {
    const most = `### A full story [1]\n\n${Array.from({ length: STORY_BLOCKS }, (_, i) => `Paragraph ${i}.`).join("\n\n")}`;
    expect(shape(read(most))).toEqual([`story:A full story:1:${STORY_BLOCKS}`]);
    const long = `### A long one [1]\n\n${Array.from({ length: STORY_BLOCKS + 2 }, (_, i) => `Paragraph ${i}.`).join("\n\n")}`;
    expect(shape(read(long))).toEqual([`story:A long one:1:${STORY_BLOCKS}`, "block:p", "block:p"]);
    // Written one block at a time, it is a story at every step.
    for (let n = 0; n <= STORY_BLOCKS + 2; n++) {
      const partial = `### A long one [1]\n\n${Array.from({ length: n }, (_, i) => `Paragraph ${i}.`).join("\n\n")}`;
      expect(shape(read(partial))[0], String(n)).toBe(`story:A long one:1:${Math.min(n, STORY_BLOCKS)}`);
    }
  });

  it("keep a title's own full stop, and drop only one written after the citation", () => {
    const title = (text: string) => {
      const [a] = read(`${text}\n\nText.`);
      return a!.kind === "story" ? words(a!.story.title) : "not a story";
    };
    expect(title("### Tariffs hit the U.S. [4]")).toBe("Tariffs hit the U.S.");
    expect(title("### Apple Inc. [3]")).toBe("Apple Inc.");
    expect(title("### A chip is announced [3].")).toBe("A chip is announced");
    expect(title("### Is this the end? [2]")).toBe("Is this the end?");
    expect(title("### [3] A title that starts with its source.")).toBe("A title that starts with its source.");
    expect(title("### A title: [3]")).toBe("A title");
    expect(title("### A title - [1] [3]")).toBe("A title");
  });

  it("take a citation out of a title wherever it was written, so none is left inside the title's link", () => {
    const [a] = read("### *Breaking [2]:* a chip launch [3]\n\nText.");
    expect(a).toMatchObject({ kind: "story", story: { cites: [2, 3] } });
    const holdsCite = (nodes: Inline[]): boolean => nodes.some((n) => n.t === "cite" || ((n.t === "strong" || n.t === "em" || n.t === "del" || n.t === "link") && holdsCite(n.c)));
    expect(a!.kind === "story" && holdsCite(a!.story.title)).toBe(false);
    expect(a!.kind === "story" && words(a!.story.title)).toBe("Breaking: a chip launch");
    // A citation only inside emphasis still makes the heading a story.
    expect(shape(read("### **A launch [5]**\n\nText."))).toEqual(["story:A launch:5:1"]);
  });

  it("find a story while it is still being written: a heading alone, then with its first words", () => {
    expect(shape(read("Lead.\n\n### A launch [1]"))).toEqual(["block:p", "story:A launch:1:0"]);
    expect(shape(read("Lead.\n\n### A launch [1]\n\nThe compa"))).toEqual(["block:p", "story:A launch:1:1"]);
    // The number hasn't arrived yet: still a heading, and it becomes a story when it does.
    expect(shape(read("Lead.\n\n### A launch"))).toEqual(["block:p", "block:h"]);
  });

  it("keep the last story a story when the answer's choices to tap follow it", () => {
    const fence = "```";
    expect(shape(read(["### A launch [1]", "", "Text.", "", `${fence}choices`, "More on the launch", "AI news only", fence].join("\n")))).toEqual(["story:A launch:1:1", "block:code"]);
    // Any other code straight after it is still a section the heading leads into, not a story.
    expect(shape(read(["### Install it [1]", "", "Run this.", "", `${fence}sh`, "npm install", fence].join("\n")))).toEqual(["block:h", "block:p", "block:code"]);
  });

  it("carry every block's source, so nothing of the answer is lost or doubled", () => {
    const blocks = parseMarkdown(ROUNDUP, { citations: true });
    const back = groupStories(blocks).flatMap((p) => (p.kind === "story" ? p.story.src.split("\n") : [p.block.src]));
    expect(back.join("\n")).toBe(blocks.map((b) => b.src).join("\n"));
  });

  it("read Sinhala titles as they are", () => {
    const [a] = read("### SpaceX AI දත්ත මධ්‍යස්ථාන සඳහා අනුමැතිය [1]\n\nFCC එක අනුමැතිය දුන්නා.");
    expect(a!.kind === "story" && words(a!.story.title)).toBe("SpaceX AI දත්ත මධ්‍යස්ථාන සඳහා අනුමැතිය");
  });
});
