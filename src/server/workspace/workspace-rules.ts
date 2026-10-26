/**
 * Workspace rules and the policy builder (ADR 0082).
 *
 * - Reading: the active version decides every new change, so a rule set
 *   that can't be read stops the change instead of being skipped.
 * - Drafting: a model turns a person's words into rules. It's metered like
 *   any AI action and refunded if it fails; its output only prefills the
 *   builder.
 * - Testing: the draft and today's rules are run over the last 90 days of
 *   the workspace's changes, read as the person.
 * - Activating: an owner or admin activates the exact set they reviewed,
 *   bound by its hash. The server tests it again and stores the result with
 *   the new version.
 *
 * Rules only ever make a change stricter, so they keep applying if the plan
 * lapses; changing them needs the plan, turning them all off doesn't.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { routeModel } from "@/server/ai/routing";
import { checkFeature } from "@/core/billing/entitlements";
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { resolveEffectivePlan } from "@/core/billing/trial";
import type { AutonomyLimits } from "@/core/trust/policy";
import type { ReplayChange } from "@/core/trust/replay";
import { acceptDraft, foldersOf, MAX_REQUEST, type AcceptedDraft } from "@/core/trust/rule-draft";
import { testRules, type RulesTestSummary } from "@/core/trust/rules-test";
import { compileRuleSet, parseRuleSet, ruleSetHash, type ActiveRules, type CompiledRule, type WorkspaceRule, type WorkspaceRuleSet } from "@/core/trust/workspace-rules";
import { POLICY_DRAFTER_SYSTEM_PROMPT, policyDraftMessage, type PolicyDrafter } from "@/server/ai/policy-drafter";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ModelSource } from "./ai-usage";
import { MANAGER_ROLES } from "./types";
import { codeFromDatabaseError, fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export const MANUAL_RULES = "Add rules by hand: choose the files and what a change to them needs.";
export const RULES_NOT_IN_PLAN = "The policy builder is included in Pro and up, and in the trial.";
export const RULES_MANAGERS_ONLY = "Only an owner or admin can change the workspace's rules.";
export const RULES_TEST_DAYS = 90;

// ---------------------------------------------------------------- reading

const ActiveRow = z.object({ version: z.number().int(), sha256: z.string(), document: z.unknown() });

function ruleSetFrom(document: unknown): WorkspaceRuleSet {
  const parsed = parseRuleSet(document);
  // Every stored set was checked when it was activated. One that no longer reads must stop changes, not quietly stop applying.
  if (!parsed.ok) throw new Error("A stored workspace rule set couldn't be read.");
  return parsed.set;
}

/** The version that decides new changes, or null when the workspace never set rules. Throws when it can't be read. */
export async function readActiveRules(client: SupabaseClient, orgId: string): Promise<ActiveRules | null> {
  const { data, error } = await client.from("workspace_rule_versions").select("version, sha256, document").eq("org_id", orgId).eq("active", true).maybeSingle();
  if (error) throw new Error(`Couldn't read the workspace's rules: ${error.message}`);
  if (!data) return null;
  const row = ActiveRow.parse(data);
  return { version: row.version, sha256: row.sha256, rules: ruleSetFrom(row.document).rules };
}

const Count = z.record(z.enum(["stopped", "owner", "person", "own"]), z.number().int());
const TestedSchema = z.object({
  sha256: z.string(),
  days: z.number().int(),
  changes: z.number().int(),
  before: Count,
  after: Count,
  stricter: z.number().int(),
  looser: z.number().int(),
  changed: z.array(
    z.object({
      proposalId: z.string(),
      taskId: z.string(),
      createdAt: z.string(),
      from: z.enum(["stopped", "owner", "person", "own"]),
      to: z.enum(["stopped", "owner", "person", "own"]),
      paths: z.array(z.string()),
      rules: z.array(z.string()),
    }),
  ),
  testedAt: z.string(),
});

export interface RuleVersionView {
  version: number;
  sha256: string;
  rules: WorkspaceRule[];
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  tested: RulesTestSummary | null;
}

