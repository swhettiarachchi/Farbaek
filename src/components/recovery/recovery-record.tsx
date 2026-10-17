import { ArrowCounterClockwiseIcon, DownloadSimpleIcon, ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { LocalTime } from "@/components/ui/local-time";
import type { RecoveryReceipt } from "@/core/proof/recovery-receipt";
import { canonicalHash, shortHash } from "@/core/trust/canonical-json";
import type { RecoveryRecord } from "@/server/workspace/types";

const STATUS = {
  recovered: { label: "Recovered", Icon: ArrowCounterClockwiseIcon, cls: "border-verified/30 bg-verified/[0.05] text-verified" },
  partially_recovered: { label: "Partly recovered", Icon: WarningCircleIcon, cls: "border-approval/30 bg-approval/[0.06] text-approval" },
} as const;

/** One recorded undo: its status, what each file went from and to, an integrity check, its limits and the attestation to download. */
export async function RecoveryRecordCard({ record }: { record: RecoveryRecord }) {
  const intact = (await canonicalHash(record.statement).catch(() => null)) === record.digest;
  const predicate = (record.statement as RecoveryReceipt | null)?.predicate;
  const operations = Array.isArray(predicate?.operations) ? predicate.operations : [];
  const left = Array.isArray(predicate?.left) ? predicate.left : [];
  const limits = Array.isArray(predicate?.limits) ? predicate.limits : [];
  const status = STATUS[record.status];

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${status.cls}`}>
          <status.Icon size={16} weight="bold" aria-hidden /> {status.label}
        </span>
        <span className="font-mono text-xs text-ink-3">{shortHash(record.digest)}</span>
      </div>
      <p className={`flex items-center gap-2 text-sm ${intact ? "text-ink-2" : "text-failed"}`}>
        {intact ? <ShieldCheckIcon size={16} className="shrink-0 text-verified" aria-hidden /> : <WarningCircleIcon size={16} className="shrink-0" aria-hidden />}
        {intact ? "Record intact: its digest was recomputed from the stored statement just now and matches." : "This record changed after it was made: the recomputed digest doesn't match."}
      </p>
      <p className="text-xs text-ink-3">
        Recorded <LocalTime iso={record.createdAt} /> · {record.restored} {record.restored === 1 ? "file" : "files"} undone
        {predicate?.proofPack ? <> · undoes ProofPack {shortHash(predicate.proofPack)}</> : null}
      </p>
      {operations.length || left.length ? (
        <ul className="grid gap-1 text-sm">
          {operations.map((o) => (
            <li key={o.path} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 font-mono text-[13px] break-all">{o.path}</span>
              <span className="text-xs text-ink-3">{o.action === "restore" ? `restored revision ${o.toRevision}` : "removed"}</span>
            </li>
          ))}
          {left.map((l) => (
            <li key={l.path} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 font-mono text-[13px] break-all">{l.path}</span>
              <span className="text-xs text-ink-3">{l.reason === "not_selected" ? "not chosen" : "left as it is: it changed after the apply"}</span>
            </li>
          ))}
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
        <a href={`/app/recoveries/${record.digest}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          <DownloadSimpleIcon size={16} aria-hidden /> Download the record (in-toto JSON)
        </a>
      </p>
    </div>
  );
}
