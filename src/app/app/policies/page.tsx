import { ProhibitIcon, ShieldWarningIcon, UserCheckIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { RuleBuilder } from "@/components/policies/rule-builder";
import { RuleList } from "@/components/policies/rule-list";
import { checkFeature } from "@/core/billing/entitlements";
import { shortHash } from "@/core/trust/canonical-json";
import { suggestPreventionRules } from "@/core/trust/incidents";
import { LARGE_CHANGE_FILES, SENSITIVE_WORDS, changePolicyVersion } from "@/core/trust/policy";
import { loadAiAvailability } from "@/server/workspace/usage-summary";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { RULES_MANAGERS_ONLY, RULES_NOT_IN_PLAN } from "@/server/workspace/workspace-rules";

export const metadata: Metadata = { title: "Rules" };

/**
 * Policies (ADR 0082): the built-in change policy, the workspace's own rules
 * on top of it, and the builder that drafts, tests and activates them.
 */
export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ incident?: string; effect?: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  // Opened from an incident's replay (ADR 0083): its suggested rule goes into the builder, to be tested before it can apply.
  const query = await searchParams;
  const incidentNumber = Number(query.incident);
  let suggested: { incident: number; rule: { effect: "block" | "owner_approval" | "person_approval"; paths: string[]; reason: string } } | null = null;
  if (Number.isInteger(incidentNumber) && incidentNumber > 0 && incidentNumber <= 1_000_000) {
    const linked = await ctx.reader.getIncidentChanges(ws.id, incidentNumber).catch(() => null);
    const rules = linked ? suggestPreventionRules(linked.changes, incidentNumber) : [];
    const rule = rules.find((r) => r.effect === query.effect) ?? rules[0];
    if (rule) suggested = { incident: incidentNumber, rule };
  }
  const [versions, paths, projects, ai, builtIn] = await Promise.all([
    ctx.reader.getRuleVersions(ws.id).catch(() => null),
    ctx.reader.listProjectPaths(ws.id).catch(() => ({ files: [], complete: false })),
    ctx.reader.listProjects(ws.id),
    loadAiAvailability(ctx, ws, "policy_draft").catch(() => null),
    changePolicyVersion(),
  ]);
  const active = versions?.find((v) => v.active) ?? null;
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const files = paths.files.map((f) => ({ project: names.get(f.projectId) ?? "Project", path: f.path }));

  const feature = checkFeature(ws.plan, "policy_builder");
  const readOnlyReason = ctx.mode === "demo" ? "The demo workspace is read-only." : !ctx.writes.enabled ? ctx.writes.reason : null;
  const contributor = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const manager = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Rules"
        description="What has to happen before a change goes in. Farbaek's built-in rules always apply. Yours can add to them: they can make a change wait or stop it, but never let more through."
      />

      <Card>
        <h2 className="text-lg font-medium">Built-in rules</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">These always apply, and no workspace rule can loosen them.</p>
        <ul className="mt-4 grid gap-3 text-[0.9375rem] leading-relaxed">
          <li className="flex items-start gap-3">
            <ProhibitIcon size={18} weight="bold" className="mt-1 shrink-0 text-failed" aria-hidden />
            <span>A change that goes outside its approved plan is stopped.</span>
          </li>
          <li className="flex items-start gap-3">
            <ShieldWarningIcon size={18} weight="bold" className="mt-1 shrink-0 text-approval" aria-hidden />
            <div className="grid gap-1.5">
              <span>An owner or admin approves a change that:</span>
              <ul className="grid list-disc gap-1 pl-5 text-ink-2">
                {SENSITIVE_WORDS.map((w) => (
                  <li key={w}>{w}</li>
                ))}
                <li>changes more than {LARGE_CHANGE_FILES} files</li>
              </ul>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <UserCheckIcon size={18} weight="bold" className="mt-1 shrink-0 text-ink-3" aria-hidden />
            <span>
              Anything else needs a person&apos;s approval. If you{" "}
              <Link href="/app/settings#autonomy" className="font-medium text-accent hover:underline">
                let small changes apply on their own in Settings
              </Link>
              , it can go in on its own within the limits you set.
            </span>
          </li>
        </ul>
        <details className="mt-3 text-xs text-ink-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center hover:text-ink [&::-webkit-details-marker]:hidden">Technical details</summary>
          <p>
            This version of the rules: <span className="font-mono">{shortHash(builtIn)}</span>
          </p>
        </details>
      </Card>

      <Card id="rules">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Workspace rules</h2>
          {active && active.rules.length > 0 ? (
            <span className="inline-flex items-center rounded-full border border-accent/40 px-2.5 py-1 text-xs font-medium text-accent">Active</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2">No rules active</span>
          )}
        </div>
        {versions === null ? (
          <p role="alert" className="mt-3 text-sm text-failed">
            The workspace&apos;s rules couldn&apos;t be read. Reload the page to try again. New changes wait until they can be read.
          </p>
        ) : active && active.rules.length > 0 ? (
          <div className="mt-4">
            <RuleList rules={active.rules} />
          </div>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ink-2">Every change follows the built-in rules alone. Add a rule below to protect files that matter to you.</p>
        )}

        {versions !== null ? (
          <div className="mt-8 border-t border-line pt-6">
            <RuleBuilder
              active={active ? { version: active.version, rules: active.rules } : null}
              versions={versions.map((v) => ({
                version: v.version,
                rules: v.rules,
                active: v.active,
                createdAt: v.createdAt,
                byYou: v.createdBy === ctx.user.id,
                tested: v.tested ? { changes: v.tested.changes, stricter: v.tested.stricter, looser: v.tested.looser } : null,
              }))}
              files={files}
              filesComplete={paths.complete}
              suggested={suggested}
              reasons={{
                readOnly: readOnlyReason,
                contributor: contributor ? null : "Viewers can read the rules, but not draft or test them.",
                manager: manager ? null : RULES_MANAGERS_ONLY,
                plan: feature.allowed ? null : feature.code === "FEATURE_NOT_IN_PLAN" ? RULES_NOT_IN_PLAN : feature.message,
                ai: ai?.disabledReason ?? (ai ? null : "AI drafting isn't available right now. Add rules by hand."),
              }}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
