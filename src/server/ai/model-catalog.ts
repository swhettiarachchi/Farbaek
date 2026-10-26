/**
 * The models Anthropic lists for this server's key (ADR 0090), through the
 * official SDK's Models API. Only ids, names and release dates are read.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ListedModel } from "@/core/ai/model-watch";
import { hasAnthropicKey } from "./config";

/** Every listed model, or null when this server has no Anthropic key. Throws when the API can't be reached. */
export async function listAnthropicModels(client?: Anthropic): Promise<ListedModel[] | null> {
  if (!client && !hasAnthropicKey()) return null;
  const api = client ?? new Anthropic({ maxRetries: 1, timeout: 30_000 });
  const out: ListedModel[] = [];
  for await (const m of api.models.list({ limit: 100 })) {
    out.push({ id: m.id, displayName: m.display_name, createdAt: m.created_at });
    if (out.length >= 500) break;
  }
  return out;
}
