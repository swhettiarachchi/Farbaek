/**
 * Chat answers from Claude, streamed (stage 199, ADR 0213). Adaptive thinking at the effort the person asked for, with summaries so
 * the screen can say it's thinking; automatic prompt caching, so a long conversation is mostly read from the cache on each turn;
 * refusal fallbacks where the model has them (ADR 0009). Pictures and PDFs go as content blocks, text files as documents. Usage
 * is read from the stream as it goes, so a stopped answer is still metered for what it spent.
 */
import Anthropic from "@anthropic-ai/sdk";
import { log } from "@/server/observability/log";
import type { ProviderUsage } from "./contract-drafter";
import { TITLE_PROMPT, type ChatInputMessage, type ChatModel, type ChatOutcome } from "./chat-model";

function fallbackParams(model: string): { betas: ["server-side-fallback-2026-07-01"]; fallbacks: "default" } | Record<string, never> {
  return model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

type Block = Anthropic.Beta.BetaContentBlockParam;

function toBlocks(message: ChatInputMessage): Block[] {
  const blocks: Block[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      if (part.text) blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image") {
      blocks.push({ type: "image", source: { type: "base64", media_type: part.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: part.data } });
    } else if (part.type === "pdf") {
      blocks.push({ type: "document", title: part.name.slice(0, 200), source: { type: "base64", media_type: "application/pdf", data: part.data } });
    } else {
      blocks.push({ type: "document", title: part.name.slice(0, 200), source: { type: "text", media_type: "text/plain", data: part.text } });
    }
  }
  return blocks.length > 0 ? blocks : [{ type: "text", text: "(no text)" }];
}

interface StreamUsage {
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const toUsage = (u: StreamUsage): ProviderUsage => ({ model: u.model, inputTokens: u.input, outputTokens: u.output, cacheWriteTokens: u.cacheWrite, cacheReadTokens: u.cacheRead });

function failureOf(error: unknown): "PROVIDER_BUSY" | "PROVIDER_ERROR" | "INCOMPLETE" {
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIConnectionError) return "PROVIDER_BUSY";
  if (error instanceof Anthropic.BadRequestError) return "INCOMPLETE";
  return "PROVIDER_ERROR";
}

function logFailure(model: string, error: unknown) {
  const api = error instanceof Anthropic.APIError ? error : null;
  log("error", "anthropic.chat_failed", { model, status: api?.status ?? null, requestId: api?.requestID ?? null, message: api ? api.message.slice(0, 300) : error instanceof Error ? error.name : "unknown" });
}

export function createAnthropicChat(client: Anthropic = new Anthropic({ maxRetries: 1, timeout: 600_000 })): ChatModel {
  return {
    provider: "anthropic",
    async stream(request, handlers, signal): Promise<ChatOutcome> {
      const usage: StreamUsage = { model: request.model, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
      let started = false;
      try {
        const stream = client.beta.messages.stream(
          {
            model: request.model,
            max_tokens: request.maxOutputTokens,
            ...fallbackParams(request.model),
            thinking: { type: "adaptive", display: "summarized" },
            output_config: { effort: request.thinking },
            cache_control: { type: "ephemeral" },
            system: [{ type: "text", text: request.system }],
            messages: request.messages.map((m) => ({ role: m.role, content: toBlocks(m) })),
          },
          { signal },
        );
        for await (const event of stream) {
          started = true;
          if (event.type === "message_start") {
            usage.model = event.message.model;
            usage.input = event.message.usage.input_tokens;
            usage.cacheWrite = event.message.usage.cache_creation_input_tokens ?? 0;
            usage.cacheRead = event.message.usage.cache_read_input_tokens ?? 0;
          } else if (event.type === "content_block_start") {
            if (event.content_block.type === "thinking") handlers.onThinking("");
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") handlers.onText(event.delta.text);
            else if (event.delta.type === "thinking_delta") handlers.onThinking(event.delta.thinking);
          } else if (event.type === "message_delta") {
            usage.output = event.usage.output_tokens;
          }
        }
        const message = await stream.finalMessage();
        const final: ProviderUsage = {
          model: message.model,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        };
        const stop = message.stop_reason === "refusal" ? "refusal" : message.stop_reason === "max_tokens" ? "length" : "end";
        return { ok: true, stop, usage: final };
      } catch (error) {
        const aborted = signal.aborted || error instanceof Anthropic.APIUserAbortError;
        if (!aborted) logFailure(request.model, error);
        return { ok: false, failure: aborted ? "PROVIDER_ERROR" : failureOf(error), usage: started ? toUsage(usage) : null, aborted };
      }
    },

    async title(request, signal) {
      try {
        const message = await client.messages.create(
          {
            model: request.model,
            max_tokens: 400,
            output_config: { effort: "low" },
            system: TITLE_PROMPT,
            messages: [{ role: "user", content: `Question:\n${request.question.slice(0, 2000)}\n\nAnswer:\n${request.answer.slice(0, 1500)}` }],
          },
          { signal },
        );
        const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? null;
        return {
          title: message.stop_reason === "refusal" ? null : text,
          usage: { model: message.model, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0, cacheReadTokens: message.usage.cache_read_input_tokens ?? 0 },
        };
      } catch {
        return { title: null, usage: null };
      }
    },
  };
}
