/**
 * The canary runner's dependencies on this server (ADR 0090): the Anthropic
 * proposer per model and the v57 function that records how a run ended.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnthropicChangeProposer } from "./anthropic";
import type { CanaryRunDeps } from "./model-canary-runner";

export function canaryRunDeps(admin: SupabaseClient): CanaryRunDeps {
  return {
    proposer: (model) => createAnthropicChangeProposer({ model, effort: "medium" }),
    async finish(i) {
      const { error } = await admin.rpc(
        "app_finish_canary",
        i.status === "finished"
          ? { p_id: i.id, p_status: "finished", p_report: i.report, p_report_sha256: i.sha256, p_failure: null }
          : { p_id: i.id, p_status: "failed", p_report: null, p_report_sha256: null, p_failure: i.failure },
      );
      if (error) throw new Error(`app_finish_canary: ${error.message}`);
    },
    now: () => new Date(),
    clock: () => Date.now(),
  };
}
