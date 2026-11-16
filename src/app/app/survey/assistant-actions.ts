"use server";

/**
 * What became of a drafting assistant turn (stage 195): applied (with the SHA-256 of the change), discarded, or taken back. Only the
 * surveyor who gave the instruction can say, and the database checks it again. The record is a record: the plan itself is saved as an
 * ordinary version, so a failure here never stops the work.
 */
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

const Input = z.object({ turnId: z.uuid(), outcome: z.enum(["applied", "discarded", "reverted"]), appliedSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable() });

export async function decideAssistTurnAction(input: { turnId: string; outcome: "applied" | "discarded" | "reverted"; appliedSha256: string | null }): Promise<{ ok: boolean }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await loadAppContext();
  if (!ctx || ctx.mode !== "live" || !ctx.current || !ctx.writes.enabled || !ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { ok: false };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false };
  const { error } = await admin.rpc("app_survey_decide_assistant_turn", { p_org: ctx.current.id, p_actor: ctx.user.id, p_turn: parsed.data.turnId, p_outcome: parsed.data.outcome, p_applied_sha256: parsed.data.appliedSha256 });
  return { ok: !error };
}

const LocalInput = z.object({
  projectId: z.uuid(),
  words: z.string().trim().min(1).max(2_000),
  lang: z.enum(["en", "si", "ta"]),
  inputMethod: z.enum(["voice", "typed"]),
  operations: z.array(z.object({ kind: z.string().max(40) }).passthrough()).min(1).max(30),
  appliedSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Records a change the local rules read from the surveyor's words and the surveyor applied (stage 195), so the project's record has
 * every change the assistant made, not only the model's: the turn (model "local"), then applied with its SHA-256. A record only.
 */
export async function recordLocalAssistTurnAction(input: z.input<typeof LocalInput>): Promise<{ ok: boolean; turnId: string | null }> {
  const parsed = LocalInput.safeParse(input);
  if (!parsed.success) return { ok: false, turnId: null };
  const ctx = await loadAppContext();
  if (!ctx || ctx.mode !== "live" || !ctx.current || !ctx.writes.enabled || !ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { ok: false, turnId: null };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, turnId: null };
  const limit = await admin.rpc("app_rate_limit", { p_key: `survey-assist-local:${ctx.user.id}`, p_window_seconds: 60, p_limit: 60 });
  if (limit.error || limit.data !== true) return { ok: false, turnId: null };
  // Quotes shortened, inside the table's size check, as for the model's turns.
  const ops = parsed.data.operations.map((o) => (typeof o.quote === "string" ? { ...o, quote: o.quote.slice(0, 200) } : o));
  const operations = new TextEncoder().encode(JSON.stringify(ops)).length <= 60_000 ? ops : ops.map((o) => ({ kind: o.kind, shortened: true }));
  const recorded = await admin.rpc("app_survey_record_assistant_turn", {
    p_org: ctx.current.id,
    p_actor: ctx.user.id,
    p_project: parsed.data.projectId,
    p_lang: parsed.data.lang,
    p_input: parsed.data.inputMethod,
    p_words: parsed.data.words,
    p_reply: "",
    p_operations: operations,
    p_dropped: [],
    p_outcome: "suggested",
    p_model: "local",
  });
  if (recorded.error || typeof recorded.data !== "string") return { ok: false, turnId: null };
  const decided = await admin.rpc("app_survey_decide_assistant_turn", { p_org: ctx.current.id, p_actor: ctx.user.id, p_turn: recorded.data, p_outcome: "applied", p_applied_sha256: parsed.data.appliedSha256 });
  return { ok: !decided.error, turnId: recorded.data };
}
