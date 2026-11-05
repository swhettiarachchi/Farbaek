import { ArrowSquareOutIcon, CheckCircleIcon, MinusCircleIcon, ShieldCheckIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { SealReveal } from "@/components/proof/seal-reveal";
import { LocalTime } from "@/components/ui/local-time";
import type { SandboxReceiptStatement } from "@/core/sandbox/receipts";
import { canonicalHash, shortHash } from "@/core/trust/canonical-json";
import type { CheckReceiptRecord } from "@/server/workspace/types";

const STATUS = {
  verified: { label: "Every check passed", Icon: CheckCircleIcon, cls: "border-verified/30 bg-verified/[0.05] text-verified" },
  partially_verified: { label: "Some checks passed", Icon: WarningCircleIcon, cls: "border-approval/30 bg-approval/[0.06] text-approval" },
  failed: { label: "No check passed", Icon: XCircleIcon, cls: "border-failed/30 bg-failed/[0.05] text-failed" },
  unverified: { label: "Checks didn't run", Icon: MinusCircleIcon, cls: "border-line-strong/40 bg-surface-raised text-ink-2" },
} as const;

const CHECK = {
  passed: { Icon: CheckCircleIcon, cls: "text-verified", label: "passed" },
  failed: { Icon: XCircleIcon, cls: "text-failed", label: "failed" },
  not_run: { Icon: MinusCircleIcon, cls: "text-unverified", label: "not run" },
} as const;

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
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${status.cls}`}>
            <status.Icon size={16} weight="bold" aria-hidden /> {label}
          </span>
          <span className="font-mono text-xs text-ink-3">{shortHash(receipt.digest)}</span>
        </div>
        <p className={`flex items-center gap-2 text-sm ${intact ? "text-ink-2" : "text-failed"}`}>
          {intact ? <ShieldCheckIcon size={16} className="shrink-0 text-verified" aria-hidden /> : <WarningCircleIcon size={16} className="shrink-0" aria-hidden />}
          {intact ? "Record intact: its digest was recomputed from the stored statement just now and matches." : "This record changed after it was made: the recomputed digest doesn't match."}
        </p>
        <p className="text-xs text-ink-3">
          Ran <LocalTime iso={receipt.createdAt} />
          {predicate?.runtime?.provider ? ` on ${predicate.runtime.provider}, kept apart from everything else` : ""}
        </p>
        {checks.length ? (
          <ul className="grid gap-1 text-sm">
            {checks.map((c, i) => {
              const s = CHECK[c.status] ?? CHECK.not_run;
              return (
                <li key={`${c.command}-${i}`} className="flex min-w-0 items-center gap-2">
                  <s.Icon size={16} weight="bold" className={`shrink-0 ${s.cls}`} aria-hidden />
                  <code className="min-w-0 truncate font-mono text-[0.8125rem]">{c.command}</code>
                  <span className="shrink-0 text-xs text-ink-3">
                    {s.label}
                    {c.exitCode !== null ? `, exit ${c.exitCode}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {limits.length ? (
          <ul className="grid list-disc gap-1 pl-5 text-xs text-ink-2">
            {limits.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : null}
        <p>
          <Link href={`/app/sandbox/${receipt.sessionId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            <ArrowSquareOutIcon size={16} aria-hidden /> Open the session
          </Link>
        </p>
      </div>
      {receipt.status === "verified" && intact ? <SealReveal hash={receipt.digest} className="justify-self-center">
          <ProofPackSeal hash={receipt.digest} caption="Farbaek verified checks" size={160} className="block size-40" />
        </SealReveal> : null}
    </div>
  );
}
