/**
 * The agent's model through Farbaek's model gateway (ADR 0021): no API key on
 * this computer. Each step sends the conversation to Farbaek, which picks
 * the model for the workspace's plan and the chosen effort, meters the step
 * from the workspace's usage and returns Claude's reply unchanged.
 *
 * The history is kept here in Claude's message format, and the model's
 * content (thinking included) goes back into it exactly as it came.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { FarbaekApiError, type ModelStepReply, type ModelStepRequest } from "../farbaek-client";
import { toModelStep } from "./anthropic";
import { ModelError, type ModelConversation, type ToolModel } from "./types";

export interface GatewayClient {
  modelStep(request: ModelStepRequest, signal?: AbortSignal): Promise<ModelStepReply>;
}

export interface FarbaekToolModelOptions {
  client: GatewayClient;
  taskId: string;
  effort: ModelStepRequest["effort"];
  /** Told after each step: the share of the workspace's usage used, and any routing note. */
  onUsage?(info: { percent: number | null; model: string; note: string | null }): void;
}

function toModelError(error: unknown, signal?: AbortSignal): ModelError {
  if (signal?.aborted) return new ModelError("cancelled", "The run was cancelled.");
  if (!(error instanceof FarbaekApiError)) return new ModelError("bad_output", "The model's reply couldn't be read.");
  if (error.status === 401) return new ModelError("auth", "This app isn't paired anymore. Pair it again from Agents in Farbaek.");
  if (error.status === 402) return new ModelError("usage", error.message);
  if (error.status === 429 || error.status === 503) return new ModelError("busy", error.message);
  if (error.status === 0) return new ModelError("network", error.message);
  return new ModelError("bad_request", error.message);
}

export function createFarbaekToolModel(options: FarbaekToolModelOptions): ToolModel {
  return {
    provider: "farbaek",
    model: "auto",
    begin({ system, message, tools }): ModelConversation {
      const messages: Anthropic.MessageParam[] = [];
      const toolParams = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
      let opened = false;
      return {
        async send(input, signal) {
          const content: Anthropic.ContentBlockParam[] = [];
          if (!opened) {
            content.push({ type: "text", text: message });
            opened = true;
          }
          for (const r of input.toolResults ?? []) content.push({ type: "tool_result", tool_use_id: r.id, content: r.content, is_error: r.isError });
          if (input.text) content.push({ type: "text", text: input.text });
          if (content.length > 0) messages.push({ role: "user", content });

          let reply: ModelStepReply;
          try {
            reply = await options.client.modelStep({ taskId: options.taskId, effort: options.effort, step: "write", system, tools: toolParams, messages }, signal);
          } catch (error) {
            throw toModelError(error, signal);
          }
          const final = reply.message as unknown as Anthropic.Message;
          messages.push({ role: "assistant", content: final.content });
          options.onUsage?.({ percent: reply.usage.percent, model: reply.routedModel, note: reply.note });
          return toModelStep(final);
        },
      };
    },
  };
}
