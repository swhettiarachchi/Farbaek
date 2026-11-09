"use client";

import { ArrowRightIcon, ShieldWarningIcon, XCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Fragment } from "react";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { relativeLabel, useNow } from "@/components/ui/use-now";
import { approvalWindow, type WalletFact, type WindowState } from "@/core/trust/approval-wallet";

/** One waiting proposal as the approvals inbox shows it. Everything here comes from the server. */
export interface WalletCardData {
  taskId: string;
  title: string;
  projectName: string;
  sha256: string;
  createdAt: string;
  expiresAt: string;
  byAgent: boolean;
  facts: WalletFact[];
  /** The contract's required checks. */
  checks: string[];
  /** Why checks can't run here (Review Only), or null when a sandbox runs them. */
  checksReason: string | null;
  /** False when the policy escalated it and the viewer isn't an owner or admin. */
  canApprove: boolean;
}

// Status is a word in its colour and border (ADR 0180), drawn by StatusBadge: waiting states carry no glyph.
const STATE: Record<WindowState, { label: string; status: Status; bar: string }> = {
  open: { label: "Waiting for approval", status: "approval", bar: "bg-accent" },
  closing: { label: "Closing soon", status: "approval", bar: "bg-approval" },
  expired: { label: "Expired", status: "unverified", bar: "bg-ink-3" },
};

// Facts are lines, not chips (ADR 0180): an icon only where one says "look here".
const FACT_ICON: Partial<Record<WalletFact["kind"], typeof XCircleIcon>> = {
  escalated: ShieldWarningIcon,
  flagged: XCircleIcon,
};

const FACT_CLS: Record<WalletFact["tone"], string> = {
  failed: "text-failed",
  approval: "text-approval",
  neutral: "text-ink-2",
};

/**
 * An Approval Wallet card (ADR 0042): the proposal's hash, how long it can
 * still be approved, what the checks found and how to undo it. It opens the
 * review; approving always happens there, against the diff itself.
 */
export function WalletCard({ card, serverNow }: { card: WalletCardData; serverNow: number }) {
  const now = useNow(serverNow);
  const w = approvalWindow(card.createdAt, card.expiresAt, new Date(now));
  const state = STATE[w.state];
  const expired = w.state === "expired";
  const left = relativeLabel(Date.parse(card.expiresAt) - now);
  const pct = Math.round(w.fractionLeft * 100);

  return (
    <article aria-labelledby={`wallet-${card.taskId}`} className="grid overflow-hidden rounded-md border border-line bg-surface shadow-e1 md:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
        <StatusBadge status={state.status} label={state.label} />

        <div className="min-w-0">
          <h2 id={`wallet-${card.taskId}`} className="text-[1.0625rem] leading-snug font-medium tracking-[-0.02em] break-words">
            {card.title}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {card.projectName}
            {card.byAgent ? ". Sent from the Farbaek Agent app." : null}
          </p>
        </div>

        {card.facts.length ? (
          <ul className="grid gap-1 text-sm" aria-label="What the checks found">
            {card.facts.map((f) => {
              const FactIcon = FACT_ICON[f.kind];
              return (
                <li key={f.kind} className={`flex items-start gap-2 ${FACT_CLS[f.tone]}`}>
                  {FactIcon ? <FactIcon size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden /> : null}
                  <span>{f.label}</span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {/* What happens after approval; an expired proposal won't get there. */}
        {expired ? null : (
          <div className="grid gap-1.5 text-sm text-ink-2">
            <p>Undo it afterwards, file by file. Undo never overwrites a newer change.</p>
            <p>
              {card.checks.length === 0 ? (
                "The plan lists no checks, so nothing will confirm it."
              ) : card.checksReason ? (
                <>Its checks can&apos;t run yet: {card.checksReason}</>
              ) : (
                <>
                  Then{" "}
                  {/* Real spaces and commas between the commands, so copied text and screen readers get words, not "testruns". */}
                  {card.checks.map((c, i) => (
                    <Fragment key={i}>
                      {i === 0 ? null : i === card.checks.length - 1 ? " and " : ", "}
                      <code className="break-all font-mono text-[0.8125rem] text-ink">{c}</code>
                    </Fragment>
                  ))}{" "}
                  {card.checks.length === 1 ? "runs" : "run"} in a test space.
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* The stub: what you hand in. Its dashed edge is the tear line of a ticket. */}
      <div className="grid content-between gap-5 border-t border-dashed border-line-strong/40 bg-surface-raised/50 p-4 sm:p-5 md:border-t-0 md:border-l">
        <div className="grid gap-2">
          <p className="text-[0.8125rem] font-medium text-ink-3">Time to approve</p>
          {expired ? (
            <p className="text-sm">
              Expired {left}. <span className="text-ink-2">It can only be discarded now.</span>
            </p>
          ) : (
            <p className="text-sm">
              Approve by <LocalTime iso={card.expiresAt} />
              <span className="block text-ink-2">Closes {left}</span>
            </p>
          )}
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={`${pct}% of the approval window left`}>
            <div className={`h-full rounded-full ${state.bar} motion-safe:transition-transform motion-safe:duration-[240ms] motion-safe:ease-standard`} style={{ transform: `translateX(${pct - 100}%)` }} />
          </div>
        </div>

        <div className="grid gap-2">
          <Link href={`/app/tasks/${card.taskId}#change`} className={buttonClasses(expired ? "secondary" : "primary", "sm", "group w-full")}>
            {expired ? "Review and discard" : card.canApprove ? "Review and approve" : "Review"}
            <ArrowRightIcon size={14} weight="bold" className="transition-transform duration-[160ms] ease-standard group-hover:translate-x-0.5" aria-hidden />
          </Link>
          {!expired && !card.canApprove ? <p className="text-xs text-ink-3">A rule says an owner or admin has to approve this.</p> : null}
        </div>
      </div>
    </article>
  );
}
