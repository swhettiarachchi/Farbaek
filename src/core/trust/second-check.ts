/**
 * The second check (ADR 0121, spec §9): on request, a second model reads a
 * proposed change against its approved contract and says whether they agree.
 * It is advisory. Agreement between two models isn't proof: the policy, the
 * exact checks and real tests still decide, and nothing here changes what a
 * change needs to be approved. The model's answer is untrusted: it's checked
 * against a schema, and findings may name only files that were sent.
 */
import { z } from "zod";
import { allowedModels, route, type ModelFamily, type TierOverrides } from "@/core/agent/routing";
import type { EffectivePlan } from "@/core/billing/trial";
import type { ProposedChange, Violation } from "@/core/realityloop/change-proposal";
import type { IntentContract } from "@/core/realityloop/contract";
import { diffLines } from "@/core/realityloop/line-diff";

export const SECOND_CHECK_VERDICTS = ["consistent", "concerns", "unclear"] as const;
export type SecondCheckVerdict = (typeof SECOND_CHECK_VERDICTS)[number];

export const VERDICT_LABELS: Record<SecondCheckVerdict, { title: string; detail: string }> = {
  consistent: { title: "No concerns", detail: "The second model found the change consistent with the contract." },
  concerns: { title: "Concerns", detail: "The second model found something to look at before approving." },
  unclear: { title: "Couldn't tell", detail: "The second model couldn't judge the change from what it was given." },
};

export const FINDING_TOPICS = ["intent", "scope", "invariant", "risk", "tests"] as const;
export const FINDING_SEVERITIES = ["note", "concern", "serious"] as const;

export const TOPIC_LABELS: Record<(typeof FINDING_TOPICS)[number], string> = {
  intent: "Outcome",
  scope: "Scope",
  invariant: "Protected invariant",
  risk: "Risk",
  tests: "Checks",
};

export const SecondCheckOutputSchema = z.object({
  verdict: z.enum(SECOND_CHECK_VERDICTS),
  summary: z.string().min(1).max(600),
  findings: z
    .array(
      z.object({
        topic: z.enum(FINDING_TOPICS),
        severity: z.enum(FINDING_SEVERITIES),
        path: z.string().max(300).nullable(),
        detail: z.string().min(1).max(600),
      }),
    )
    .max(12),
  uncertainty: z.string().max(400),
});
export type SecondCheckOutput = z.infer<typeof SecondCheckOutputSchema>;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : v);

/**
 * A model's answer, with over-long text cut to the limits instead of thrown
 * away, then checked against the schema; null when it isn't an answer at all.
 * Some providers' structured output keeps the shape but not the lengths.
 */
export function parseSecondCheckOutput(raw: unknown): SecondCheckOutput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const findings = Array.isArray(r.findings)
    ? r.findings.slice(0, 12).map((f) => (typeof f === "object" && f !== null ? { ...f, path: clip((f as Record<string, unknown>).path, 300), detail: clip((f as Record<string, unknown>).detail, 600) } : f))
    : r.findings;
  const parsed = SecondCheckOutputSchema.safeParse({ ...r, summary: clip(r.summary, 600), uncertainty: clip(r.uncertainty, 400), findings });
  return parsed.success ? parsed.data : null;
}

/** What's stored and shown: the model's answer after checking, with who checked. */
export interface SecondCheckResult extends SecondCheckOutput {
  model: string;
  /** False when the plan allows only the model that wrote the change: a second read, not an independent one. */
  independent: boolean;
  /** Files whose diffs didn't fit and were sent as a path only. */
  truncated: string[];
}

export interface SecondCheckRequest {
  contract: {
    outcome: string;
    resources: string[];
    allowedOperations: string[];
    forbiddenOperations: string[];
    protectedInvariants: string[];
    acceptanceCriteria: string[];
    requiredChecks: string[];
  };
  plan: { summary: string; steps: string[]; risks: string[]; checks: string[] };
  policy: { outcome: string; findings: { rule: string; outcome: string; detail: string }[] } | null;
  violations: { kind: string; detail: string }[];
  changes: { path: string; kind: "create" | "edit"; reason: string; diff: string | null }[];
}

/** The most diff text sent in one check, across files. */
export const MAX_DIFF_CHARS = 60_000;

function unified(before: string, after: string): string {
  return diffLines(before, after)
    .map((h) => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.removed.map((l) => `-${l}`), ...h.added.map((l) => `+${l}`)].join("\n"))
    .join("\n");
}

/** The change as the second model reads it: the contract, the plan, the policy's decision and each file's diff, within a budget. */
export function secondCheckRequest(
  contract: IntentContract,
  proposal: { plan: SecondCheckRequest["plan"]; changes: ProposedChange[]; violations: Violation[]; policy: SecondCheckRequest["policy"] },
  bases: readonly string[],
): { request: SecondCheckRequest; truncated: string[] } {
  let budget = MAX_DIFF_CHARS;
  const truncated: string[] = [];
  const changes = proposal.changes.map((c, i) => {
    const diff = unified(c.kind === "edit" ? (bases[i] ?? "") : "", c.content);
    if (diff.length > budget) {
      truncated.push(c.path);
      return { path: c.path, kind: c.kind, reason: c.reason, diff: null };
    }
    budget -= diff.length;
    return { path: c.path, kind: c.kind, reason: c.reason, diff };
  });
  return {
    request: {
      contract: {
        outcome: contract.outcome,
        resources: contract.scope.resources,
        allowedOperations: contract.allowedOperations,
        forbiddenOperations: contract.forbiddenOperations,
        protectedInvariants: contract.protectedInvariants.map((c) => c.statement),
        acceptanceCriteria: contract.acceptanceCriteria.map((c) => c.statement),
        requiredChecks: contract.requiredChecks,
      },
      plan: proposal.plan,
      policy: proposal.policy ? { outcome: proposal.policy.outcome, findings: proposal.policy.findings } : null,
      violations: proposal.violations.map((v) => ({ kind: v.kind, detail: v.detail })),
      changes,
    },
    truncated,
  };
}

/** Keeps the answer within what was asked: a finding may name only a file that was sent. */
export function acceptSecondCheck(request: SecondCheckRequest, output: SecondCheckOutput): SecondCheckOutput {
  const sent = new Set(request.changes.map((c) => c.path));
  return { ...output, findings: output.findings.map((f) => ({ ...f, path: f.path && sent.has(f.path) ? f.path : null })) };
}

/**
 * The model that checks: a different one from the model that wrote the change
 * whenever the plan includes another, preferring the one review would use.
 */
export function checkerModel(plan: EffectivePlan, family: ModelFamily, authorModel: string | null, overrides?: TierOverrides): { model: string; independent: boolean } {
  const preferred = route({ plan, family, step: "review", effort: "balanced", overrides }).model;
  if (preferred !== authorModel) return { model: preferred, independent: true };
  const others = allowedModels(plan, family, overrides).filter((m) => m !== authorModel);
  // The strongest other model the plan includes.
  const other = others.at(-1);
  return other ? { model: other, independent: true } : { model: preferred, independent: false };
}

/** Whether a change is the kind the spec says deserves a second look: one the policy sent to an owner or admin. */
export function secondCheckRecommended(policy: { outcome: string; findings: { outcome: string }[] } | null): boolean {
  return Boolean(policy && (policy.outcome === "ESCALATE" || policy.findings.some((f) => f.outcome === "ESCALATE")));
}
