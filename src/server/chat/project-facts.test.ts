/**
 * Reading what Chat is told about a project (stage 282, ADR 0290): names and states, as the person, and never a file's contents.
 */
import { describe, expect, it } from "vitest";
import type { WorkspaceReader } from "@/server/workspace/types";
import { readProjectFacts } from "./project-facts";

const ORG = "o1";
const PROJECT = "p1";
type Reads = Pick<WorkspaceReader, "getProject" | "listFiles" | "listTasks">;

function reader(over: Partial<Reads> = {}, seen: { call: string; args: unknown[] }[] = []): Reads {
  return {
    getProject: async (...args) => (seen.push({ call: "getProject", args }), { id: PROJECT, name: "Harbour Bakery site", description: "A one-page site.", createdAt: "2026-11-01T00:00:00Z", archivedAt: null }),
    listFiles: async (...args) => (seen.push({ call: "listFiles", args }), [{ path: "index.html", revision: 2, sizeBytes: 1_200, sha256: "a".repeat(64), updatedAt: "2026-11-20T00:00:00Z" }]),
    listTasks: async (...args) => (
      seen.push({ call: "listTasks", args }),
      [{ id: "t1", title: "Add an order form", state: "APPROVAL_PENDING", version: 3, projectId: PROJECT, createdAt: "2026-11-19T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z" }]
    ),
    ...over,
  };
}

describe("what Chat reads of a project", () => {
  it("is its name, what it is, its files' paths, its tasks with their states, and whether its site is live", async () => {
    const facts = await readProjectFacts(reader(), async () => true, ORG, PROJECT);
    expect(facts).toEqual({
      name: "Harbour Bakery site",
      description: "A one-page site.",
      archived: false,
      paths: ["index.html"],
      tasks: [{ title: "Add an order form", state: "APPROVAL_PENDING" }],
      moreTasks: false,
      live: true,
    });
  });

  it("asks only for this project in this workspace, and for a bounded number of tasks", async () => {
    const seen: { call: string; args: unknown[] }[] = [];
    const lives: string[] = [];
    await readProjectFacts(reader({}, seen), async (id) => (lives.push(id), false), ORG, PROJECT);
    expect(seen.find((s) => s.call === "getProject")!.args).toEqual([ORG, PROJECT]);
    expect(seen.find((s) => s.call === "listFiles")!.args).toEqual([ORG, PROJECT]);
    expect(seen.find((s) => s.call === "listTasks")!.args).toEqual([ORG, { projectId: PROJECT, limit: 40 }]);
    expect(lives).toEqual([PROJECT]);
  });

  it("is nothing for a project the person can't open, and then nothing else is read", async () => {
    const seen: { call: string; args: unknown[] }[] = [];
    let asked = 0;
    const facts = await readProjectFacts(reader({ getProject: async () => null }, seen), async () => (asked++, true), ORG, PROJECT);
    expect(facts).toBeNull();
    expect(seen).toEqual([]);
    expect(asked).toBe(0);
  });

  it("stands on what could be read: a part that fails is unread, never empty, and the rest is still told", async () => {
    const boom = async () => {
      throw new Error("the database didn't answer");
    };
    const facts = await readProjectFacts(reader({ listFiles: boom, listTasks: boom }), boom, ORG, PROJECT);
    expect(facts).toMatchObject({ name: "Harbour Bakery site", paths: null, tasks: null, live: null, moreTasks: false });
    // One part failing leaves the others as they were read.
    const some = await readProjectFacts(reader({ listTasks: boom }), async () => false, ORG, PROJECT);
    expect(some).toMatchObject({ paths: ["index.html"], tasks: null, live: false });
  });

  it("says when there may be more tasks than it read", async () => {
    const forty = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, state: "VERIFIED" as const, version: 1, projectId: PROJECT, createdAt: "2026-11-19T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z" }));
    expect((await readProjectFacts(reader({ listTasks: async () => forty }), async () => false, ORG, PROJECT))?.moreTasks).toBe(true);
    expect((await readProjectFacts(reader({ listTasks: async () => forty.slice(0, 39) }), async () => false, ORG, PROJECT))?.moreTasks).toBe(false);
  });

  it("says when the project is archived", async () => {
    const archived = reader({ getProject: async () => ({ id: PROJECT, name: "Old site", description: null, createdAt: "2026-01-01T00:00:00Z", archivedAt: "2026-06-01T00:00:00Z" }) });
    expect(await readProjectFacts(archived, async () => false, ORG, PROJECT)).toMatchObject({ archived: true, description: null });
  });

  it("takes a file's path and nothing else of it", async () => {
    const facts = await readProjectFacts(reader(), async () => false, ORG, PROJECT);
    expect(JSON.stringify(facts)).not.toMatch(/sha256|sizeBytes|revision|aaaa/);
  });
});
