/**
 * Chat answers from OpenAI, streamed over the Responses API (stage 199, ADR 0213), with the same key the second check uses
 * (OPENAI_API_KEY, server-only). Responses aren't stored at OpenAI (store: false). Pictures go as input images and PDFs as input
 * files, both inline; text files as text. The stream's own events carry the text and, at the end, the usage.
 */
import { SseReader } from "@/core/chat/sse";
import { log } from "@/server/observability/log";
import type { ProviderUsage } from "./contract-drafter";
import { TITLE_PROMPT, type ChatInputMessage, type ChatModel, type ChatOutcome } from "./chat-model";

const RESPONSES_URL = "https://api.openai.com/v1/responses";

type Content = { type: "input_text"; text: string } | { type: "input_image"; image_url: string } | { type: "input_file"; filename: string; file_data: string };

function toInput(message: ChatInputMessage): { role: "user" | "assistant"; content: string | Content[] } {
  if (message.role === "assistant") {
    return { role: "assistant", content: message.parts.map((p) => (p.type === "text" ? p.text : "")).join("") || "(no text)" };
  }
  const content: Content[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      if (part.text) content.push({ type: "input_text", text: part.text });
    } else if (part.type === "image") content.push({ type: "input_image", image_url: `data:${part.mime};base64,${part.data}` });
    else if (part.type === "pdf") content.push({ type: "input_file", filename: part.name.slice(0, 200), file_data: `data:application/pdf;base64,${part.data}` });
    else content.push({ type: "input_text", text: `Attached file ${part.name}:\n\n${part.text}` });
  }
  return { role: "user", content: content.length > 0 ? content : [{ type: "input_text", text: "(no text)" }] };
}

interface ResponseUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

function usageOf(model: string, u: ResponseUsage | undefined): ProviderUsage {
  const cached = u?.input_tokens_details?.cached_tokens ?? 0;
  return { model, inputTokens: Math.max(0, (u?.input_tokens ?? 0) - cached), outputTokens: u?.output_tokens ?? 0, cacheWriteTokens: 0, cacheReadTokens: cached };
}

export function createOpenAiChat(options: { key: string; fetcher?: typeof fetch }): ChatModel {
  const fetcher = options.fetcher ?? fetch;
  const headers = { authorization: `Bearer ${options.key}`, "content-type": "application/json" };
  return {
    provider: "openai",
    async stream(request, handlers, signal): Promise<ChatOutcome> {
      let response: Response;
      try {
        response = await fetcher(RESPONSES_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: request.model,
            instructions: request.system,
            input: request.messages.map(toInput),
            max_output_tokens: request.maxOutputTokens,
            store: false,
            stream: true,
          }),
          signal,
        });
      } catch {
        return { ok: false, failure: signal.aborted ? "PROVIDER_ERROR" : "PROVIDER_BUSY", usage: null, aborted: signal.aborted };
      }
      if (response.status === 429 || response.status >= 500) return { ok: false, failure: "PROVIDER_BUSY", usage: null, aborted: false };
      if (!response.ok || !response.body) {
        log("error", "openai.chat_failed", { model: request.model, status: response.status });
        return { ok: false, failure: response.status === 400 ? "INCOMPLETE" : "PROVIDER_ERROR", usage: null, aborted: false };
      }

      const reader = response.body.getReader();
      const sse = new SseReader();
      let usage: ProviderUsage | null = null;
      let outcome: ChatOutcome | null = null;
      let refused = false;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          const events = done ? sse.flush() : sse.push(value);
          for (const e of events) {
            if (!e.data || e.data === "[DONE]") continue;
            let data: { type?: string; delta?: string; response?: { status?: string; usage?: ResponseUsage; incomplete_details?: { reason?: string } } };
            try {
              data = JSON.parse(e.data);
            } catch {
              continue;
            }
            const type = data.type ?? e.event;
            if (type === "response.output_text.delta" && typeof data.delta === "string") {
              handlers.onText(data.delta);
            } else if (type === "response.reasoning_summary_text.delta" && typeof data.delta === "string") {
              handlers.onThinking(data.delta);
            } else if (type === "response.refusal.delta" || type === "response.refusal.done") {
              refused = true;
            } else if (type === "response.completed" || type === "response.incomplete") {
              usage = usageOf(request.model, data.response?.usage);
              const length = type === "response.incomplete" && data.response?.incomplete_details?.reason === "max_output_tokens";
              outcome = { ok: true, stop: refused ? "refusal" : length ? "length" : "end", usage };
            } else if (type === "response.failed" || type === "error") {
              usage = usageOf(request.model, data.response?.usage);
              outcome = { ok: false, failure: "PROVIDER_ERROR", usage, aborted: false };
            }
          }
          if (done) break;
        }
      } catch {
        const aborted = signal.aborted;
        // Stopped part-way: OpenAI reports usage only at the end, so the turn counts what was read and written itself.
        return { ok: false, failure: aborted ? "PROVIDER_ERROR" : "PROVIDER_BUSY", usage, aborted };
      }
      if (!outcome && refused) return { ok: true, stop: "refusal", usage: usage ?? usageOf(request.model, undefined) };
      return outcome ?? { ok: false, failure: "INCOMPLETE", usage, aborted: false };
    },

    async title(request, signal) {
      try {
        const response = await fetcher(RESPONSES_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: request.model,
            instructions: TITLE_PROMPT,
            input: `Question:\n${request.question.slice(0, 2000)}\n\nAnswer:\n${request.answer.slice(0, 1500)}`,
            max_output_tokens: 1_000,
            store: false,
          }),
          signal,
        });
        if (!response.ok) return { title: null, usage: null };
        const reply = (await response.json()) as { output?: { type?: string; content?: { type?: string; text?: string }[] }[]; usage?: ResponseUsage };
        const text = (reply.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? null;
        return { title: text, usage: usageOf(request.model, reply.usage) };
      } catch {
        return { title: null, usage: null };
      }
    },
  };
}
