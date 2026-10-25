"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RulesTestSummary } from "@/core/trust/rules-test";
import { resolveAiProvider } from "@/server/ai/config";
import { createAnthropicPolicyDrafter } from "@/server/ai/policy-drafter";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { readChangeHistory } from "@/server/trust/history";
import { limitsFrom } from "@/server/workspace/autonomy";
import { loadAppContext, type AppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { activateRules, draftRules, readActiveRules, testDraftRules, type RulesDeps } from "@/server/workspace/workspace-rules";

export type DraftRulesState =
  | { status: "done"; rules: { paths: string[]; effect: "block" | "owner_approval" | "person_approval"; reason: string }[]; ambiguities: string[]; unsupported: string[]; dropped: string[] }
  | { status: "error"; message: string };
export type TestRulesState = { status: "done"; summary: RulesTestSummary } | { status: "error"; message: string };
export type ActivateRulesState = { status: "done"; version: number } | { status: "error"; message: string };

const MAX_DOCUMENT = 64 * 1024;

/** The writer's deps plus what the rules need, all as the signed-in person except activation, which the database checks again. */
async function rulesDeps(ctx: AppContext) {
  if (!ctx.current) return { error: "Create a workspace first." } as const;
  if (!ctx.writes.enabled) return { error: ctx.writes.reason } as const;
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: "The server isn't configured for this yet." } as const;
  const rules: RulesDeps = {
    activeRules: (orgId) => readActiveRules(user, orgId),
    history: (orgId, days) => readChangeHistory(user, orgId, days),
    autonomy: async (orgId) => limitsFrom(await ctx.reader.getAutonomy(orgId)),
    sandboxConnected: () => currentExecutionMode().mode === "sandboxed",
    projectPaths: async (orgId) => (await ctx.reader.listProjectPaths(orgId)).files.map((f) => f.path),
    async activateRules(i) {
      const { data, error } = await admin.rpc("app_activate_workspace_rules", {
        p_org: i.orgId,
        p_actor: i.actor,
        p_document: i.document,
        p_compiled: i.compiled,
        p_sha256: i.sha256,
        p_tested: i.tested,
      });
      if (error) return { ok: false, error: error.message };
      const version = z.number().int().safeParse(data);
      return version.success ? { ok: true, value: version.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
    },
  };
  return { deps: { ...createSupabaseWriteDeps(user, admin, ctx.user.id), ...rules }, orgId: ctx.current.id } as const;
}

const tooBig = (document: unknown) => JSON.stringify(document ?? null).length > MAX_DOCUMENT;

/** Drafts rules from the person's words with Claude (ADR 0082). Metered; refunded if it fails. The draft only fills the builder. */
export async function draftRulesAction(input: { request: string }): Promise<DraftRulesState> {
  const parsed = z.object({ request: z.string().max(2_000) }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Describe the rule in a sentence or two." };
  const ctx = await loadAppContext();
  if (!ctx) return { status: "error", message: "Sign in again to draft rules." };
  const w = await rulesDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error ?? "This can't run here." };
  const ai = resolveAiProvider();
  if (ai.provider !== "anthropic") return { status: "error", message: ai.provider ? "Drafting rules uses Claude, and this server uses another provider. Add rules by hand instead." : ai.reason };
  const r = await draftRules(w.deps, { family: "anthropic", create: (s) => createAnthropicPolicyDrafter({ model: s.model, effort: s.thinking }) }, { orgId: w.orgId, userId: ctx.user.id, request: parsed.data.request });
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "done", rules: r.value.rules, ambiguities: r.value.ambiguities, unsupported: r.value.unsupported, dropped: r.value.dropped };
}

/** Runs a draft over the last 90 days of the workspace's changes. Predicts; changes nothing. */
export async function testRulesAction(input: { document: unknown }): Promise<TestRulesState> {
  if (tooBig(input?.document)) return { status: "error", message: "These rules are too large to test." };
  const ctx = await loadAppContext();
  if (!ctx) return { status: "error", message: "Sign in again to test rules." };
  const w = await rulesDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error ?? "This can't run here." };
  const r = await testDraftRules(w.deps, { orgId: w.orgId, userId: ctx.user.id, document: input.document });
  return r.ok ? { status: "done", summary: r.value } : { status: "error", message: r.message };
}

/** Activates the exact set the person reviewed and tested as the workspace's next version. */
export async function activateRulesAction(input: { document: unknown; sha256: string }): Promise<ActivateRulesState> {
  const sha = z.string().regex(/^[0-9a-f]{64}$/).safeParse(input?.sha256);
  if (!sha.success || tooBig(input?.document)) return { status: "error", message: "Reload the page and test the rules again." };
  const ctx = await loadAppContext();
  if (!ctx) return { status: "error", message: "Sign in again to activate rules." };
  const w = await rulesDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error ?? "This can't run here." };
  const r = await activateRules(w.deps, { orgId: w.orgId, userId: ctx.user.id, document: input.document, sha256: sha.data });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/app/policies");
  return { status: "done", version: r.value.version };
}
