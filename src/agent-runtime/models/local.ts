/**
 * Local models (ADR 0134): the agent on a model that runs on the person's
 * own computer, through the OpenAI-compatible chat API that Ollama, LM
 * Studio and llama.cpp's server all speak. The address must be this
 * computer (127.0.0.1, localhost or ::1), so the project's code never leaves
 * it for a model call. Nothing is metered: the model is the person's own.
 *
 * Tool calls a local model returns are untrusted like any other: their
 * arguments are parsed here and checked again by the tool registry.
 */
import { ModelError, type ModelConversation, type ModelStep, type StepStop, type ToolModel } from "./types";

const STEP_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_TOKENS = 8_192;

export type LocalUrlCheck = { ok: true; base: string } | { ok: false; reason: string };

/** Only this computer: http(s) on 127.0.0.1, localhost or ::1, any port, no credentials or query. */
export function checkLocalModelUrl(raw: string): LocalUrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Enter the local server's address, like http://127.0.0.1:11434/v1." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "The address must start with http:// or https://." };
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return { ok: false, reason: "A local model runs on this computer, so the address must be 127.0.0.1, localhost or [::1]." };
  if (url.username || url.password || url.search || url.hash) return { ok: false, reason: "Leave out a user name, password, query or #fragment." };
  return { ok: true, base: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
}

/** The model name a local server knows it by: plain characters only, short enough that "local:<name>" fits the proposal record. */
export const validLocalModelName = (name: string) => /^[A-Za-z0-9._:/-]{1,90}$/.test(name);

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}
interface ChatResponse {
  model?: string;
  choices?: { message?: ChatMessage; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function stopFrom(reason: string | null | undefined, calls: number): StepStop {
  if (reason === "length") return "max_tokens";
  if (reason === "content_filter") return "refusal";
  if (calls > 0 || reason === "tool_calls") return "tool_use";
  return reason === "stop" ? "end_turn" : "other";
}

/** A tool call's arguments, parsed; unreadable ones become an input the registry refuses. */
function parseArguments(raw: string): unknown {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : { _unreadable: String(raw).slice(0, 200) };
  } catch {
    return { _unreadable: String(raw).slice(0, 200) };
  }
}

export function createLocalToolModel(options: { base: string; model: string; fetch?: typeof fetch }): ToolModel {
  const doFetch = options.fetch ?? fetch;
  const checked = checkLocalModelUrl(options.base);
  if (!checked.ok) throw new ModelError("bad_request", checked.reason);
  if (!validLocalModelName(options.model)) throw new ModelError("bad_request", "That model name isn't one a local server uses.");
  const base = checked.base;
  return {
    provider: "local",
    model: `local:${options.model}`,
    begin({ system, message, tools }): ModelConversation {
      const messages: ChatMessage[] = [{ role: "system", content: system }];
      const toolList = tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
      let opened = false;
      return {
        async send(input, signal): Promise<ModelStep> {
          if (!opened) {
            messages.push({ role: "user", content: message });
            opened = true;
          }
          for (const r of input.toolResults ?? []) messages.push({ role: "tool", tool_call_id: r.id, content: r.isError ? `Error: ${r.content}` : r.content });
          if (input.text) messages.push({ role: "user", content: input.text });
          let res: Response;
          try {
            res = await doFetch(`${base}/chat/completions`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ model: options.model, messages, tools: toolList, tool_choice: "auto", max_tokens: MAX_OUTPUT_TOKENS, stream: false }),
              signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(STEP_TIMEOUT_MS)]) : AbortSignal.timeout(STEP_TIMEOUT_MS),
              redirect: "error",
            });
          } catch (e) {
            if (signal?.aborted) throw new ModelError("cancelled", "The run was cancelled.");
            throw new ModelError("network", `Farbaek couldn't reach the local model at ${base}. Check that the local server (for example Ollama) is running.${e instanceof Error && e.name === "TimeoutError" ? " It took longer than 10 minutes to answer." : ""}`);
          }
          const body = (await res.json().catch(() => null)) as ChatResponse | null;
          if (!res.ok) {
            const said = (body as { error?: { message?: string } | string } | null)?.error;
            const detail = typeof said === "string" ? said : said?.message;
            throw new ModelError(res.status === 404 ? "bad_request" : res.status >= 500 ? "busy" : "bad_request", `The local model refused the step (${res.status})${detail ? `: ${String(detail).slice(0, 200)}` : ""}.${res.status === 404 ? ` Check that ${options.model} is downloaded, for example with ollama pull.` : ""}`);
          }
          const choice = body?.choices?.[0];
          const reply = choice?.message;
          if (!reply) throw new ModelError("bad_output", "The local model answered without a message.");
          const calls = (reply.tool_calls ?? []).filter((c) => c?.function?.name);
          messages.push({ role: "assistant", content: reply.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
          return {
            text: reply.content ?? "",
            toolCalls: calls.map((c, i) => ({ id: c.id || `local_call_${messages.length}_${i}`, name: c.function.name, input: parseArguments(c.function.arguments) })),
            stop: stopFrom(choice?.finish_reason, calls.length),
            usage: { inputTokens: body?.usage?.prompt_tokens ?? 0, outputTokens: body?.usage?.completion_tokens ?? 0 },
            model: `local:${body?.model ?? options.model}`,
          };
        },
      };
    },
  };
}

/** The models a local server offers, from its OpenAI-compatible model list. */
export async function listLocalModels(base: string, doFetch: typeof fetch = fetch): Promise<{ ok: true; models: string[] } | { ok: false; reason: string }> {
  const checked = checkLocalModelUrl(base);
  if (!checked.ok) return checked;
  try {
    const res = await doFetch(`${checked.base}/models`, { signal: AbortSignal.timeout(5_000), redirect: "error" });
    if (!res.ok) return { ok: false, reason: `The local server answered ${res.status}. Check the address; Ollama's is http://127.0.0.1:11434/v1.` };
    const body = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
    const models = (body?.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string" && validLocalModelName(id));
    return { ok: true, models };
  } catch {
    return { ok: false, reason: `Nothing answered at ${checked.base}. Start the local server (for example Ollama) and try again.` };
  }
}
