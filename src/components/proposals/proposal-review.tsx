"use client";

import { CheckCircleIcon, ClockCountdownIcon, DesktopIcon, FingerprintIcon, FlaskIcon, HourglassMediumIcon, ProhibitIcon, ScalesIcon, ShieldWarningIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { applyProposalAction, discardProposalAction } from "@/app/app/actions";
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
import { OUTCOME_LABELS } from "@/core/trust/policy";
import type { PolicyOutcome } from "@/core/billing/usage";
import type { ProposalRecord } from "@/server/workspace/types";

const diffLoading = (
  <div className="flex h-40 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
    Loading the diff…
  </div>
);

// The editor loads only for diffs near the screen (WhenNear), so a task page doesn't start CodeMirror before anyone scrolls to it.
const Surface = dynamic(() => import("@/components/files/codemirror"), { ssr: false, loading: () => diffLoading });

const fileHref = (projectId: string, path: string) => `/app/projects/${projectId}/files?path=${encodeURIComponent(path)}`;
const short = (hex: string) => `sha256:${hex.slice(0, 6)}…${hex.slice(-4)}`;

const STATUS = {
  pending: { label: "Waiting for your approval", Icon: HourglassMediumIcon, cls: "border-approval/30 bg-approval/[0.06] text-approval" },
  blocked: { label: "Blocked by the contract", Icon: ProhibitIcon, cls: "border-failed/30 bg-failed/[0.05] text-failed" },
  applied: { label: "Applied", Icon: CheckCircleIcon, cls: "border-verified/30 bg-verified/[0.05] text-verified" },
  discarded: { label: "Discarded", Icon: XCircleIcon, cls: "border-line bg-surface-raised text-ink-2" },
  // Past its approval window (ADR 0042): it can only be discarded.
  expired: { label: "Expired", Icon: ProhibitIcon, cls: "border-line bg-surface-raised text-ink-2" },
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
  invariants,
  disabledReason,
  executionReason,
  checksOnApply = false,
  canApproveEscalated,
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
  /** Contract invariants written in words, which no automatic check covers. */
  invariants: string[];
  disabledReason: string | null;
  /** Why checks can't run here (Review Only), or null when a sandbox is connected. */
  executionReason: string | null;
  /** Applying starts the change's checks (ADR 0059): the plan has some, or Farbaek has a fallback for this project. */
  checksOnApply?: boolean;
  /** True when the viewer is an owner or admin. Escalated changes need one; the server enforces it too. */
  canApproveEscalated: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const now = useNow(serverNow);
  const win = approvalWindow(proposal.createdAt, proposal.expiresAt, new Date(now));
  const expired = proposal.status === "pending" && win.state === "expired";
  const open = proposal.status === "pending" && !expired;
  const status = STATUS[expired ? "expired" : proposal.status];
  const closesIn = relativeLabel(Date.parse(proposal.expiresAt) - now);

  const escalated = proposal.policy?.outcome === "ESCALATE";
  const approveReason =
    disabledReason ??
    (escalated && !canApproveEscalated ? "The policy escalated this change, so an owner or admin has to approve it." : null);
  const kept = proposal.changes.filter((c) => (c.kind === "create" ? finals[c.path] !== "" : finals[c.path] !== bases[c.path]));
  // Each hunk read against the contract: exact flags first, then a pointer to the clause it shares words with.
  // The AI mapping, when someone asked for it, sits beside the exact checks and never changes them (ADR 0044).
  const lenses = useMemo(
    () => (contract ? withSuggestion(contract, proposal.changes.map((c) => lensForChange(contract, c, bases[c.path] ?? "")), lensSuggestion?.mappings ?? null) : null),
    [contract, proposal.changes, bases, lensSuggestion],
  );

  function approve() {
    setError(null);
    start(async () => {
      const r = await applyProposalAction({
        proposalId: proposal.id,
        reviewedSha256: proposal.sha256,
        files: proposal.changes.map((c) => ({ path: c.path, content: finals[c.path] ?? c.content })),
      });
      if (r.status === "error") return setError(r.message);
      router.refresh();
    });
  }

  function discard() {
    setError(null);
    start(async () => {
      const r = await discardProposalAction({ proposalId: proposal.id });
      if (r.status === "error") return setError(r.message);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${status.cls}`}>
          <status.Icon size={16} weight="bold" aria-hidden /> {status.label}
        </span>
        {proposal.agentId ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm text-ink-2">
            <DesktopIcon size={16} aria-hidden /> Proposed by Farbaek Agent{agentName ? ` (${agentName})` : ""}
          </span>
        ) : null}
        <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
          <span>Contract version {proposal.contractVersion}</span>
          <span className="font-mono" title={`sha256:${proposal.sha256}`}>
            {shortHash(proposal.sha256, 8, 6)}
          </span>
          {proposal.model ? <span className="font-mono">{proposal.model}</span> : null}
        </span>
      </div>

      {open ? (
        <p className={`-mt-3 flex items-start gap-2 text-sm ${win.state === "closing" ? "text-approval" : "text-ink-2"}`}>
          <ClockCountdownIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Approve by <LocalTime iso={proposal.expiresAt} /> · closes {closesIn}. After that it can only be discarded.
          </span>
        </p>
      ) : expired ? (
        <p className="-mt-3 flex items-start gap-2 text-sm text-ink-2">
          <ProhibitIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            This proposal expired {closesIn}, so it can&apos;t be approved. Discard it and ask the agent to propose again against the files as they are now.
          </span>
        </p>
      ) : null}

      <div className="grid gap-3">
        <p className="text-[15px] leading-relaxed">{proposal.plan.summary}</p>
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
        <p className="font-medium">Contract check</p>
        {proposal.violations.length ? (
          <>
            <ul className="grid gap-1.5">
              {proposal.violations.map((v, i) => (
                <li key={i} className="flex items-start gap-2 text-failed">
                  <ProhibitIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {v.detail}
                </li>
              ))}
            </ul>
            <p className="text-ink-2">Revise the contract to allow this, or discard the proposal and try again with different files or notes.</p>
          </>
        ) : (
          <p className="flex items-start gap-2 text-verified">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> Inside the contract: allowed operations, the record limit and the paths in scope all pass.
          </p>
        )}
        {invariants.length ? (
          <div className="text-ink-2">
            <p>These invariants are written in words, so no automatic check covers them. Check them yourself in the diffs:</p>
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
              Policy: {OUTCOME_LABELS[proposal.policy.outcome as PolicyOutcome] ?? proposal.policy.outcome}
            </p>
            <span className="text-xs text-ink-3">
              Rules <span className="font-mono">{short(proposal.policy.version)}</span>
              {proposal.policy.workspaceRules ? (
                <>
                  {" "}
                  and{" "}
                  <Link href="/app/policies" className="font-medium text-accent hover:underline">
                    workspace rules v{proposal.policy.workspaceRules.version}
                  </Link>
                </>
              ) : null}
            </span>
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
            <p className="text-ink-2">Autonomy level 0: every change needs a person&apos;s approval. Nothing sensitive was found.</p>
          )}
        </div>
      ) : null}

      {proposal.policy?.shadow ? (
        // Shadow mode (ADR 0075): a simulated decision, never acted on, marked as one.
        <div className="grid gap-1.5 rounded-sm border border-dashed border-simulated/45 bg-simulated/[0.03] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-medium">
              <FlaskIcon size={16} className="text-simulated" aria-hidden />
              Rehearsal: level 2 {proposal.policy.shadow.outcome === "ALLOW_WITHIN_LIMITS" ? "would have applied this on its own" : "would have waited for a person"}
            </p>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-simulated/40 px-2.5 text-xs font-medium text-simulated">
              <FlaskIcon size={14} weight="bold" aria-hidden /> Simulated
            </span>
          </div>
          <p className="text-ink-2">{proposal.policy.shadow.detail} Nothing applied on its own: this workspace is rehearsing level 2, so the change waits for your review as usual.</p>
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
                <span className="font-mono text-[13px] break-all">{d.path}</span>: <span className="text-ink-2">{DROP_LABELS[d.reason] ?? d.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {proposal.status === "applied" ? (
        <div className="grid gap-3">
          <p className="text-sm">
            {proposal.policy?.outcome === "ALLOW_WITHIN_LIMITS"
              ? "Applied on its own as new file revisions, within this workspace's autonomy limits (level 2)"
              : "Applied as new file revisions after your approval"}
            . {proposal.appliedSha256 ? <span className="text-xs text-ink-3">Approved content <span className="font-mono">{short(proposal.appliedSha256)}</span></span> : null}
          </p>
          <ul className="grid gap-1">
            {proposal.changes.map((c) => (
              <li key={c.path}>
                <Link href={fileHref(projectId, c.path)} className="font-mono text-[13px] break-all text-accent hover:underline">
                  {c.path}
                </Link>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 rounded-sm border border-approval/30 bg-approval/[0.06] px-4 py-3 text-sm">
            <WarningCircleIcon size={18} className="mt-px shrink-0 text-approval" aria-hidden />
            <span>
              {appliedNote ?? `Not verified. ${executionReason ?? "The contract's checks haven't run yet."} The task waits in verification until its checks run and pass.`}
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
                <p className="min-w-0 font-mono text-[13px] font-medium break-all">{c.path}</p>
                <p className="text-xs text-ink-3">{c.kind === "create" ? "New file" : `Edit of revision ${c.baseRevision}`}</p>
              </div>
              {c.reason ? <p className="text-xs text-ink-2">{c.reason}</p> : null}
              {lenses?.[i] ? <FileLensRows lens={lenses[i]!} /> : null}
              <WhenNear placeholder={diffLoading}>
                <Surface
                  path={c.path}
                  value={c.content}
                  original={bases[c.path] ?? ""}
                  controls={open && !disabledReason}
                  label={`Proposed changes to ${c.path}`}
                  onChange={(doc) => setFinals((prev) => ({ ...prev, [c.path]: doc }))}
                />
              </WhenNear>
            </section>
          ))}
          {proposal.plan.checks.length ? (
            <p className="text-xs text-ink-3">
              Checks the agent suggests: {proposal.plan.checks.map((c, i) => <code key={i} className="mr-2 font-mono">{c}</code>)}
              {executionReason ? "They can't run here yet: Review Only." : null}
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {proposal.status === "pending" || proposal.status === "blocked" ? (
        <div className="grid gap-3 border-t border-line pt-5">
          {open ? (
            <p className="text-sm">
              You are approving{" "}
              <span className="font-medium">
                {kept.length} of {proposal.changes.length} {proposal.changes.length === 1 ? "file" : "files"}
              </span>{" "}
              exactly as shown above, after your accept and reject decisions.
              {executionReason || !checksOnApply ? null : " Once it's applied, its checks start on their own in a fresh sandbox."}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {proposal.status === "pending" ? (
              <button type="button" onClick={approve} disabled={pending || expired || kept.length === 0 || Boolean(approveReason)} className={buttonClasses(expired ? "secondary" : "primary", "sm")}>
                <FingerprintIcon size={16} weight="bold" aria-hidden />
                {pending ? "Applying…" : `Approve and apply ${kept.length} ${kept.length === 1 ? "file" : "files"}`}
              </button>
            ) : null}
            <button type="button" onClick={discard} disabled={pending || Boolean(disabledReason)} className={buttonClasses(expired ? "primary" : open ? "ghost" : "secondary", "sm")}>
              Discard proposal
            </button>
            {expired ? <p className="text-sm text-ink-3">Expired {closesIn}: it can only be discarded.</p> : null}
            {/* Once expired, only the reason Discard is unavailable still matters. */}
            {(expired ? disabledReason : approveReason) ? <p className="text-sm text-ink-3">{expired ? disabledReason : approveReason}</p> : null}
            {open && kept.length === 0 ? <p className="text-sm text-ink-3">Every change is rejected. Discard the proposal instead.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
