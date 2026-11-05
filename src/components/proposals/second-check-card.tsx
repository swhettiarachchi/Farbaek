"use client";

import { CheckCircleIcon, CircleDashedIcon, EyesIcon, InfoIcon, WarningCircleIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { secondCheckAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { TOPIC_LABELS, VERDICT_LABELS, type SecondCheckResult, type SecondCheckVerdict } from "@/core/trust/second-check";

const VERDICT_LOOK: Record<SecondCheckVerdict, { icon: Icon; className: string }> = {
  consistent: { icon: CheckCircleIcon, className: "text-verified border-verified/40" },
  concerns: { icon: WarningIcon, className: "text-approval border-approval/40" },
  unclear: { icon: CircleDashedIcon, className: "text-unverified border-unverified/60 border-dashed" },
};

const SEVERITY_LOOK = {
  serious: { icon: XCircleIcon, label: "Serious", className: "text-failed" },
  concern: { icon: WarningIcon, label: "Concern", className: "text-approval" },
  note: { icon: InfoIcon, label: "Note", className: "text-ink-3" },
} as const;

type Stored = SecondCheckResult & { createdAt: string };

/**
 * The second check on a change's review (ADR 0121): a second model's read of
 * the change against its contract, asked for, kept with the proposal and
 * labelled advisory. It never changes what the change needs to be approved.
 */
export function SecondCheckCard({
  proposalId,
  initial,
  pending,
  recommended,
  disabledReason,
}: {
  proposalId: string;
  initial: Stored | null;
  /** Only a change still waiting for review can be checked. */
  pending: boolean;
  /** The policy sent this change to an owner or admin. */
  recommended: boolean;
  disabledReason: string | null;
}) {
  const [check, setCheck] = useState<Stored | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [running, start] = useTransition();

  function ask() {
    setError(null);
    start(async () => {
      const r = await secondCheckAction({ proposalId });
      if (r.status === "done") setCheck(r.result);
      else setError(r.message);
    });
  }

  if (!check && !pending) return null;
  const look = check ? VERDICT_LOOK[check.verdict] : null;

  return (
    <section aria-labelledby="second-check-title" className="grid gap-4 rounded-md border border-line bg-surface-raised/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="second-check-title" className="flex items-center gap-2 text-base font-medium">
          <EyesIcon size={18} className="text-ink-3" aria-hidden /> Second check
        </h3>
        {check && look ? (
          <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${look.className}`}>
            <look.icon size={14} weight="bold" aria-hidden /> {VERDICT_LABELS[check.verdict].title}
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-ink-2">
        A second AI model reads this change against its plan. It&apos;s advice: agreement between two models isn&apos;t proof, and the rules, the exact checks and real tests still
        decide what this change needs.
      </p>

      {!check && recommended ? (
        <p className="flex items-start gap-2 rounded-sm border border-approval/30 bg-approval/[0.06] px-3 py-2 text-sm">
          <WarningIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-approval" aria-hidden />
          Recommended for this change: a rule sent it to an owner or admin.
        </p>
      ) : null}

      {check ? (
        <div className="grid gap-3">
          <p className="text-sm leading-relaxed">{check.summary}</p>
          {check.findings.length > 0 ? (
            <ul className="grid gap-2">
              {check.findings.map((f, i) => {
                const s = SEVERITY_LOOK[f.severity];
                return (
                  <li key={i} className="grid gap-1 rounded-sm border border-line bg-surface px-3 py-2.5">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className={`inline-flex items-center gap-1 font-medium ${s.className}`}>
                        <s.icon size={14} weight="bold" aria-hidden /> {s.label}
                      </span>
                      <span className="text-ink-3">{TOPIC_LABELS[f.topic]}</span>
                      {f.path ? <span className="break-all font-mono text-ink-2">{f.path}</span> : null}
                    </p>
                    <p className="text-sm leading-relaxed text-ink-2">{f.detail}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No findings.</p>
          )}
          {check.uncertainty ? <p className="text-sm leading-relaxed text-ink-2">What it couldn&apos;t check: {check.uncertainty}</p> : null}
          {check.truncated.length > 0 ? (
            <p className="text-xs leading-relaxed text-ink-3">
              Too large to include, so sent by name only: <span className="break-all font-mono">{check.truncated.join(", ")}</span>.
            </p>
          ) : null}
          <p className="text-xs leading-relaxed text-ink-3">
            Checked by <span className="font-mono">{check.model}</span> on <LocalTime iso={check.createdAt} />.{" "}
            {check.independent ? "A different model from the one that wrote the change." : "The same model that wrote the change, because the plan has no other: a second read, not an independent one."}
          </p>
        </div>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={ask} disabled={running || disabledReason !== null} className={buttonClasses("secondary", "sm")}>
            <EyesIcon size={16} aria-hidden /> {running ? "Checking…" : check ? "Check again" : "Ask a second model"}
          </button>
          <span className="text-xs text-ink-3">{disabledReason ?? "Uses a little of this workspace's AI usage."}</span>
        </div>
      ) : null}

      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
