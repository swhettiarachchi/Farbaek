import { describe, expect, it } from "vitest";
import type { ContractDraft } from "@/core/realityloop/contract-draft";
import type { ContractDrafter, DraftBrief, DraftOutcome } from "@/server/ai/contract-drafter";
import type { AiUsageDeps } from "./ai-usage";
import type { FileDeps } from "./files";
import { getStarter } from "@/content/starters";
import { startFromPrompt } from "./start-from-prompt";
import type { WriteDeps } from "./use-cases";

const NOW = new Date("2026-10-19T10:00:00.000Z");
const USAGE = { model: "claude-haiku-5-5", inputTokens: 900, outputTokens: 600 };
const DRAFT: ContractDraft = {
  outcome: "A one-page site for the bakery with its menu and opening hours.",
  resources: ["index.html", "styles.css"],
  allowedOperations: ["files.edit"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: [],
  acceptanceCriteria: [{ statement: "The menu shows on the home page.", verification: "assertion" }],
  requiredChecks: [],
  assumptions: [],
  openQuestions: [],
  recovery: "Restore the previous files.",
  maxRecords: null,
};

const drafterWith = (outcome: DraftOutcome | Error): ContractDrafter => ({
  model: "claude-haiku-5-5",
  maxOutputTokens: 8_000,
  async draft() {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  },
});

function fakeDeps(over: { importFails?: boolean; createProjectFails?: string; saveFails?: string } = {}) {
  const log: string[] = [];
  const deps: WriteDeps & AiUsageDeps & FileDeps = {
    role: async () => "owner",
    billing: async () => ({ state: "free" }),
    countActiveProjects: async () => 0,
    loadTask: async () => ({ id: "t1", projectId: "p1", state: "RECEIVED", version: 0, eventIds: [] }),
    createProject: async (input) => (log.push(`project:${input.name}`), over.createProjectFails ? { ok: false, error: over.createProjectFails } : { ok: true, value: "p1" }),
    createTask: async (input) => (log.push(`task:${input.title}`), { ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => (log.push("save"), over.saveFails ? { ok: false, error: over.saveFails } : { ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    listUsageGrants: async () => [],
    reserveUsage: async () => (log.push("reserve"), { ok: true, value: "entry-1" }),
    settleUsage: async () => (log.push("settle"), { ok: true, value: null }),
    importFiles: async (input) => (log.push(`import:${input.files.length}`), over.importFails ? { ok: false, error: "PROJECT_TOO_LARGE" } : { ok: true, value: { created: input.files.length, updated: 0, unchanged: 0 } }),
    saveFile: async () => ({ ok: true, value: 1 }),
    saveImage: async () => ({ ok: true, value: 1 }),
    deleteFile: async () => ({ ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => NOW,
  };
  return { deps, log };
}

const source = (drafter: ContractDrafter) => ({ family: "anthropic" as const, create: () => drafter });
const input = (prompt: unknown) => ({ orgId: "o1", userId: "u1", prompt });

describe("startFromPrompt", () => {
  it("creates the project from a fitting starter, the task, then drafts and saves contract version 1", async () => {
    const { deps, log } = fakeDeps();
    const r = await startFromPrompt(deps, source(drafterWith({ ok: true, draft: DRAFT, usage: USAGE })), input("Build me a landing page for my bakery"));
    expect(r).toEqual({ ok: true, value: { projectId: "p1", taskId: "t1", planned: true, planNote: null, starterNote: null } });
    expect(log[0]).toBe("project:Landing page for my bakery");
    expect(log[1]).toMatch(/^import:\d+$/);
    expect(log.slice(2)).toEqual(["task:Build me a landing page for my bakery", "reserve", "settle", "save"]);
  });

  it("refuses a prompt that's too short before creating anything", async () => {
    const { deps, log } = fakeDeps();
    const r = await startFromPrompt(deps, source(drafterWith({ ok: true, draft: DRAFT, usage: USAGE })), input("hi"));
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("few more words") });
    expect(log).toEqual([]);
  });

  it("keeps the project and task when AI isn't connected, and says why there's no plan", async () => {
    const { deps, log } = fakeDeps();
    const r = await startFromPrompt(deps, { unavailable: "AI isn't connected on this server yet." }, input("A portfolio site for my photos"));
    expect(r).toMatchObject({ ok: true, value: { planned: false, planNote: "AI isn't connected on this server yet." } });
    expect(log.some((l) => l === "reserve")).toBe(false);
  });

  it("reports a failed draft as no plan yet, with the drafter's reason", async () => {
    const { deps } = fakeDeps();
    const r = await startFromPrompt(deps, source(drafterWith(new Error("provider down"))), input("A portfolio site for my photos"));
    expect(r).toMatchObject({ ok: true, value: { planned: false, planNote: expect.any(String) } });
  });

  it("reports a draft that fails Farbaek's contract checks without losing the task", async () => {
    const { deps } = fakeDeps({ saveFails: "INVALID_CONTRACT" });
    const r = await startFromPrompt(deps, source(drafterWith({ ok: true, draft: DRAFT, usage: USAGE })), input("A portfolio site for my photos"));
    expect(r).toMatchObject({ ok: true, value: { planned: false, planNote: expect.stringContaining("didn't pass Farbaek's checks") } });
  });

  it("notes a starter that couldn't be imported and carries on", async () => {
    const { deps } = fakeDeps({ importFails: true });
    const r = await startFromPrompt(deps, source(drafterWith({ ok: true, draft: DRAFT, usage: USAGE })), input("A landing page for my bakery"));
    expect(r).toMatchObject({ ok: true, value: { planned: true, starterNote: expect.stringContaining("starts empty") } });
  });

  it("puts a follow-up into the existing project, without a new project or starter", async () => {
    const { deps, log } = fakeDeps();
    const r = await startFromPrompt(deps, source(drafterWith({ ok: true, draft: DRAFT, usage: USAGE })), {
      ...input("Add a testimonials section under the menu"),
      existing: { id: "p-existing", name: "Sunrise Bakery", description: "A bakery site", paths: ["index.html", "styles.css"] },
    });
    expect(r).toMatchObject({ ok: true, value: { projectId: "p-existing", planned: true } });
    expect(log.some((l) => l.startsWith("project:") || l.startsWith("import:"))).toBe(false);
    expect(log[0]).toBe("task:Add a testimonials section under the menu");
  });

  it("tells the drafter the project's real paths: the starter's for a new build, the project's for a follow-up", async () => {
    const briefs: DraftBrief[] = [];
    const capturing: ContractDrafter = { ...drafterWith({ ok: true, draft: DRAFT, usage: USAGE }), draft: async (b) => (briefs.push(b), { ok: true, draft: DRAFT, usage: USAGE }) };
    // Words that match no design direction, so the plain static starter is used.
    await startFromPrompt(fakeDeps().deps, source(capturing), input("A one-page site about my cycling club and its weekly rides"));
    expect(briefs[0]?.paths).toContain("index.html");
    // A plain starter's DESIGN.md is a plan to write, not one to follow.
    expect(briefs[0]?.paths).toContain("DESIGN.md");
    expect(briefs[0]?.projectDescription).toContain("blank design plan");
    await startFromPrompt(fakeDeps().deps, source(capturing), {
      ...input("Add a testimonials section under the menu"),
      existing: { id: "p-existing", name: "Sunrise Bakery", description: null, paths: ["index.html", "styles.css", "script.js"] },
    });
    expect(briefs[1]?.paths).toEqual(["index.html", "styles.css", "script.js"]);
  });

  it("uses the template the person chose, even when the prompt's words suggest another starter", async () => {
    const { deps, log } = fakeDeps();
    const briefs: DraftBrief[] = [];
    const capturing: ContractDrafter = { ...drafterWith({ ok: true, draft: DRAFT, usage: USAGE }), draft: async (b) => (briefs.push(b), { ok: true, draft: DRAFT, usage: USAGE }) };
    // "dashboard" would pick the Next.js app; the chosen template wins.
    await startFromPrompt(deps, source(capturing), { ...input("A booking dashboard for my café"), starter: "local-business" });
    expect(log[1]).toBe(`import:${getStarter("local-business")!.files.length}`);
    expect(briefs[0]?.projectDescription).toContain("Bakery and café");
    // The template's own features are sample content, not part of this brief.
    expect(briefs[0]?.projectDescription).toContain("sample content for a different product");
    expect(briefs[0]?.projectDescription).not.toContain(getStarter("local-business")!.summary);
  });

  it("starts a website from the premium direction for its business, and keeps app prompts on the app starter (ADR 0158)", async () => {
    const briefs: DraftBrief[] = [];
    const capturing: ContractDrafter = { ...drafterWith({ ok: true, draft: DRAFT, usage: USAGE }), draft: async (b) => (briefs.push(b), { ok: true, draft: DRAFT, usage: USAGE }) };
    const bakery = fakeDeps();
    await startFromPrompt(bakery.deps, source(capturing), input("A site for my bakery in Kandy"));
    expect(bakery.log[1]).toBe(`import:${getStarter("local-business")!.files.length}`);
    expect(briefs[0]?.projectDescription).toContain("Studio kit, keep the kit");
    const villa = fakeDeps();
    await startFromPrompt(villa.deps, source(capturing), input("A website for our villa in Ella"));
    expect(villa.log[1]).toBe(`import:${getStarter("luxury")!.files.length}`);
    const app = fakeDeps();
    await startFromPrompt(app.deps, source(capturing), input("A booking dashboard for my café with a login"));
    expect(app.log[1]).toBe(`import:${getStarter("nextjs-app")!.files.length}`);
  });

  it("stops when the project can't be created, for example at the plan's project limit", async () => {
    const { deps, log } = fakeDeps({ createProjectFails: "QUOTA_EXCEEDED" });
    const r = await startFromPrompt(deps, source(drafterWith({ ok: true, draft: DRAFT, usage: USAGE })), input("A landing page for my bakery"));
    expect(r.ok).toBe(false);
    expect(log.some((l) => l.startsWith("task:"))).toBe(false);
  });
});
