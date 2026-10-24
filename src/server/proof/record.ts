/**
 * Signs a ProofPack right after it's recorded (ADR 0062) and stores the
 * signature beside it. Signing never blocks or undoes the work that made the
 * ProofPack: without a key nothing happens, and a failure is logged and the
 * ProofPack stays unsigned, still checkable by its digest.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/server/observability/log";
import { readSigningKey, signStatement } from "./signing";

export async function signRecordedProofPack(admin: SupabaseClient, digest: string | null | undefined, statement: unknown): Promise<void> {
  if (!digest || !statement) return;
  const key = await readSigningKey();
  if (!key) return;
  try {
    const s = signStatement(statement, key);
    const { error } = await admin.rpc("app_record_proofpack_signature", { p_digest: digest, p_keyid: s.keyid, p_sig: s.sig });
    if (error) log("warn", "proofpack.sign_failed", { digest, error: error.message });
  } catch (e) {
    log("warn", "proofpack.sign_failed", { digest, error: e instanceof Error ? e.message : String(e) });
  }
}
