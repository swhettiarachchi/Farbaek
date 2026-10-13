import { describe, expect, it } from "vitest";
import { DEMO_TASKS, demoEventType } from "@/content/demo-workspace";
import { newTask, transition, type TaskEventType } from "@/core/realityloop/task-machine";
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
});
