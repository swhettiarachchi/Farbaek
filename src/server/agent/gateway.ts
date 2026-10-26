/**
 * The model gateway (ADR 0021): how the Farbaek Agent reaches a model without
 * anyone bringing an API key. The desktop app sends its conversation for an
 * approved task; Farbaek picks the model for the plan and effort (Auto
 * routing), reserves usage from the workspace's wallet, calls the model with
 * Farbaek's own key, settles to the real token cost and returns the reply.
 *
 * - The agent acts for the person who paired it, who must be able to change
 *   the task's project; the database re-checks that when it reserves.
 * - The model is always the server's choice. A pinned model is honoured only
 *   when the plan includes it.
 * - Only plain text, tool use, tool results and the model's own thinking
 *   blocks are accepted, within size limits. No images, documents or
 *   server-side tools.
 * - A refusal or a provider failure is refunded in full.
 */
import { z } from "zod";
import { worstStepUnits } from "@/core/agent/run-cap";
import { EFFORTS } from "@/core/agent/routing";
import { routeModel } from "@/server/ai/routing";
import { approxTokens, costUnits } from "@/core/billing/rate-card";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { DraftFailure, ProviderUsage } from "@/server/ai/contract-drafter";
import { percentAfter, refundUsage, reserveUsage, resolvePlan, settleUsage, unitsFor, type AiUsageDeps, type UsageContext } from "@/server/workspace/ai-usage";
import { agentFail, requireAgentContributor, type AgentIdentity, type AgentResult } from "./service";

/** The most a step may write, thinking included. */
export const STEP_MAX_OUTPUT_TOKENS = 32_000;
/** Output reserved before a step: most steps write far less than the maximum, and settling covers the rest. */
export const STEP_OUTPUT_RESERVE = 16_000;
/** Request body limit for one step, in bytes. */
export const MODEL_CALL_MAX_BYTES = 6 * 1024 * 1024;

const Text = z.looseObject({ type: z.literal("text"), text: z.string().max(1_000_000) });
const AssistantBlock = z.discriminatedUnion("type", [
  Text,
  z.looseObject({ type: z.literal("thinking"), thinking: z.string(), signature: z.string().max(100_000) }),
  z.looseObject({ type: z.literal("redacted_thinking"), data: z.string().max(1_000_000) }),
  z.looseObject({ type: z.literal("tool_use"), id: z.string().max(200), name: z.string().max(64), input: z.unknown() }),
]);
const UserBlock = z.discriminatedUnion("type", [
  Text,
  z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string().max(200),
    content: z.union([z.string().max(1_000_000), z.array(z.object({ type: z.literal("text"), text: z.string().max(1_000_000) }))]),
    is_error: z.boolean().optional(),
  }),
]);
const Message = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.union([z.string().max(1_000_000), z.array(UserBlock).min(1).max(200)]) }),
  z.object({ role: z.literal("assistant"), content: z.array(AssistantBlock).min(1).max(200) }),
]);

export const ModelCallBody = z.object({
  taskId: z.uuid(),
  effort: z.enum(EFFORTS).default("balanced"),
  /** What this step mostly does. Agent runs that write code send "write". */
  step: z.enum(["read", "plan", "write", "review"]).default("write"),
  pinned: z.string().max(64).nullish(),
  system: z.string().min(1).max(200_000),
  tools: z
    .array(z.object({ name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), description: z.string().max(10_000), input_schema: z.record(z.string(), z.unknown()) }))
    .max(40),
  messages: z.array(Message).min(1).max(600),
});
export type ModelCallBody = z.infer<typeof ModelCallBody>;

