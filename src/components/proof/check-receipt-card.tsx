import { ShieldCheckIcon, TerminalWindowIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { SealReveal } from "@/components/proof/seal-reveal";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import type { SandboxReceiptStatement } from "@/core/sandbox/receipts";
import { canonicalHash } from "@/core/trust/canonical-json";
import type { CheckReceiptRecord } from "@/server/workspace/types";
import { forPeople } from "@/core/text/operator-detail";

// Each outcome is a status kind with its icon (ADR 0183): partial needs a look, checks that didn't run are not yet.
const STATUS: Record<CheckReceiptRecord["status"], { label: string; status: Status }> = {
  verified: { label: "Every check passed", status: "verified" },
  partially_verified: { label: "Some checks passed", status: "attention" },
  failed: { label: "No check passed", status: "failed" },
  unverified: { label: "Checks didn't run", status: "unverified" },
};

const CHECK: Record<"passed" | "failed" | "not_run", { status: Status; cls: string; label: string }> = {
  passed: { status: "verified", cls: "text-verified", label: "passed" },
  failed: { status: "failed", cls: "text-failed", label: "failed" },
  not_run: { status: "unverified", cls: "text-unverified", label: "not run" },
};

/**
 * One run of a task's contract checks in a sandbox: what each check did
 * (from its real exit code), where it ran, and an integrity check that
 * recomputes the receipt's digest. Only a run where every check passed,
 * with an intact record, gets the Seal.
 */
export async function CheckReceiptCard({ receipt }: { receipt: CheckReceiptRecord }) {
  const intact = (await canonicalHash(receipt.statement).catch(() => null)) === receipt.digest;
  const predicate = (receipt.statement as SandboxReceiptStatement | null)?.predicate;
  const checks = Array.isArray(predicate?.checks) ? predicate.checks : [];
  const limits = Array.isArray(predicate?.limits) ? predicate.limits : [];
  const status = STATUS[receipt.status];
  // Checks ran, but somewhere that can't count as proof (ADR 0175): saying they didn't run would be untrue.
  const label = receipt.status === "unverified" && checks.length > 0 ? "Doesn't verify the task" : status.label;

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex" title={`sha256:${receipt.digest}`}>
            <StatusBadge status={status.status} label={label} />
          </span>
        </div>
        <p className={`flex items-center gap-2 text-sm ${intact ? "text-ink-2" : "text-failed"}`}>
          {intact ? (
            <ShieldCheckIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden />
          ) : (
            <WarningCircleIcon size={16} weight="fill" className="shrink-0 text-failed" aria-hidden />
          )}
          {intact ? "Record intact: unchanged since it was made, checked just now." : "This record changed after it was made, so don't rely on it."}
        </p>
        <p className="text-xs text-ink-3">
          Ran <LocalTime iso={receipt.createdAt} />
          {predicate?.runtime?.provider ? ", in a private throwaway computer" : ""}.
        </p>
        {checks.length ? (
          <ul className="grid gap-1 text-sm">
            {checks.map((c, i) => {
              const s = CHECK[c.status] ?? CHECK.not_run;
              return (
                <li key={`${c.command}-${i}`} className="flex min-w-0 items-center gap-2">
                  <StatusGlyph status={s.status} />
                  <code className="min-w-0 truncate font-mono text-[0.8125rem]">{c.command}</code>
                  <span className={`shrink-0 text-xs ${s.cls}`}>
                    {s.label}
                    {c.status === "failed" && c.exitCode !== null ? ` (exit ${c.exitCode})` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {limits.length ? (
          <ul className="grid list-disc gap-1 pl-5 text-xs text-ink-2">
            {limits.map((l, i) => (
              <li key={i}>{forPeople(l, "A line about Farbaek's own setup is left out here.")}</li>
            ))}
          </ul>
        ) : null}
        <p>
          <Link href={`/app/sandbox/${receipt.sessionId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            <TerminalWindowIcon size={16} weight="bold" aria-hidden /> Open the session
          </Link>
        </p>
        <details className="text-xs text-ink-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center hover:text-ink [&::-webkit-details-marker]:hidden">Technical details</summary>
          <p className="break-all font-mono">sha256:{receipt.digest}</p>
        </details>
      </div>
      {receipt.status === "verified" && intact ? (
        <SealReveal hash={receipt.digest} className="justify-self-center">
          <ProofPackSeal hash={receipt.digest} caption="Farbaek verified checks" size={160} className="block size-40" />
        </SealReveal>
      ) : null}
    </div>
  );
}
