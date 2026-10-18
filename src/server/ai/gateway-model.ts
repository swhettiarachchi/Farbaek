/**
 * The model gateway's Claude call, with Farbaek's own key (ADR 0021).
 *
 * - Streamed, so long steps don't hit request timeouts; the final message
 *   goes back to the agent with its content unchanged, thinking included.
 * - Adaptive thinking at the routed effort, and automatic prompt caching, so
 *   the growing conversation is mostly read from the cache.
 * - A short server note is placed before the agent's own instructions. It
 *   doesn't change from call to call, so it caches with them.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { GatewayCallResult, GatewayModel, GatewayRequest } from "@/server/agent/gateway";

export const GATEWAY_SYSTEM_NOTE =
  "You are running inside Farbaek, a platform where software changes are agreed in an intent contract before they run and a person reviews every change. Work only on the task you were given.";

export function createAnthropicGatewayModel(client: Anthropic = new Anthropic({ maxRetries: 1, timeout: 600_000 })): GatewayModel {
  return {
    family: "anthropic",
    async call(request: GatewayRequest, signal?: AbortSignal): Promise<GatewayCallResult> {
      try {
        const stream = client.messages.stream(
          {
            model: request.model,
            max_tokens: request.maxTokens,
            thinking: { type: "adaptive" },
            output_config: { effort: request.thinking },
            cache_control: { type: "ephemeral" },
            system: [
              { type: "text", text: GATEWAY_SYSTEM_NOTE },
              { type: "text", text: request.system },
            ],
            tools: request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Tool.InputSchema })),
            // Validated against the gateway's schema: text, tool use, tool results and the model's own thinking blocks only.
            messages: request.messages as Anthropic.MessageParam[],
          },
          { signal },
        );
        const m = await stream.finalMessage();
        return { ok: true, message: { id: m.id, model: m.model, content: m.content, stop_reason: m.stop_reason, usage: m.usage } };
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionTimeoutError) {
          return { ok: false, failure: "PROVIDER_BUSY" };
        }
        if (error instanceof Anthropic.BadRequestError) return { ok: false, failure: "INCOMPLETE" };
        return { ok: false, failure: "PROVIDER_ERROR" };
      }
    },
  };
}
