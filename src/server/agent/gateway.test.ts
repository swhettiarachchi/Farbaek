import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import type { TaskState } from "@/core/realityloop/task-machine";
import { worstStepUnits } from "@/core/agent/run-cap";
import { approxTokens } from "@/core/billing/rate-card";
import { STEP_MAX_OUTPUT_TOKENS, callModel, stepReserveUnits, type GatewayCallResult, type GatewayDeps, type GatewayModel, type GatewayRequest } from "./gateway";
import type { AgentIdentity } from "./service";

const TASK = "22222222-2222-4222-8222-222222222222";
const agent: AgentIdentity = { agentId: "agent-1", orgId: "o1", userId: "user-1", role: "member", name: "Office PC", lease: { expiresAt: "2099-01-01T00:00:00Z", projects: null, capabilities: ["read", "propose", "model", "mesh"], actionsPerHour: 600 } };
const PRO: BillingSnapshot = { state: "active", paidPlanId: "pro" };

const reply = (over: Partial<{ stop: string; model: string }> = {}): GatewayCallResult => ({
  ok: true,
  message: {
    id: "msg_1",
    model: over.model ?? "claude-sonnet-5-5",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id: "tu_1", name: "read_file", input: { path: "src/app.ts" } },
    ],
    stop_reason: over.stop ?? "tool_use",
    // On Sonnet: 500 input ($0.001), 1,200 output ($0.012), 2,000 cache writes ($0.005) and 40,000 cache reads ($0.004): 220 units.
    usage: { input_tokens: 500, output_tokens: 1_200, cache_creation_input_tokens: 2_000, cache_read_input_tokens: 40_000 },
  },
});