const VersionRow = z.object({
  version: z.number().int(),
  sha256: z.string(),
  document: z.unknown(),
  active: z.boolean(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  tested: z.unknown().nullable(),
});

/** The newest versions first, with what each was tested against. */
export async function readRuleVersions(client: SupabaseClient, orgId: string, limit = 20): Promise<RuleVersionView[]> {
  const { data, error } = await client
    .from("workspace_rule_versions")
    .select("version, sha256, document, active, created_by, created_at, tested")
    .eq("org_id", orgId)
    .order("version", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't read the workspace's rules: ${error.message}`);
  return z
    .array(VersionRow)
    .parse(data ?? [])
    .map((r) => {
      const tested = TestedSchema.safeParse(r.tested);
      return {
        version: r.version,
        sha256: r.sha256,
        rules: ruleSetFrom(r.document).rules,
        active: r.active,
        createdBy: r.created_by,
        createdAt: r.created_at,
        tested: tested.success ? (tested.data as RulesTestSummary) : null,
      };
    });
}

// ---------------------------------------------------------------- use cases

export interface RulesDeps {
  activeRules(orgId: string): Promise<ActiveRules | null>;
  /** Past changes' shapes for the last days, read as the person. */
  history(orgId: string, days: number): Promise<ReplayChange[]>;
  /** Today's autonomy limits, or null at level 0. */
  autonomy(orgId: string): Promise<AutonomyLimits | null>;
  sandboxConnected(): boolean;
  /** Current file paths across the workspace's projects. */
  projectPaths(orgId: string): Promise<string[]>;
  activateRules(input: { orgId: string; actor: string; document: WorkspaceRuleSet; compiled: CompiledRule[]; sha256: string; tested: RulesTestSummary }): Promise<RpcResult<number>>;
}

async function requirePlan(deps: WriteDeps, orgId: string): Promise<WriteResult<null>> {
  const snapshot = await deps.billing(orgId);
  const feature = checkFeature(snapshot ? resolveEffectivePlan(snapshot, deps.now()) : null, "policy_builder");
  if (!feature.allowed) return fail(feature.code, feature.code === "FEATURE_NOT_IN_PLAN" ? RULES_NOT_IN_PLAN : feature.message);
  return { ok: true, value: null };
}

function parsedOrFail(document: unknown): WriteResult<WorkspaceRuleSet> {
  const parsed = parseRuleSet(document);
  if (!parsed.ok) return fail("INVALID_RULES", parsed.errors[0]?.message ?? undefined);
  return { ok: true, value: parsed.set };
}

const DRAFT_FAILURES = {
  REFUSED: "The model declined to draft these rules, so it wasn't counted. Add them by hand instead.",
  INCOMPLETE: "The draft came back incomplete, so it wasn't counted. Try again, or add rules by hand.",
  PROVIDER_BUSY: "The AI provider is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The draft didn't finish, so it wasn't counted. Try again, or add rules by hand.",
} as const;

/** Drafts rules from a person's words. Untrusted output, checked here, that only prefills the builder. */
export async function draftRules(
  deps: WriteDeps & AiUsageDeps & RulesDeps,
  source: ModelSource<PolicyDrafter>,
  input: { orgId: string; userId: string; request: string },
): Promise<WriteResult<AcceptedDraft & { model: string }>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const request = input.request.trim().replace(/\s+/g, " ");
  if (request.length < 5 || request.length > MAX_REQUEST) return fail("INVALID_RULES", `Describe the rule in a sentence or two, under ${MAX_REQUEST} characters.`);
  const plan = await requirePlan(deps, input.orgId);
  if (!plan.ok) return plan;

  const billing = await resolvePlan(deps, input.orgId);
  if (!billing.ok) return billing;
  const drafter = source.create(routeModel({ plan: billing.value.plan, family: source.family, step: "review", effort: "balanced" }));
  const message = { request, folders: foldersOf(await deps.projectPaths(input.orgId)) };
  const units = reserveUnits(drafter.model, approxTokens(POLICY_DRAFTER_SYSTEM_PROMPT) + approxTokens(policyDraftMessage(message)) + 300, drafter.maxOutputTokens);
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: null, operation: "policy_draft", units, manual: MANUAL_RULES, billing: billing.value });
  if (!reserved.ok) return reserved;

  let outcome;
  try {
    outcome = await drafter.draft(message);
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) {
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail(outcome.failure === "PROVIDER_BUSY" ? "AI_BUSY" : outcome.failure === "REFUSED" ? "AI_REFUSED" : "AI_INCOMPLETE", DRAFT_FAILURES[outcome.failure]);
  }
  await settleUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage });
  return { ok: true, value: { ...acceptDraft(outcome.output), model: outcome.usage.model } };
}

async function runTest(deps: WriteDeps & RulesDeps, orgId: string, set: WorkspaceRuleSet, sha256: string): Promise<RulesTestSummary> {
  const [history, current, autonomy] = await Promise.all([deps.history(orgId, RULES_TEST_DAYS), deps.activeRules(orgId), deps.autonomy(orgId)]);
  return testRules(history, {
    current,
    draft: { version: (current?.version ?? 0) + 1, sha256, rules: set.rules },
    autonomy,
    sandboxConnected: deps.sandboxConnected(),
    days: RULES_TEST_DAYS,
    now: deps.now(),
  });
}

/** Runs a draft over the last 90 days of real changes. Predicts; changes nothing. */
export async function testDraftRules(deps: WriteDeps & RulesDeps, input: { orgId: string; userId: string; document: unknown }): Promise<WriteResult<RulesTestSummary>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const set = parsedOrFail(input.document);
  if (!set.ok) return set;
  if (set.value.rules.length > 0) {
    const plan = await requirePlan(deps, input.orgId);
    if (!plan.ok) return plan;
  }
  try {
    return { ok: true, value: await runTest(deps, input.orgId, set.value, await ruleSetHash(set.value)) };
  } catch {
    return fail("UNKNOWN", "The past changes couldn't be read, so nothing was tested. Try again.");
  }
}

/** Activates the exact set the person reviewed and tested, as the workspace's next version. */
export async function activateRules(deps: WriteDeps & RulesDeps, input: { orgId: string; userId: string; document: unknown; sha256: string }): Promise<WriteResult<{ version: number }>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!MANAGER_ROLES.includes(role)) return fail("FORBIDDEN", RULES_MANAGERS_ONLY);
  const set = parsedOrFail(input.document);
  if (!set.ok) return set;
  // Turning every rule off is always allowed; anything else needs the plan.
  if (set.value.rules.length > 0) {
    const plan = await requirePlan(deps, input.orgId);
    if (!plan.ok) return plan;
  }
  const sha256 = await ruleSetHash(set.value);
  if (sha256 !== input.sha256) return fail("RULES_NOT_TESTED");

  let tested: RulesTestSummary;
  try {
    tested = await runTest(deps, input.orgId, set.value, sha256);
  } catch {
    return fail("UNKNOWN", "The past changes couldn't be read, so the rules weren't tested or activated. Try again.");
  }
  const r = await deps.activateRules({ orgId: input.orgId, actor: input.userId, document: set.value, compiled: compileRuleSet(set.value), sha256, tested });
  return r.ok ? { ok: true, value: { version: r.value } } : fail(codeFromDatabaseError(r.error));
}
