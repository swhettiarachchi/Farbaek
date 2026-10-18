import { describe, expect, it } from "vitest";
import { latestActivity, runFiles, runPhase, workspacePhase, type PhaseEvent } from "./run-phase";

const tool = (name: string, target: string, status = "done"): PhaseEvent => ({ kind: "tool", payload: { tool: name, target, status, detail: "" } });

describe("runPhase", () => {
  it("follows the run's status when the run isn't working", () => {
    expect(runPhase("starting", undefined)).toBe("starting");
    expect(runPhase("waiting", tool("read_file", "a.ts"))).toBe("waiting");
    expect(runPhase("finished", tool("write_file", "a.ts"))).toBe("done");
    expect(runPhase("failed", undefined)).toBe("stopped");
    expect(runPhase("cancelled", undefined)).toBe("stopped");
    expect(runPhase("interrupted", undefined)).toBe("stopped");
  });

  it("reads a working run's latest step", () => {
    expect(runPhase("working", undefined)).toBe("thinking");
    expect(runPhase("working", { kind: "model", payload: { text: "Looking around" } })).toBe("thinking");
    expect(runPhase("working", tool("list_files", "(top)"))).toBe("reading");
    expect(runPhase("working", tool("search_files", "title"))).toBe("reading");
    expect(runPhase("working", tool("edit_file", "index.html"))).toBe("writing");
    expect(runPhase("working", tool("run_command", "npm test"))).toBe("running");
    expect(runPhase("working", { kind: "command", payload: { command: "npm test", exitCode: 0 } })).toBe("running");
    expect(runPhase("working", tool("finish", ""))).toBe("thinking");
  });
});

describe("latestActivity", () => {
  it("describes tools, commands and approvals, and nothing for model text", () => {
    expect(latestActivity(tool("read_file", "src/app.ts"))).toBe("read_file src/app.ts");
    expect(latestActivity(tool("finish", ""))).toBe("finish");
    expect(latestActivity({ kind: "command", payload: { command: "npm run build" } })).toBe("npm run build");
    expect(latestActivity({ kind: "approval", payload: { display: "npm install zod" } })).toBe("npm install zod");
    expect(latestActivity({ kind: "model", payload: { text: "secret plan" } })).toBeNull();
    expect(latestActivity(undefined)).toBeNull();
  });
});

describe("runFiles", () => {
  it("lists changed files in first-touched order, with how they changed", () => {
    const files = runFiles([
      tool("read_file", "index.html"),
      tool("read_file", "index.html"),
      tool("read_file", "styles.css"),
      tool("edit_file", "index.html"),
      tool("write_file", "about.html"),
      tool("edit_file", "about.html"),
      tool("edit_file", "index.html"),
      tool("edit_file", "broken.ts", "failed"),
      tool("write_file", "denied.ts", "denied"),
      { kind: "command", payload: { command: "ls", exitCode: 0 } },
    ]);
    expect(files.read).toBe(2);
    expect(files.changed).toEqual([
      { path: "index.html", change: "edited", times: 2 },
      { path: "about.html", change: "written", times: 2 },
    ]);
  });

  it("is empty for a run with no steps", () => {
    expect(runFiles([])).toEqual({ changed: [], read: 0 });
  });
});

describe("workspacePhase", () => {
  it("is waiting before working, and ready when nothing is going", () => {
    expect(workspacePhase(["finished", "working", "waiting"])).toBe("waiting");
    expect(workspacePhase(["failed", "starting"])).toBe("working");
    expect(workspacePhase(["working"])).toBe("working");
    expect(workspacePhase(["finished", "cancelled", "interrupted"])).toBe("idle");
    expect(workspacePhase([])).toBe("idle");
  });
});