/** A labelled fake provider: it never calls a model. */
function fakeModel(result: GatewayCallResult | Error) {
  const m = {
    family: "anthropic" as const,
    requests: [] as GatewayRequest[],
    async call(request: GatewayRequest) {
      m.requests.push(request);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return m satisfies GatewayModel & { requests: GatewayRequest[] };
}

function fakeDeps(over: { billing?: BillingSnapshot | null; state?: TaskState | null; reserveError?: string; limited?: boolean; projectId?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: GatewayDeps = {
    billing: async () => (over.billing === undefined ? PRO : over.billing),
    now: () => new Date("2026-10-18T12:00:00Z"),
    newEventId: () => "key-1",
    loadTask: async () => (over.state === null ? null : { id: TASK, state: over.state ?? "CONTRACT_APPROVED", ...(over.projectId ? { projectId: over.projectId } : {}) }),
    rateLimit: async () => !over.limited,
    listUsageGrants: async () => [{ id: "g", kind: "plan", units: 215_792, used: 21_000, startsAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-12-01T00:00:00.000Z" }],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), over.reserveError ? { ok: false, error: over.reserveError } : { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
  };
  return { deps, calls };
}

const body = (over: Record<string, unknown> = {}) => ({
  taskId: TASK,
  system: "You are the Farbaek Agent.",
  tools: [{ name: "read_file", description: "Read a file.", input_schema: { type: "object", properties: { path: { type: "string" } } } }],
  messages: [{ role: "user", content: "Reject fractional quantities in the cart." }],
  ...over,
});

describe("a run's cap (ADR 0040)", () => {
  const b = body();
  const worst = worstStepUnits("claude-sonnet-5-5", approxTokens(JSON.stringify(b.system)) + approxTokens(JSON.stringify(b.tools)) + approxTokens(JSON.stringify(b.messages)), STEP_MAX_OUTPUT_TOKENS);

  it("stops before a step whose worst case doesn't fit, without reserving or calling the model", async () => {
    const { deps, calls } = fakeDeps();
    const model = fakeModel(reply());
    const r = await callModel(deps, model, agent, b, undefined, { remainingUnits: worst - 1 });
    expect(r).toMatchObject({ ok: false, status: 402, code: "RUN_CAP_REACHED", message: expect.stringContaining("Nothing more was charged") });
    expect(calls).toEqual([]);
    expect(model.requests).toEqual([]);
  });

  it("lets a step through when even its worst case fits, and charges only what it really cost", async () => {
    const { deps, calls } = fakeDeps();
    const r = await callModel(deps, fakeModel(reply()), agent, b, undefined, { remainingUnits: worst });
    expect(r).toMatchObject({ ok: true });
    expect(calls.map((c) => c.name)).toEqual(["reserve", "settle"]);
    expect(calls[1]!.input.units).toBeLessThanOrEqual(worst);
  });

  it("works as before when no cap is given", async () => {
    const { deps } = fakeDeps();
    expect(await callModel(deps, fakeModel(reply()), agent, b)).toMatchObject({ ok: true });
  });
});

describe("a permission lease on the gateway (ADR 0117)", () => {
  const P = "33333333-3333-4333-8333-333333333333";
  const only = (projects: string[]): AgentIdentity => ({ ...agent, lease: { ...agent.lease, projects } });

  it("refuses a task outside the lease's projects, and one whose project isn't known, before reserving anything", async () => {
    for (const deps of [fakeDeps({ projectId: "44444444-4444-4444-8444-444444444444" }), fakeDeps()]) {
      const model = fakeModel(reply());
      expect(await callModel(deps.deps, model, only([P]), body())).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN" });
      expect(deps.calls).toEqual([]);
      expect(model.requests).toEqual([]);
    }
  });

  it("lets a task in the lease's projects through", async () => {
    expect(await callModel(fakeDeps({ projectId: P }).deps, fakeModel(reply()), only([P]), body())).toMatchObject({ ok: true });
  });
});

describe("one model step through the gateway", () => {
  it("routes the model on the server, reserves, calls it and settles to the real cost", async () => {
    const { deps, calls } = fakeDeps();
    const model = fakeModel(reply());
    const r = await callModel(deps, model, agent, body());
    expect(r).toMatchObject({ ok: true, value: { routedModel: "claude-sonnet-5-5", note: null, usage: { percent: 10 }, message: { stop_reason: "tool_use" } } });
    expect(model.requests[0]).toMatchObject({ model: "claude-sonnet-5-5", thinking: "medium", maxTokens: 32_000, system: "You are the Farbaek Agent." });
    expect(calls[0]!.input).toMatchObject({ operation: "model_gateway", taskId: TASK, actor: "user-1", units: stepReserveUnits("claude-sonnet-5-5", body() as never), grant: { kind: "plan" } });
    expect(calls[1]!.input).toMatchObject({ status: "settled", units: 220, refundReason: null, usage: { cacheWriteTokens: 2_000, cacheReadTokens: 40_000 } });
  });

  it("uses Deep effort to reach Opus on Pro, and ignores a model the plan doesn't include", async () => {
    const deep = fakeModel(reply());
    await callModel(fakeDeps().deps, deep, agent, body({ effort: "deep" }));
    expect(deep.requests[0]).toMatchObject({ model: "claude-opus-5-5", thinking: "high" });
    const pinned = fakeModel(reply());
    const r = await callModel(fakeDeps().deps, pinned, agent, body({ pinned: "claude-fable-5-1" }));
    expect(pinned.requests[0]!.model).toBe("claude-sonnet-5-5");
    expect(r).toMatchObject({ ok: true, value: { note: expect.stringMatching(/isn't included/) } });
  });

  it("prices later steps mostly as cache reads", () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: i % 2 ? [{ type: "text", text: "x".repeat(6_000) }] : "y".repeat(6_000) }));
    const first = stepReserveUnits("claude-sonnet-5-5", { system: "s", tools: [], messages: history.slice(0, 1) as never });
    const later = stepReserveUnits("claude-sonnet-5-5", { system: "s", tools: [], messages: history.slice(0, 19) as never });
    // 16,000 reserved output tokens on Sonnet is 1,600 units; 19 turns of history add little when cached.
    expect(first).toBeGreaterThanOrEqual(1_600);
    expect(later - first).toBeLessThan(100);
  });

  it("refunds refusals and provider failures in full", async () => {
    const refused = fakeDeps();
    expect(await callModel(refused.deps, fakeModel(reply({ stop: "refusal" })), agent, body())).toMatchObject({ ok: true, value: { message: { stop_reason: "refusal" } } });
    expect(refused.calls[1]!.input).toMatchObject({ status: "refunded", refundReason: "failed" });

    const busy = fakeDeps();
    expect(await callModel(busy.deps, fakeModel({ ok: false, failure: "PROVIDER_BUSY" }), agent, body())).toMatchObject({ ok: false, status: 503, code: "AI_BUSY", message: expect.stringContaining("didn't count") });
    expect(busy.calls[1]!.input).toMatchObject({ status: "refunded" });

    const thrown = fakeDeps();
    expect(await callModel(thrown.deps, fakeModel(new Error("socket")), agent, body())).toMatchObject({ ok: false, code: "AI_UNAVAILABLE" });
  });

  it("refuses without calling the model when usage, the task, the role or the request doesn't allow it", async () => {
    const model = fakeModel(reply());
    expect(await callModel(fakeDeps({ reserveError: "QUOTA_EXCEEDED" }).deps, model, agent, body())).toMatchObject({ ok: false, status: 402, code: "QUOTA_EXCEEDED" });
    expect(await callModel(fakeDeps({ state: "RECEIVED" }).deps, model, agent, body())).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(await callModel(fakeDeps({ state: null }).deps, model, agent, body())).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await callModel(fakeDeps({ billing: null }).deps, model, agent, body())).toMatchObject({ ok: false, code: "ENTITLEMENT_UNAVAILABLE" });
    expect(await callModel(fakeDeps({ limited: true }).deps, model, agent, body())).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(await callModel(fakeDeps().deps, model, { ...agent, role: "viewer" }, body())).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(model.requests).toHaveLength(0);
  });

  it("accepts only text, tool use, tool results and thinking, within limits", async () => {
    const model = fakeModel(reply());
    const image = body({ messages: [{ role: "user", content: [{ type: "image", source: { type: "url", url: "https://example.com/a.png" } }] }] });
    expect(await callModel(fakeDeps().deps, model, agent, image)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    const serverTool = body({ tools: [{ type: "web_search_20260209", name: "web_search" }] });
    expect(await callModel(fakeDeps().deps, model, agent, serverTool)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await callModel(fakeDeps().deps, model, agent, body({ taskId: "not-a-uuid" }))).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    const replayed = body({
      messages: [
        { role: "user", content: "Go." },
        { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "tu_1", name: "read_file", input: { path: "a" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "file text" }] },
      ],
    });
    expect(await callModel(fakeDeps().deps, model, agent, replayed)).toMatchObject({ ok: true });
    expect(model.requests).toHaveLength(1);
  });
});
