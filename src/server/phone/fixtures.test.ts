/**
 * The contract between the server and Farbaek for iPhone (ADR 0110): the
 * sample API's real answers, kept as JSON in ios/FarbaekTests/Fixtures, which
 * the app's own tests decode with its models. When an answer's shape changes,
 * this test fails until the fixtures are regenerated (UPDATE_IOS_FIXTURES=1)
 * and the app's tests show whether it still reads them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_PROPOSAL_TASK_ID, DEMO_USER } from "@/content/demo-workspace";
import type { RunEventView, RunView } from "@/server/cloud-agent/store";
import type { AppContext } from "@/server/workspace/context";
import { createDemoReader } from "@/server/workspace/demo-reader";
import { handlePhoneApi, type PhoneApiDeps } from "./api";
import { runDetail } from "./views";

const DIR = "ios/FarbaekTests/Fixtures";
const NOW = new Date("2026-10-29T12:00:00Z");

async function sampleContext(): Promise<AppContext> {
  const reader = createDemoReader(NOW);
  const workspaces = await reader.listWorkspaces();
  return { mode: "demo", user: { ...DEMO_USER }, reader, workspaces, current: workspaces[0]!, role: "owner", permissions: {}, writes: { enabled: false, reason: "This is sample data, so nothing here can change." } };
}

const deps = {
  auth: null,
  siteOrigin: "https://www.farbaek.com",
  browserUser: async () => null,
  live: async () => {
    throw new Error("not used");
  },
  sample: async () => ({ ctx: await sampleContext(), runs: { list: async () => [], get: async () => null, events: async () => [] } }),
  execution: () => ({ mode: "sandboxed" }),
  writes: {} as PhoneApiDeps["writes"],
  pushAvailable: () => false,
  appleSignIn: () => false,
  billing: async () => ({ managedBy: null, live: false, applePurchases: false }),
  clientKey: () => "fixtures",
  now: () => NOW,
} satisfies PhoneApiDeps;

const RUN: RunView = {
  id: "00000000-0000-4000-8000-0000000000f1",
  taskId: DEMO_PROPOSAL_TASK_ID,
  taskTitle: "Add a contact form",
  projectId: "p",
  projectName: "Sample bakery site",
  startedBy: DEMO_USER.id,
  effort: "balanced",
  mode: "sandboxed",
  status: "waiting",
  model: "claude-sonnet-5-5",
  steps: 4,
  tokens: 1200,
  outcome: null,
  finish: null,
  proposalId: null,
  sandboxSessionId: null,
  startedAt: "2026-10-29T11:58:00.123456+00:00",
  endedAt: null,
  capUnits: null,
};
const EVENTS: RunEventView[] = [
  { id: 11, kind: "note", payload: { text: "Started an isolated sandbox for tests and builds." }, at: "2026-10-29T11:58:01.5+00:00" },
  { id: 12, kind: "model", payload: { text: "Reading the contact page.", model: "claude-sonnet-5-5", tokens: 600 }, at: "2026-10-29T11:58:03Z" },
  { id: 13, kind: "command", payload: { command: "pnpm test", exitCode: 0, output: "2 passed" }, at: "2026-10-29T11:58:20Z" },
  { id: 14, kind: "approval", payload: { requestId: "req-1", display: "pnpm add zod", risk: "install", reason: "Installs a package from the registry.", why: "To check the form's input.", bindingHash: "c".repeat(64) }, at: "2026-10-29T11:58:30Z" },
];

async function answers(): Promise<Record<string, unknown>> {
  const get = async (path: string) => {
    const r = await handlePhoneApi(new Request(`https://www.farbaek.com/api/v1/app/sample/${path}`), ["sample", ...path.split("?")[0]!.split("/")], deps);
    expect(r.status, path).toBe(200);
    return r.json();
  };
  const run = await runDetail({ list: async () => [RUN], get: async () => RUN, events: async (_id, after) => EVENTS.filter((e) => e.id > after) }, RUN.id, 0, { userId: DEMO_USER.id, manager: true });
  return {
    me: await get("me"),
    home: await get("home"),
    approvals: await get("approvals"),
    approval: await get(`approvals/${DEMO_PROPOSAL_TASK_ID}`),
    tasks: await get("tasks"),
    task: await get(`tasks/${DEMO_PROPOSAL_TASK_ID}`),
    plan: await get(`tasks/${DEMO_PROPOSAL_TASK_ID}/plan`),
    projects: await get("projects"),
    run: { data: run },
  };
}

describe("the iPhone app's fixtures", () => {
  it("are the sample API's answers as they are today", async () => {
    const all = await answers();
    if (process.env.UPDATE_IOS_FIXTURES === "1") {
      mkdirSync(DIR, { recursive: true });
      for (const [name, body] of Object.entries(all)) writeFileSync(`${DIR}/${name}.json`, `${JSON.stringify(body, null, 2)}\n`);
    }
    for (const [name, body] of Object.entries(all)) {
      const file = `${DIR}/${name}.json`;
      expect(existsSync(file), `${file}: run with UPDATE_IOS_FIXTURES=1`).toBe(true);
      expect(JSON.parse(readFileSync(file, "utf8")), name).toEqual(body);
    }
  });
});