/** The provider's reply, passed back to the agent unchanged apart from these fields. */
export interface GatewayMessage {
  id: string;
  model: string;
  content: unknown[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
}

export interface GatewayRequest {
  model: string;
  thinking: "low" | "medium" | "high";
  system: string;
  tools: ModelCallBody["tools"];
  messages: ModelCallBody["messages"];
  maxTokens: number;
}

export type GatewayCallResult = { ok: true; message: GatewayMessage } | { ok: false; failure: DraftFailure };

/** The provider call. Tests use a labelled fake. */
export interface GatewayModel {
  readonly family: "anthropic" | "gemini";
  call(request: GatewayRequest, signal?: AbortSignal): Promise<GatewayCallResult>;
}

export interface GatewayDeps extends UsageContext, AiUsageDeps {
  loadTask(orgId: string, taskId: string): Promise<{ id: string; state: TaskState } | null>;
  rateLimit(key: string, windowSeconds: number, limit: number): Promise<boolean>;
}

export interface GatewayReply {
  message: GatewayMessage;
  /** The model Farbaek chose for this step. */
  routedModel: string;
  /** Why the choice differs from what was asked, when it does. */
  note: string | null;
  /** The share of this period's AI usage used after this step. */
  usage: { percent: number | null };
}

/**
 * Room to reserve for one step. Earlier turns are usually read from the
 * prompt cache, so only the newest message is priced as a cache write; the
 * first step writes the whole prompt.
 */
export function stepReserveUnits(model: string, body: Pick<ModelCallBody, "system" | "tools" | "messages">): number {
  const all = approxTokens(JSON.stringify(body.system)) + approxTokens(JSON.stringify(body.tools)) + approxTokens(JSON.stringify(body.messages));
  const fresh = body.messages.length <= 1 ? all : Math.min(all, approxTokens(JSON.stringify(body.messages.at(-1))));
  return Math.max(1, costUnits(model, { inputTokens: 0, cacheWriteTokens: fresh, cacheReadTokens: all - fresh, outputTokens: STEP_OUTPUT_RESERVE }));
}

export function providerUsage(message: GatewayMessage): ProviderUsage {
  return {
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

const MANUAL = "The agent can't continue this run until there's usage left.";

const FAILURES: Record<DraftFailure, { status: number; code: "AI_REFUSED" | "AI_INCOMPLETE" | "AI_BUSY" | "AI_UNAVAILABLE"; message: string }> = {
  REFUSED: { status: 422, code: "AI_REFUSED", message: "The model declined this step." },
  INCOMPLETE: { status: 502, code: "AI_INCOMPLETE", message: "The model's reply was cut off or couldn't be read." },
  PROVIDER_BUSY: { status: 503, code: "AI_BUSY", message: "The model is busy right now. Try again in a minute." },
  PROVIDER_ERROR: { status: 502, code: "AI_UNAVAILABLE", message: "The model couldn't be reached." },
};

/**
 * `remainingUnits` is what's left of a run's cap (ADR 0040). The step goes
 * ahead only when even its worst case fits; otherwise nothing is reserved
 * or charged and the run stops at its cap.
 */
export async function callModel(
  deps: GatewayDeps,
  model: GatewayModel,
  agent: AgentIdentity,
  raw: unknown,
  signal?: AbortSignal,
  options: { remainingUnits?: number } = {},
): Promise<AgentResult<GatewayReply>> {
  const role = requireAgentContributor(agent);
  if (!role.ok) return role;
  const parsed = ModelCallBody.safeParse(raw);
  if (!parsed.success) return agentFail("INVALID_REQUEST", "The model request isn't in the expected shape.");
  const body = parsed.data;
  if (!(await deps.rateLimit(`model:${agent.agentId}`, 60, 30))) return agentFail("RATE_LIMITED", "Too many model steps from this agent in the last minute.");

  const task = await deps.loadTask(agent.orgId, body.taskId);
  if (!task) return agentFail("NOT_FOUND", "That task doesn't exist or isn't in this workspace.");
  if (task.state !== "CONTRACT_APPROVED") return agentFail("INVALID_TRANSITION", "The agent works on a task once its contract is approved and no other proposal is open.");

  const billing = await resolvePlan(deps, agent.orgId);
  if (!billing.ok) return agentFail(billing.code, billing.message);
  const choice = routeModel({ plan: billing.value.plan, family: model.family, step: body.step, effort: body.effort, pinned: body.pinned });

  if (options.remainingUnits !== undefined) {
    const input = approxTokens(JSON.stringify(body.system)) + approxTokens(JSON.stringify(body.tools)) + approxTokens(JSON.stringify(body.messages));
    if (worstStepUnits(choice.model, input, STEP_MAX_OUTPUT_TOKENS) > options.remainingUnits) {
      return agentFail("RUN_CAP_REACHED", "The next step could pass this run's cap, so the run stopped before it. Nothing more was charged.");
    }
  }

  const reserved = await reserveUsage(deps, {
    orgId: agent.orgId,
    userId: agent.userId,
    taskId: task.id,
    operation: "model_gateway",
    units: stepReserveUnits(choice.model, body),
    manual: MANUAL,
    billing: billing.value,
  });
  if (!reserved.ok) return agentFail(reserved.code, reserved.message);
  const { entryId } = reserved.value;

  let outcome: GatewayCallResult;
  try {
    outcome = await model.call({ model: choice.model, thinking: choice.thinking, system: body.system, tools: body.tools, messages: body.messages, maxTokens: STEP_MAX_OUTPUT_TOKENS }, signal);
  } catch {
    outcome = { ok: false, failure: "PROVIDER_ERROR" };
  }
  if (!outcome.ok) {
    await refundUsage(deps, { orgId: agent.orgId, entryId, usage: null, reason: "failed" });
    const f = FAILURES[outcome.failure];
    return { ok: false, status: f.status, code: f.code, message: `${f.message} It didn't count toward your AI usage.` };
  }

  const usage = providerUsage(outcome.message);
  if (outcome.message.stop_reason === "refusal") {
    // Nothing usable came back: the step is given back, and the reply still goes to the agent so it can stop cleanly.
    await refundUsage(deps, { orgId: agent.orgId, entryId, usage, reason: "failed" });
  } else {
    await settleUsage(deps, { orgId: agent.orgId, entryId, usage });
  }
  const percent = await percentAfter(deps, agent.orgId, reserved.value);
  return { ok: true, value: { message: outcome.message, routedModel: choice.model, note: choice.note, usage: { percent } } };
}

/** For tests and the run log: what a step cost in units at its real usage. */
export const stepUnits = (message: GatewayMessage) => unitsFor(providerUsage(message));
