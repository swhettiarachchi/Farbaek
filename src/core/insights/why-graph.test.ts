import { describe, expect, it } from "vitest";
import { docMentions, whyGraph } from "./why-graph";

const docs = new Map([
  ["docs/adr/0003-cart.md", "# Cart\n\nThe rules live in src/lib/cart.ts and nowhere else.\nSee also cart.ts in the old app.\n"],
  ["README.md", "Run pnpm test.\nindex.ts is the entry.\n"],
  ["src/lib/cart.ts", "// src/lib/cart.ts mentions itself\n"],
  ["notes.json", '{"file": "src/lib/cart.ts"}'],
]);

describe("doc mentions", () => {
  it("confirms a doc that names the path, marks one that names only the file name as inferred, and skips code and the file itself", () => {
    expect(docMentions("src/lib/cart.ts", docs)).toEqual([
      { path: "docs/adr/0003-cart.md", line: 3, quote: "The rules live in src/lib/cart.ts and nowhere else.", inferred: false },
      { path: "docs/adr/0003-cart.md", line: 4, quote: "See also cart.ts in the old app.", inferred: true },
    ]);
  });

  it("doesn't count a short or common file name as a mention", () => {
    expect(docMentions("src/index.ts", docs)).toEqual([]);
    expect(docMentions("src/a.ts", new Map([["README.md", "a.ts is small"]]))).toEqual([]);
  });

  it("doesn't match a longer path that only starts with this one", () => {
    expect(docMentions("src/lib/cart.ts", new Map([["README.md", "src/lib/cart.tsx is the view"]]))).toEqual([]);
  });
});

describe("the Why-Graph", () => {
  const input = {
    projectId: "p1",
    path: "src/lib/cart.ts",
    revisions: [
      { revision: 1, change: "import" as const, createdAt: "2026-10-01T10:00:00Z" },
      { revision: 2, change: "edit" as const, createdAt: "2026-10-05T10:00:00Z" },
      { revision: 3, change: "edit" as const, createdAt: "2026-10-06T10:00:00Z" },
      { revision: 4, change: "edit" as const, createdAt: "2026-10-07T10:00:00Z" },
    ],
    changes: [
      { taskId: "t2", taskTitle: "Guard quantities", outcome: "Fractions are refused.", reason: "Validate q.", appliedAt: "2026-10-06T10:00:00Z", model: "claude-sonnet-5-5", byAgent: false },
      { taskId: "t1", taskTitle: "Free shipping", outcome: null, reason: "", appliedAt: "2026-10-05T10:00:00Z", model: null, byAgent: true },
    ],
    docs,
    tests: ["src/lib/cart.test.ts"],
  };

  it("cites where each fact comes from, in order: origin, changes, docs, tests", () => {
    const g = whyGraph(input);
    expect(g.facts.map((f) => f.kind)).toEqual(["origin", "change", "change", "doc", "doc", "test"]);
    expect(g.facts[0]).toMatchObject({ text: "Imported into the project.", source: { label: "Revision 1", href: "/app/projects/p1/files?path=src%2Flib%2Fcart.ts&history=1" } });
    expect(g.facts[1]).toMatchObject({ text: 'Changed for the task "Free shipping".', detail: null, source: { label: "Task, changed by an agent", href: "/app/tasks/t1" } });
    expect(g.facts[2]).toMatchObject({ text: 'Changed for the task "Guard quantities", whose outcome is: Fractions are refused.', detail: "The change's reason for this file: Validate q.", source: { label: "Task, written by claude-sonnet-5-5" } });
    expect(g.facts[5]).toMatchObject({ source: { label: "src/lib/cart.test.ts", href: "/app/projects/p1/files?path=src%2Flib%2Fcart.test.ts" } });
  });

  it("counts edits no change accounts for, and never explains them", () => {
    expect(whyGraph(input).unexplainedEdits).toBe(1);
    expect(whyGraph({ ...input, changes: [] }).unexplainedEdits).toBe(3);
  });

  it("says a file made in Farbaek was created, not imported", () => {
    const g = whyGraph({ ...input, revisions: [{ revision: 1, change: "edit", createdAt: "2026-10-01T10:00:00Z" }], changes: [], docs: new Map(), tests: [] });
    expect(g.facts).toEqual([expect.objectContaining({ kind: "origin", text: "Created in Farbaek." })]);
    expect(g.unexplainedEdits).toBe(1);
  });
});
