/**
 * Unbounded consumption and runaway agents (LLM10, ASI08, ASI10): a run
 * can't spend past its cap, and the agent loop stops at its limits and when
 * cancelled.
 */
import { afterEach, describe, expect, it } from "vitest";
import { worstStepUnits } from "@/core/agent/run-cap";
import { approxTokens } from "@/core/billing/rate-card";
import { STEP_MAX_OUTPUT_TOKENS, callModel, type GatewayDeps, type GatewayModel, type GatewayRequest } from "@/server/agent/gateway";
import type { AgentIdentity } from "@/server/agent/service";
import { obedientModel, project, recordingRunner, run, tool, type Project } from "./support";

const TASK = "22222222-2222-4222-8222-222222222222";
const agent: AgentIdentity = { agentId: "agent-1", orgId: "o1", userId: "user-1", role: "member", name: "Eval PC", lease: { expiresAt: "2099-01-01T00:00:00Z", projects: null, capabilities: ["read", "propose", "model", "mesh"], actionsPerHour: 600 } };

let p: Project | null = null;
afterEach(async () => {
  await p?.cleanup();
  p = null;
});

describe("SE-018 A run spending past its cap", () => {
  it("refuses a step whose worst case passes the cap, before reserving, charging or calling the model", async () => {
    const calls: string[] = [];
    const deps: GatewayDeps = {
      billing: async () => ({ state: "active", paidPlanId: "pro" }),
      now: () => new Date("2026-10-23T12:00:00Z"),
      newEventId: () => "k",
      loadTask: async () => ({ id: TASK, state: "CONTRACT_APPROVED" }),
      rateLimit: async () => true,
      listUsageGrants: async () => [{ id: "g", kind: "plan", units: 200_000, used: 0, startsAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-12-01T00:00:00.000Z" }],
      reserveUsage: async () => (calls.push("reserve"), { ok: true, value: "entry" }),
      settleUsage: async () => (calls.push("settle"), { ok: true, value: null }),
    };
    const requests: GatewayRequest[] = [];
    const model: GatewayModel = {
      family: "anthropic",
      async call(r) {
        requests.push(r);
        return { ok: true, message: { id: "m", model: "claude-sonnet-5-5", content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } } };
      },
    };
    // A prompt padded to make the step expensive, as a looping or manipulated agent might.
    const body = { taskId: TASK, system: "You are the Farbaek Agent.", tools: [], messages: [{ role: "user", content: "x".repeat(200_000) }] };
    const worst = worstStepUnits("claude-sonnet-5-5", approxTokens(JSON.stringify(body.system)) + approxTokens(JSON.stringify(body.tools)) + approxTokens(JSON.stringify(body.messages)), STEP_MAX_OUTPUT_TOKENS);
    const r = await callModel(deps, model, agent, body, undefined, { remainingUnits: Math.floor(worst / 2) });
    expect(r).toMatchObject({ ok: false, code: "RUN_CAP_REACHED" });
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
  });
});

describe("SE-019 An agent that never stops", () => {
  it("stops at its step limit, and runs nothing after", async () => {
    p = await project({ "README.md": "# Demo\n" });
    const runner = recordingRunner("sandbox");
    // A model that asks for one more test run forever.
    const forever = obedientModel(Array.from({ length: 50 }, (_, i) => () => [tool(`c${i}`, "run_command", { program: "pnpm", args: ["test"], reason: "Again." })]));
    const { report } = await run({ model: forever.model, workspace: await p.workspace("disk"), mode: "sandboxed_autopilot", sandboxVerified: true, commands: runner, limits: { maxSteps: 5 } });
    expect(report.outcome).toMatchObject({ kind: "limit", detail: expect.stringMatching(/limit of 5 model steps/) });
    expect(report.steps).toBe(5);
    expect(runner.ran.length).toBeLessThanOrEqual(5);
  });

  it("stops when cancelled, and runs nothing after", async () => {
    p = await project({ "README.md": "# Demo\n" });
    const controller = new AbortController();
    const runner = recordingRunner("sandbox");
    const looping = obedientModel(
      Array.from({ length: 10 }, (_, i) => () => {
        if (i === 2) controller.abort();
        return [tool(`c${i}`, "run_command", { program: "pnpm", args: ["test"], reason: "Again." })];
      }),
    );
    const { report } = await run({ model: looping.model, workspace: await p.workspace("disk"), mode: "sandboxed_autopilot", sandboxVerified: true, commands: runner, signal: controller.signal });
    expect(report.outcome).toEqual({ kind: "cancelled" });
    expect(runner.ran.length).toBeLessThanOrEqual(2);
  });
});
