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
