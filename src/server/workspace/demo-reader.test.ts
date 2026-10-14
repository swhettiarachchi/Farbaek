import { describe, expect, it } from "vitest";
import { DEMO_PROPOSAL_TASK_ID, DEMO_TASKS, demoEventType } from "@/content/demo-workspace";
import { newTask, transition, type TaskEventType } from "@/core/realityloop/task-machine";
import { DEMO_FILES_PROJECT_ID } from "@/content/demo-files";
import { sha256Hex } from "@/core/trust/canonical-json";
import { createDemoReader } from "./demo-reader";

describe("demo workspace", () => {
  it.each(DEMO_TASKS.map((t) => [t.title, t] as const))("follows the real lifecycle: %s", (_title, demo) => {
    let task = newTask(demo.id, "demo");
    demo.path.forEach((to, i) => {
      const type = demoEventType(task.state, to) as TaskEventType;
      const evidence = type === "mark_verified" ? { checks: [{ name: "test", command: "pnpm test", exitCode: 0 }], proofPackDigest: "sha256:demo" } : undefined;
      const result = transition(task, { id: `e${i}`, type, at: new Date(), actor: { kind: "system", id: "demo" }, evidence }, task.version);
      if (!result.ok) throw new Error(`${demo.title}: ${result.message}`);
      task = result.task;
      expect(task.state).toBe(to);
    });
  });

  it("is labelled demo, in a trial, and consistent between lists and details", async () => {
    const reader = createDemoReader(new Date("2026-10-14T12:00:00Z"));
    expect(reader.mode).toBe("demo");
    const [ws] = await reader.listWorkspaces();
    expect(ws?.plan.source).toBe("trial");
    const tasks = await reader.listTasks(ws!.id);
    expect(tasks).toHaveLength(DEMO_TASKS.length);
    for (const t of tasks) {
      const detail = await reader.getTask(ws!.id, t.id);
      expect(detail?.task.state).toBe(t.state);
      expect(detail?.history.at(-1)?.to ?? "RECEIVED").toBe(t.state);
    }
  });

  it("serves sample files whose metadata, content, history and search agree", async () => {
    const reader = createDemoReader(new Date("2026-10-14T12:00:00Z"));
    const project = DEMO_FILES_PROJECT_ID;
    const files = await reader.listFiles("demo", project);
    expect(files.map((f) => f.path)).toEqual([...files.map((f) => f.path)].sort((a, b) => a.localeCompare(b)));
    for (const f of files) {
      const full = await reader.getFile("demo", project, f.path);
      expect(full?.sha256).toBe(await sha256Hex(full!.content));
      const history = await reader.listFileRevisions("demo", project, f.path);
      expect(history[0]?.revision).toBe(f.revision);
      expect(await reader.getFileRevision("demo", project, f.path, f.revision)).toBe(full!.content);
    }
    const products = await reader.listFileRevisions("demo", project, "src/lib/products.ts");
    expect(products.map((r) => [r.revision, r.change])).toEqual([
      [2, "edit"],
      [1, "import"],
    ]);
    expect(await reader.getFileRevision("demo", project, "src/lib/products.ts", 3)).toBeNull();
    const hits = await reader.searchFiles("demo", project, "ADDTOCART");
    expect(hits.length).toBeGreaterThan(0);
    expect(await reader.listFiles("demo", "another-project")).toEqual([]);
  });

  it("builds the sample proposal from the sample files with the live rules: nothing dropped, inside the contract", async () => {
    const reader = createDemoReader(new Date("2026-10-14T12:00:00Z"));
    const proposal = await reader.getLatestProposal("demo", DEMO_PROPOSAL_TASK_ID);
    expect(proposal).toMatchObject({ status: "pending", dropped: [], violations: [] });
    expect(proposal!.changes.map((c) => [c.path, c.kind])).toEqual([
      ["src/lib/cart.ts", "edit"],
      ["src/lib/cart.test.ts", "edit"],
    ]);
    expect(proposal!.changes[0]!.content).toContain("Number.isInteger(quantity)");
    const task = await reader.getTask("demo", DEMO_PROPOSAL_TASK_ID);
    expect(task?.task.state).toBe("APPROVAL_PENDING");
    expect(await reader.getLatestProposal("demo", "00000000-0000-4000-8000-00000000b001")).toBeNull();
  });

  it("reports file changes since a time, oldest first, for scope drift", async () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const reader = createDemoReader(now);
    const since = new Date(now.getTime() - 40 * 3_600_000).toISOString();
    const changes = await reader.listFileChangesSince("demo", DEMO_FILES_PROJECT_ID, since);
    expect(changes.map((c) => [c.path, c.change, c.revision])).toEqual([["src/lib/products.ts", "edit", 2]]);
    expect(await reader.listFileChangesSince("demo", DEMO_FILES_PROJECT_ID, now.toISOString())).toEqual([]);
  });
});
