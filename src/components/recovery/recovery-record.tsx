import { DownloadSimpleIcon, ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import type { RecoveryReceipt } from "@/core/proof/recovery-receipt";
import { canonicalHash } from "@/core/trust/canonical-json";
import type { RecoveryRecord } from "@/server/workspace/types";
import { forPeople } from "@/core/text/operator-detail";

// Each outcome is a status kind with its icon (ADR 0183): a partial undo needs a look.
const STATUS: Record<RecoveryRecord["status"], { label: string; status: Status }> = {
  recovered: { label: "Undone", status: "verified" },
  partially_recovered: { label: "Partly undone", status: "attention" },
};

/** One recorded undo: its status, what each file went from and to, an integrity check, its limits and the signed record to download. */
export async function RecoveryRecordCard({ record }: { record: RecoveryRecord }) {
  const intact = (await canonicalHash(record.statement).catch(() => null)) === record.digest;
  const predicate = (record.statement as RecoveryReceipt | null)?.predicate;
  const operations = Array.isArray(predicate?.operations) ? predicate.operations : [];
  const left = Array.isArray(predicate?.left) ? predicate.left : [];
  const limits = Array.isArray(predicate?.limits) ? predicate.limits : [];
  const status = STATUS[record.status];

  return (
    <div className="grid min-w-0 gap-3">
      <StatusBadge status={status.status} label={status.label} />
      <p className={`flex items-center gap-2 text-sm ${intact ? "text-ink-2" : "text-failed"}`}>
        {intact ? (
          <ShieldCheckIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden />
        ) : (
          <WarningCircleIcon size={16} weight="fill" className="shrink-0 text-failed" aria-hidden />
        )}
        {intact ? "Record intact: unchanged since it was made, checked just now." : "This record changed after it was made, so don't rely on it."}
      </p>
      <p className="text-xs text-ink-3">
        Recorded <LocalTime iso={record.createdAt} />. {record.restored} {record.restored === 1 ? "file" : "files"} undone.
        {predicate?.proofPack ? " It undoes the change whose ProofPack is named in the technical details." : ""}
      </p>
      {operations.length || left.length ? (
        <ul className="grid gap-1 text-sm">
          {operations.map((o) => (
            <li key={o.path} className="flex min-w-0 items-start gap-2">
              <StatusGlyph status="verified" className="mt-0.5" />
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 font-mono text-label break-all">{o.path}</span>
                <span className="text-xs text-ink-3">{o.action === "restore" ? `restored revision ${o.toRevision}` : "removed"}</span>
              </span>
            </li>
          ))}
          {left.map((l) => (
            <li key={l.path} className="flex min-w-0 items-start gap-2">
              {/* Not chosen is off; a file that moved on since needs a look. */}
              <StatusGlyph status={l.reason === "not_selected" ? "off" : "attention"} className="mt-0.5" />
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 font-mono text-label break-all">{l.path}</span>
                <span className="text-xs text-ink-3">{l.reason === "not_selected" ? "not chosen" : "left as it is: it changed after the apply"}</span>
              </span>
            </li>
          ))}
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
        <a href={`/app/recoveries/${record.digest}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> Download the record
        </a>
      </p>
      <details className="text-xs text-ink-3">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center hover:text-ink [&::-webkit-details-marker]:hidden">Technical details</summary>
        <p className="break-all">
          This record: <span className="font-mono">sha256:{record.digest}</span>
        </p>
        {predicate?.proofPack ? (
          <p className="break-all">
            Undoes ProofPack: <span className="font-mono">sha256:{predicate.proofPack}</span>
          </p>
        ) : null}
      </details>
    </div>
  );
}
