/**
 * The agent's Gemini adapter, through the Gemini API's REST endpoint
 * (models.generateContent with function calling), like the server's
 * adapter in src/server/ai/gemini.ts. The key goes in a header, never the URL.
 *
 * The model's content (thought signatures included) goes back into the
 * history unchanged, as the API requires for multi-turn function calling.
 * Function declarations use the JSON Schema subset the API documents; if the
 * API rejects the JSON Schema field, the request is retried once with the
 * older `parameters` field.
 */
import { toGeminiSchema } from "@/server/ai/gemini";
import { ModelError, type ModelConversation, type ModelStep, type StepStop, type ToolModel } from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const AGENT_GEMINI_MODEL = "gemini-3.8-flash";
const MAX_OUTPUT_TOKENS = 32_000;
const REFUSAL_REASONS = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE"]);

interface Part {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: unknown };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [key: string]: unknown;
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}
interface GeminiResponse {
  candidates?: { content?: Content; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
}

export interface GeminiToolModelOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

export function toGeminiStep(body: GeminiResponse, fallbackModel: string, ids: () => string): { step: ModelStep; content: Content | null } {
  const meta = body.usageMetadata ?? {};
  const usage = { inputTokens: meta.promptTokenCount ?? 0, outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) };
  const model = body.modelVersion ?? fallbackModel;
  if (body.promptFeedback?.blockReason) return { step: { text: "", toolCalls: [], stop: "refusal", usage, model }, content: null };
  const candidate = body.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const toolCalls = parts.filter((p) => p.functionCall).map((p) => ({ id: p.functionCall!.id ?? ids(), name: p.functionCall!.name, input: p.functionCall!.args ?? {} }));
  const text = parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  const reason = candidate?.finishReason ?? "";
  const stop: StepStop = REFUSAL_REASONS.has(reason) ? "refusal" : reason === "MAX_TOKENS" ? "max_tokens" : toolCalls.length > 0 ? "tool_use" : reason === "STOP" ? "end_turn" : "other";
  return { step: { text, toolCalls, stop, usage, model }, content: candidate?.content ? { role: "model", parts } : null };
}

export function createGeminiToolModel(options: GeminiToolModelOptions): ToolModel {
  const doFetch = options.fetch ?? fetch;
  const model = options.model ?? AGENT_GEMINI_MODEL;
  return {
    provider: "gemini",
    model,
    begin({ system, message, tools }): ModelConversation {
      const contents: Content[] = [];
      const names = new Map<string, string>();
      let counter = 0;
      const generated = new Set<string>();
      const ids = () => {
        const id = `farbaek_call_${++counter}`;
        generated.add(id);
        return id;
      };
      const declarations = (field: "parametersJsonSchema" | "parameters") => [
        { functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, [field]: toGeminiSchema(t.inputSchema) })) },
      ];
      let opened = false;

      const call = (field: "parametersJsonSchema" | "parameters", signal?: AbortSignal) =>
        doFetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, tools: declarations(field), generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS } }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000),
        });

      return {
        async send(input, signal) {
          const parts: Part[] = [];
          if (!opened) {
            parts.push({ text: message });
            opened = true;
          }
          for (const r of input.toolResults ?? []) {
            const name = names.get(r.id) ?? "unknown";
            parts.push({ functionResponse: { id: generated.has(r.id) ? undefined : r.id, name, response: r.isError ? { error: r.content } : { result: r.content } } });
          }
          if (input.text) parts.push({ text: input.text });
          if (parts.length > 0) contents.push({ role: "user", parts });

          let res: Response;
          try {
            res = await call("parametersJsonSchema", signal);
            if (res.status === 400) {
              const detail = await res.text();
              if (/parametersJsonSchema|parameters_json_schema/i.test(detail)) res = await call("parameters", signal);
              else throw new ModelError("bad_request", `Gemini returned an error: ${detail.slice(0, 300)}`);
            }
          } catch (error) {
            if (error instanceof ModelError) throw error;
            if (signal?.aborted) throw new ModelError("cancelled", "The run was cancelled.");
            throw new ModelError("network", "Couldn't reach Gemini. Check the internet connection.");
          }
          if (res.status === 401 || res.status === 403) throw new ModelError("auth", "Gemini refused the key. Check the key in Keys.");
          if (res.status === 429 || res.status >= 500) throw new ModelError("busy", "Gemini is busy or rate-limited right now. Try again in a minute.");
          if (!res.ok) throw new ModelError("bad_request", `Gemini returned HTTP ${res.status}.`);
          let body: GeminiResponse;
          try {
            body = (await res.json()) as GeminiResponse;
          } catch {
            throw new ModelError("bad_output", "Gemini's reply couldn't be read.");
          }
          const { step, content } = toGeminiStep(body, model, ids);
          if (content) contents.push(content);
          for (const c of step.toolCalls) names.set(c.id, c.name);
          return step;
        },
      };
    },
  };
}
