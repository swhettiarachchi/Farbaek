import { describe, expect, it } from "vitest";
import { DEMO_FILES_PROJECT_ID } from "@/content/demo-files";
import { skillPinStatus } from "@/core/agent/skill-pins";
import { createDemoReader } from "./demo-reader";
import { pinProjectSkill, unpinProjectSkill, type SkillPinDeps } from "./skill-pins";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const SKILL = ".farbaek/skills/house-style/SKILL.md";

function fakeDeps(over: { role?: OrgRole | null; error?: string } = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const deps: WriteDeps & SkillPinDeps = {
    role: async () => (over.role === undefined ? "member" : over.role),
    billing: async () => ({ state: "free" }),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    pinSkill: async (input) => (calls.push({ name: "pin", input }), over.error ? { ok: false, error: over.error } : { ok: true, value: null }),
    unpinSkill: async (input) => (calls.push({ name: "unpin", input }), { ok: true, value: null }),
    newEventId: () => "e1",
    now: () => new Date("2026-10-23T10:00:00Z"),
  };
  return { deps, calls };
}

const input = { orgId: "o1", userId: "u1", projectId: "p1", path: SKILL, revision: 3, sha256: "a".repeat(64) };

describe("pinProjectSkill", () => {
  it("sends exactly the revision and hash that were reviewed", async () => {
    const { deps, calls } = fakeDeps();
    expect(await pinProjectSkill(deps, input)).toEqual({ ok: true, value: null });
    expect(calls).toEqual([{ name: "pin", input: { projectId: "p1", actor: "u1", path: SKILL, revision: 3, sha256: "a".repeat(64) } }]);
  });

  it("refuses viewers and files that aren't skills, before asking the database", async () => {
    const viewer = fakeDeps({ role: "viewer" });
    expect(await pinProjectSkill(viewer.deps, input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const other = fakeDeps();
    expect(await pinProjectSkill(other.deps, { ...input, path: "README.md" })).toMatchObject({ ok: false, code: "INVALID_PATH" });
    expect(await unpinProjectSkill(other.deps, { ...input, path: "src/app.ts" })).toMatchObject({ ok: false, code: "INVALID_PATH" });
    expect([...viewer.calls, ...other.calls]).toEqual([]);
  });

  it("explains a skill that changed again while it was being reviewed", async () => {
    const { deps } = fakeDeps({ error: "FILE_CHANGED" });
    expect(await pinProjectSkill(deps, input)).toMatchObject({ ok: false, code: "FILE_CHANGED", message: expect.stringMatching(/changed again since you opened it/) });
  });
});

describe("the demo's sample skill", () => {
  it("was approved at its first revision and has changed since, so builds leave it out", async () => {
    const reader = createDemoReader(new Date("2026-10-23T10:00:00Z"));
    const [pin] = await reader.listSkillPins("demo", DEMO_FILES_PROJECT_ID);
    const file = (await reader.listFiles("demo", DEMO_FILES_PROJECT_ID)).find((f) => f.path === SKILL)!;
    expect(pin).toMatchObject({ path: SKILL, revision: 1, pinnedBy: null });
    expect(file.revision).toBe(2);
    expect(skillPinStatus(file, pin)).toBe("changed");
    expect(await reader.getFileRevision("demo", DEMO_FILES_PROJECT_ID, SKILL, 1)).toContain("Sample skill for the demo workspace.");
  });
});
