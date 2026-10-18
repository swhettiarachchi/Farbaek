/**
 * The agent's Claude adapter, through the official Anthropic SDK, with the
 * person's own key. Farbaek runs the tool loop itself (loop.ts) so every
 * call passes the registry and the permission engine before anything runs.
 *
 * - Adaptive thinking; the assistant's content, thinking included, goes back
 *   into the history unchanged.
 * - Streamed, so long replies don't hit request timeouts. Tools use eager
 *   input streaming; the SDK may then return a partial input instead of
 *   failing, which is why the loop validates every input with Zod and never
 *   runs a call from a reply that stopped at max_tokens or with a refusal.
 *   If the SDK can't parse a streamed input at all, the request is sent
 *   again (twice at most).
 * - Automatic prompt caching keeps the growing conversation cheap.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ModelError, type ModelConversation, type ModelStep, type StepStop, type ToolModel } from "./types";

export const AGENT_CLAUDE_MODEL = "claude-opus-5-5";
const MAX_OUTPUT_TOKENS = 32_000;
const MAX_REISSUES = 2;

const STOPS: Record<string, StepStop> = {
  tool_use: "tool_use",
  end_turn: "end_turn",
  stop_sequence: "end_turn",
  max_tokens: "max_tokens",
  refusal: "refusal",
  model_context_window_exceeded: "context_full",
};

export function toModelStep(message: Anthropic.Message): ModelStep {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const toolCalls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input }));
  const u = message.usage;
  return {
    text,
    toolCalls,
    stop: STOPS[message.stop_reason ?? ""] ?? "other",
    usage: { inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), outputTokens: u.output_tokens },
    model: message.model,
  };
}

function toModelError(error: unknown): ModelError | null {
  if (error instanceof Anthropic.APIUserAbortError) return new ModelError("cancelled", "The run was cancelled.");
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ModelError("auth", "Claude refused the key. Check the key in Keys, or its permissions in the Claude Console.");
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ModelError("busy", "Claude is busy or rate-limited right now. Try again in a minute.");
  }
  if (error instanceof Anthropic.APIConnectionError) return new ModelError("network", "Couldn't reach Claude. Check the internet connection.");
  if (error instanceof Anthropic.APIError) return new ModelError("bad_request", `Claude returned an error: ${error.message.slice(0, 300)}`);
  return null;
}

export interface AnthropicToolModelOptions {
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  client?: Anthropic;
}

export function createAnthropicToolModel(options: AnthropicToolModelOptions): ToolModel {
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 2, timeout: 600_000 });
  const model = options.model ?? AGENT_CLAUDE_MODEL;
  return {
    provider: "anthropic",
    model,
    begin({ system, message, tools }): ModelConversation {
      const messages: Anthropic.MessageParam[] = [];
      const toolParams: Anthropic.Tool[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        eager_input_streaming: true,
      }));
      let opened = false;
      return {
        async send(input, signal) {
          const content: Anthropic.ContentBlockParam[] = [];
          if (!opened) {
            content.push({ type: "text", text: message });
            opened = true;
          }
          // Tool results come first in the user turn; a note may follow them.
          for (const r of input.toolResults ?? []) content.push({ type: "tool_result", tool_use_id: r.id, content: r.content, is_error: r.isError });
          if (input.text) content.push({ type: "text", text: input.text });
          if (content.length > 0) messages.push({ role: "user", content });

          for (let attempt = 0; ; attempt += 1) {
            try {
              const stream = client.messages.stream(
                {
                  model,
                  max_tokens: MAX_OUTPUT_TOKENS,
                  thinking: { type: "adaptive" },
                  output_config: { effort: options.effort ?? "medium" },
                  cache_control: { type: "ephemeral" },
                  system,
                  tools: toolParams,
                  messages,
                },
                { signal },
              );
              const final = await stream.finalMessage();
              messages.push({ role: "assistant", content: final.content });
              return toModelStep(final);
            } catch (error) {
              const mapped = toModelError(error);
              if (mapped) throw mapped;
              // A streamed tool input that couldn't be parsed at all: there's no tool_use id to answer, so ask again.
              if (error instanceof Anthropic.AnthropicError && attempt < MAX_REISSUES) continue;
              throw new ModelError("bad_output", "Claude's reply couldn't be read.");
            }
          }
        },
      };
    },
  };
}
