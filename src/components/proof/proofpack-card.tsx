import { CheckCircleIcon, DownloadSimpleIcon, LinkIcon, MinusCircleIcon, ShieldCheckIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { SealReveal } from "@/components/proof/seal-reveal";
import { LocalTime } from "@/components/ui/local-time";
import { verifyProofPack, type ProofPackStatement } from "@/core/proof/proofpack";
import { shortHash } from "@/core/trust/canonical-json";
import type { ProofPackRecord } from "@/server/workspace/types";

const STATUS = {
  verified: { label: "Verified", Icon: CheckCircleIcon, cls: "border-verified/30 bg-verified/[0.05] text-verified" },
  partially_verified: { label: "Partially verified", Icon: WarningCircleIcon, cls: "border-approval/30 bg-approval/[0.06] text-approval" },
  failed: { label: "Failed", Icon: XCircleIcon, cls: "border-failed/30 bg-failed/[0.05] text-failed" },
  unverified: { label: "Unverified", Icon: MinusCircleIcon, cls: "border-line-strong/40 bg-surface-raised text-ink-2" },
} as const;

/**
 * One ProofPack: its status, digest and limits, an integrity check that
 * recomputes the digest from the stored statement on every load, and the
 * raw attestation to download. The Seal appears only when verified.
 */
export async function ProofPackCard({ pack }: { pack: ProofPackRecord }) {
  const { intact } = await verifyProofPack(pack.statement, pack.digest);
  const statement = pack.statement as ProofPackStatement;
  const status = STATUS[pack.status];
  const limits = Array.isArray(statement?.predicate?.limits) ? statement.predicate.limits : [];
  const checks = Array.isArray(statement?.predicate?.checks) ? statement.predicate.checks : [];

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${status.cls}`}>
            <status.Icon size={16} weight="bold" aria-hidden /> {status.label}
          </span>
          <span className="font-mono text-xs text-ink-3">{shortHash(pack.digest)}</span>
        </div>
        <p className={`flex items-center gap-2 text-sm ${intact ? "text-ink-2" : "text-failed"}`}>
          {intact ? <ShieldCheckIcon size={16} className="shrink-0 text-verified" aria-hidden /> : <WarningCircleIcon size={16} className="shrink-0" aria-hidden />}
          {intact ? "Record intact: its digest was recomputed from the stored statement just now and matches." : "This record changed after it was made: the recomputed digest doesn't match."}
        </p>
        <p className="text-xs text-ink-3">
          Recorded <LocalTime iso={pack.createdAt} />
          {statement?.predicate?.verification ? (
            <>
              {" "}
              · verifies {shortHash(statement.predicate.verification.appliedProofPack)} from check run {shortHash(statement.predicate.verification.receipt)}
            </>
          ) : null}
          {pack.previous ? (
            <>
              {" "}
              · <LinkIcon size={12} className="inline align-[-1px]" aria-hidden /> follows {shortHash(pack.previous)}
            </>
          ) : (
            " · the first in this project"
          )}
        </p>
        {checks.length ? (
          <ul className="grid gap-1 text-sm">
            {checks.map((c) => (
              <li key={c.command} className="flex items-center gap-2">
                <code className="min-w-0 truncate font-mono text-[13px]">{c.command}</code>
                <span className="shrink-0 text-xs text-ink-3">{c.status === "not_run" ? "not run" : c.status}</span>
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
          <a href={`/app/proofpacks/${pack.digest}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            <DownloadSimpleIcon size={16} aria-hidden /> Download the attestation (in-toto JSON)
          </a>
          <span className="mt-1 block text-xs text-ink-3">
            Anyone you send it to can check it at{" "}
            <a href="/verify" className="underline underline-offset-2 hover:text-ink">
              farbaek.com/verify
            </a>
            , in their browser.
          </span>
        </p>
      </div>
      {pack.status === "verified" && intact ? <SealReveal hash={pack.digest} className="justify-self-center">
          <ProofPackSeal hash={pack.digest} caption="Farbaek ProofPack" size={160} className="block size-40" />
        </SealReveal> : null}
    </div>
  );
}
