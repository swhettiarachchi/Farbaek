"use client";

import { CheckCircleIcon, CheckIcon, ClockCountdownIcon, DesktopIcon, ProhibitIcon, ScalesIcon, ShieldWarningIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { applyProposalAction, discardProposalAction } from "@/app/app/actions";
import { Notice } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { relativeLabel, useNow } from "@/components/ui/use-now";
import { DROP_LABELS } from "@/core/realityloop/change-proposal";
import type { IntentContract } from "@/core/realityloop/contract";
import { lensForChange, lensSummary } from "@/core/realityloop/intent-lens";
import { withSuggestion, type StoredLensSuggestion } from "@/core/realityloop/lens-suggestion";
import { FileLensRows, IntentLensSummary } from "./intent-lens";
import { approvalWindow } from "@/core/trust/approval-wallet";
import { WhenNear } from "@/components/ui/when-near";
import { shortHash } from "@/core/trust/canonical-json";
import { modelName } from "@/core/billing/rate-card";
import { OUTCOME_LABELS } from "@/core/trust/policy";
import type { PolicyOutcome } from "@/core/billing/usage";
import type { ProposalRecord } from "@/server/workspace/types";

const diffLoading = (
  <div className="flex h-40 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
    Loading the changes…
  </div>
);

// The editor loads only for diffs near the screen (WhenNear), so a task page doesn't start CodeMirror before anyone scrolls to it.
const Surface = dynamic(() => import("@/components/files/codemirror"), { ssr: false, loading: () => diffLoading });

const fileHref = (projectId: string, path: string) => `/app/projects/${projectId}/files?path=${encodeURIComponent(path)}`;
const short = (hex: string) => `sha256:${hex.slice(0, 6)}…${hex.slice(-4)}`;

// Status is a word (ADR 0180): a waiting state carries no glyph, and an icon says only how it ended.
const STATUS: Record<"pending" | "blocked" | "applied" | "discarded" | "expired" | "outOfDate", { label: string; Icon: typeof CheckCircleIcon | null; cls: string }> = {
  pending: { label: "Waiting for your approval", Icon: null, cls: "border-approval/30 bg-approval/[0.06] text-approval" },
  blocked: { label: "Outside the plan", Icon: ProhibitIcon, cls: "border-failed/30 bg-failed/[0.05] text-failed" },
  applied: { label: "Applied", Icon: CheckCircleIcon, cls: "border-verified/30 bg-verified/[0.05] text-verified" },
  discarded: { label: "Discarded", Icon: XCircleIcon, cls: "border-line bg-surface-raised text-ink-2" },
  // Past its approval window (ADR 0042): it can only be discarded.
  expired: { label: "Expired", Icon: ProhibitIcon, cls: "border-line bg-surface-raised text-ink-2" },
  // A file it was made from has changed since (ADR 0178): it can only be discarded.
  outOfDate: { label: "Out of date", Icon: ProhibitIcon, cls: "border-line bg-surface-raised text-ink-2" },
} as const;

/**
 * Review a change proposal: the plan, the contract check, and each file as
 * a diff with accept and reject per chunk. Approving applies exactly what is
 * shown after your decisions.
 */
export function ProposalReview({
  projectId,
  proposal,
  bases,
  outOfDate = [],
  invariants,
  disabledReason,
  executionReason,
  checksOnApply = false,
  canApproveEscalated,
  approvalWithheldReason = null,
  appliedNote,
  agentName = null,
  contract = null,
  serverNow,
  lensSuggestion = null,
  lensAiReason = null,
}: {
  projectId: string;
  proposal: ProposalRecord;
  /** Content of each edited file at the revision the proposal was made against. */
  bases: Record<string, string>;
  /** The files that have changed since this was made, which the database would refuse it for (ADR 0178). */
  outOfDate?: string[];
  /** Contract invariants written in words, which no automatic check covers. */
  invariants: string[];
  disabledReason: string | null;
  /** Why checks can't run here (Review Only), or null when a sandbox is connected. */
  executionReason: string | null;
  /** Applying starts the change's checks (ADR 0059): the plan has some, or Farbaek has a fallback for this project. */
  checksOnApply?: boolean;
  /** True when the viewer is an owner or admin. Escalated changes need one; the server enforces it too. */
  canApproveEscalated: boolean;
  /** Set when an owner or admin turned approving off for this member (ADR 0087). Discarding stays. */
  approvalWithheldReason?: string | null;
  /** The paired Farbaek Agent's name when an agent made the proposal (it may have been revoked since). */
  agentName?: string | null;
  /** Replaces the "waiting for checks" note on an applied change, once it's being undone or was. */
  appliedNote?: string;
  /** The contract the change was made under, for the Intent Diff Lens (ADR 0041). */
  contract?: IntentContract | null;
  /** The server's render time, so the approval window reads the same before and after hydration. */
  serverNow: number;
  /** The AI mapping asked for on this proposal, if any (ADR 0044). */
  lensSuggestion?: StoredLensSuggestion | null;
  /** Why asking for an AI mapping isn't possible here, or null when it is. */
  lensAiReason?: string | null;
}) {
  const router = useRouter();
  const [finals, setFinals] = useState<Record<string, string>>(() => Object.fromEntries(proposal.changes.map((c) => [c.path, c.content])));
  const [failure, setFailure] = useState<{ from: "approve" | "discard"; message: string } | null>(null);
  const [pending, start] = useTransition();
  const now = useNow(serverNow);
  const win = approvalWindow(proposal.createdAt, proposal.expiresAt, new Date(now));
  const expired = proposal.status === "pending" && win.state === "expired";
  const open = proposal.status === "pending" && !expired;
  const stale = open && outOfDate.length > 0;
  const fileCount = proposal.changes.length;
  const status = STATUS[expired ? "expired" : stale ? "outOfDate" : proposal.status];
  // Once the page says it's out of date, a refused approval has nothing to add.
  const error = failure && !(stale && failure.from === "approve") ? failure.message : null;
  const closesIn = relativeLabel(Date.parse(proposal.expiresAt) - now);

  const escalated = proposal.policy?.outcome === "ESCALATE";
  const approveReason =
    disabledReason ??
    approvalWithheldReason ??
    (escalated && !canApproveEscalated ? "A rule says an owner or admin has to approve this change." : null);
  const kept = proposal.changes.filter((c) => (c.kind === "create" ? finals[c.path] !== "" : finals[c.path] !== bases[c.path]));
  // Each hunk read against the contract: exact flags first, then a pointer to the clause it shares words with.
  // The AI mapping, when someone asked for it, sits beside the exact checks and never changes them (ADR 0044).
  const lenses = useMemo(
    () => (contract ? withSuggestion(contract, proposal.changes.map((c) => lensForChange(contract, c, bases[c.path] ?? "")), lensSuggestion?.mappings ?? null) : null),
    [contract, proposal.changes, bases, lensSuggestion],
  );

  function approve() {
    setFailure(null);
    start(async () => {
      const r = await applyProposalAction({
        proposalId: proposal.id,
        reviewedSha256: proposal.sha256,
        files: proposal.changes.map((c) => ({ path: c.path, content: finals[c.path] ?? c.content })),
      });
      // A refusal can mean a file moved on while the page was open, so it reads the files again either way.
      if (r.status === "error") setFailure({ from: "approve", message: r.message });
      router.refresh();
    });
  }

  function discard() {
    setFailure(null);
    start(async () => {
      const r = await discardProposalAction({ proposalId: proposal.id });
      if (r.status === "error") return setFailure({ from: "discard", message: r.message });
      router.refresh();
    });
  }

  const errorLine = error ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-failed">
      <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
      {error}
    </p>
  ) : null;

  return (
    <div className={`flex flex-col gap-6 ${open ? "[&_:is(a,button,summary)]:scroll-mb-40" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${status.cls}`}>
          {status.Icon ? <status.Icon size={16} weight="bold" aria-hidden /> : null} {status.label}
        </span>
        {proposal.agentId ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm text-ink-2">
            <DesktopIcon size={16} aria-hidden /> Suggested by Farbaek Agent{agentName ? ` (${agentName})` : ""}
          </span>
        ) : null}
        {/* ADR 0134: written by a model on the agent's own computer, not Farbaek's AI. */}
        {proposal.model?.startsWith("local:") ? <span className="text-xs text-ink-3">A model on the agent&apos;s computer</span> : null}
        <details className="text-xs text-ink-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center hover:text-ink [&::-webkit-details-marker]:hidden">Technical details</summary>
          <span className="flex flex-wrap gap-x-3 pb-1">
            <span>Plan version {proposal.contractVersion}</span>
            <span className="font-mono" title={`sha256:${proposal.sha256}`}>
              {shortHash(proposal.sha256, 8, 6)}
            </span>
            {proposal.model ? <span>{modelName(proposal.model)}</span> : null}
            {proposal.policy ? (
              <span>
                Rules <span className="font-mono">{short(proposal.policy.version)}</span>
              </span>
            ) : null}
            {proposal.appliedSha256 ? (
              <span>
                Approved content <span className="font-mono">{short(proposal.appliedSha256)}</span>
              </span>
            ) : null}
          </span>
        </details>
      </div>

      {open && !stale ? (
        <p className={`-mt-3 flex items-start gap-2 text-sm ${win.state === "closing" ? "text-approval" : "text-ink-2"}`}>
          <ClockCountdownIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            You can approve this until <LocalTime iso={proposal.expiresAt} /> (closes {closesIn}). After that it can only be discarded.
          </span>
        </p>
      ) : expired ? (
        <p className="-mt-3 flex items-start gap-2 text-sm text-ink-2">
          <ProhibitIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            This change ran out of time {closesIn}, so it can&apos;t be approved. Discard it and ask the agent to try again with the files as they are now.
          </span>
        </p>
      ) : null}

      <div className="grid gap-3">
        <p className="text-[0.9375rem] leading-relaxed">{proposal.plan.summary}</p>
        {proposal.plan.steps.length ? (
          <ol className="grid list-decimal gap-1 pl-5 text-sm text-ink-2">
            {proposal.plan.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : null}
        {proposal.plan.risks.length ? (
          <div>
            <p className="text-sm font-medium">Risks the agent flagged</p>
            <ul className="mt-1 grid list-disc gap-1 pl-5 text-sm text-ink-2">
              {proposal.plan.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 rounded-sm border border-line bg-surface-raised/50 p-4 text-sm">
        <p className="font-medium">Does it fit the plan?</p>
        {proposal.violations.length ? (
          <>
            <ul className="grid gap-1.5">
              {proposal.violations.map((v, i) => (
                <li key={i} className="flex items-start gap-2 text-failed">
                  <ProhibitIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {v.detail}
                </li>
              ))}
            </ul>
            <p className="text-ink-2">Change the plan to allow this, or discard this change and try again with different files or notes.</p>
          </>
        ) : (
          <p className="flex items-start gap-2 text-verified">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> Inside the plan: what it may do, its limits and the files in scope all pass.
          </p>
        )}
        {invariants.length ? (
          <div className="text-ink-2">
            <p>These are written in words, so no automatic check covers them. Check them yourself in the changes below:</p>
            <ul className="mt-1 grid list-disc gap-0.5 pl-5">
              {invariants.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {proposal.policy ? (
        <div className="grid gap-2 rounded-sm border border-line bg-surface-raised/50 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-medium">
              {escalated ? <ShieldWarningIcon size={16} className="text-approval" aria-hidden /> : <ScalesIcon size={16} className="text-ink-3" aria-hidden />}
              Rules: {OUTCOME_LABELS[proposal.policy.outcome as PolicyOutcome] ?? proposal.policy.outcome}
            </p>
            {proposal.policy.workspaceRules ? (
              <Link href="/app/policies" className="-my-3 inline-flex min-h-11 items-center text-xs font-medium text-accent hover:underline">
                Your workspace&apos;s rules, version {proposal.policy.workspaceRules.version}
              </Link>
            ) : null}
          </div>
          {proposal.policy.findings.filter((f) => f.rule !== "contract").length ? (
            <ul className="grid gap-1 text-ink-2">
              {proposal.policy.findings
                .filter((f) => f.rule !== "contract")
                .map((f, i) => (
                  <li key={i}>{f.detail}</li>
                ))}
            </ul>
          ) : (
            <p className="text-ink-2">Every change needs a person&apos;s approval here. Nothing sensitive was found.</p>
          )}
        </div>
      ) : null}

      {proposal.policy?.shadow ? (
        // Shadow mode (ADR 0075): a simulated decision, never acted on, marked as one.
        <div className="grid gap-1.5 rounded-sm border border-dashed border-simulated/45 bg-simulated/[0.03] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-medium">
              Practice: level 2 {proposal.policy.shadow.outcome === "ALLOW_WITHIN_LIMITS" ? "would have applied this on its own" : "would have waited for a person"}
            </p>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-simulated/40 px-2.5 text-xs font-medium text-simulated">
              Sample
            </span>
          </div>
          <p className="text-ink-2">{proposal.policy.shadow.detail} Nothing applied on its own: this workspace is in practice mode, so the change waits for your review as usual.</p>
        </div>
      ) : null}

      {proposal.dropped.length ? (
        <details className="rounded-sm border border-line px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {proposal.dropped.length} proposed {proposal.dropped.length === 1 ? "change was" : "changes were"} left out
          </summary>
          <ul className="mt-2 grid gap-1">
            {proposal.dropped.map((d, i) => (
              <li key={i}>
                <span className="font-mono text-[0.8125rem] break-all">{d.path}</span>: <span className="text-ink-2">{DROP_LABELS[d.reason] ?? d.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {proposal.status === "applied" ? (
        <div className="grid gap-3">
          <p className="text-sm">
            {proposal.policy?.outcome === "ALLOW_WITHIN_LIMITS"
              ? "Applied on its own, within the limits you set for this workspace"
              : "Applied after your approval"}
            .
          </p>
          <ul className="grid gap-1">
            {proposal.changes.map((c) => (
              <li key={c.path}>
                <Link href={fileHref(projectId, c.path)} className="font-mono text-[0.8125rem] break-all text-accent hover:underline">
                  {c.path}
                </Link>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 rounded-sm border border-approval/30 bg-approval/[0.06] px-4 py-3 text-sm">
            <WarningCircleIcon size={18} className="mt-px shrink-0 text-approval" aria-hidden />
            <span>
              {appliedNote ?? `Not verified. ${executionReason ?? "The checks haven't run yet."} It stays here until its checks run and pass.`}
            </span>
          </p>
        </div>
      ) : proposal.status === "discarded" ? null : (
        <div className="grid gap-5">
          {lenses ? (
            <IntentLensSummary
              summary={lensSummary(lenses)}
              ai={{
                proposalId: proposal.id,
                open,
                suggestion: lensSuggestion ? { model: lensSuggestion.model, createdAt: lensSuggestion.createdAt } : null,
                disabledReason: disabledReason ?? lensAiReason,
              }}
            />
          ) : null}
          {proposal.changes.map((c, i) => (
            <section key={c.path} className="grid min-w-0 gap-2" aria-label={`Changes to ${c.path}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 font-mono text-[0.8125rem] font-medium break-all">{c.path}</p>
                <p className="text-xs text-ink-3">{c.kind === "create" ? "New file" : "Edited file"}</p>
              </div>
              {c.reason ? <p className="text-xs text-ink-2">{c.reason}</p> : null}
              {lenses?.[i] ? <FileLensRows lens={lenses[i]!} /> : null}
              <WhenNear placeholder={diffLoading}>
                <Surface
                  path={c.path}
                  value={c.content}
                  original={bases[c.path] ?? ""}
                  controls={open && !disabledReason}
                  label={`Changes to ${c.path}`}
                  onChange={(doc) => setFinals((prev) => ({ ...prev, [c.path]: doc }))}
                />
              </WhenNear>
            </section>
          ))}
          {proposal.plan.checks.length ? (
            <p className="text-xs text-ink-3">
              Checks the agent suggests: {proposal.plan.checks.map((c, i) => <code key={i} className="mr-2 font-mono">{c}</code>)}
              {executionReason ? "They can't run here yet." : null}
            </p>
          ) : null}
        </div>
      )}

      {/* While the button follows the reader, a failure shows beside it, wherever they've got to. */}
      {open ? null : errorLine}

      {proposal.status === "pending" || proposal.status === "blocked" ? (
        <>
          {stale ? (
            <div className="border-t border-line pt-5">
              <Notice tone="warning">
                <span className="font-medium">This change can&apos;t be applied.</span>{" "}
                {outOfDate.length < fileCount
                  ? `${outOfDate.length} of its ${fileCount} files changed after it was made.`
                  : outOfDate.length === 1
                    ? "Its file changed after it was made."
                    : outOfDate.length === 2
                      ? "Both of its files changed after it was made."
                      : `All ${outOfDate.length} of its files changed after it was made.`}{" "}
                Discard it, then ask the agent for a new one, made from the files as they are now.
              </Notice>
            </div>
          ) : open ? (
            <p className="border-t border-line pt-5 text-sm">
              You are approving{" "}
              <span className="font-medium">
                {kept.length} of {proposal.changes.length} {proposal.changes.length === 1 ? "file" : "files"}
              </span>{" "}
              exactly as shown above, after your accept and reject decisions.
              {executionReason || !checksOnApply ? null : " Once it's applied, its checks start on their own."}
            </p>
          ) : null}
          {open ? (
            <div className="sticky bottom-[var(--tab-bar)] z-20 -mx-5 flex flex-col gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur-xl sm:-mx-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-6">
              {errorLine}
              {stale ? (
                <>
                  <button type="button" onClick={discard} disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "md", "w-full justify-center sm:w-auto")}>
                    {pending ? "Discarding…" : "Discard this change"}
                  </button>
                  {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
                </>
              ) : (
                <>
                  <button type="button" onClick={approve} disabled={pending || kept.length === 0 || Boolean(approveReason)} className={buttonClasses("primary", "md", "w-full justify-center sm:w-auto")}>
                    <CheckIcon size={16} weight="bold" aria-hidden />
                    {pending ? "Applying…" : `Approve and apply ${kept.length} ${kept.length === 1 ? "file" : "files"}`}
                  </button>
                  {/* A grey button says why, wherever the reader has got to. */}
                  {approveReason ? <p className="text-sm text-ink-3">{approveReason}</p> : null}
                  {kept.length === 0 ? <p className="text-sm text-ink-3">Every part is rejected. Discard the change instead.</p> : null}
                </>
              )}
            </div>
          ) : null}
          {stale ? null : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={discard} disabled={pending || Boolean(disabledReason)} className={buttonClasses(open ? "ghost" : "secondary", "sm")}>
                Discard this change
              </button>
              {expired ? <p className="text-sm text-ink-3">Expired {closesIn}: it can only be discarded.</p> : null}
              {!open && disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
