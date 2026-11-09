import { CheckCircleIcon, DownloadSimpleIcon, ShieldCheckIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { SealReveal } from "@/components/proof/seal-reveal";
import { LocalTime } from "@/components/ui/local-time";
import { verifyProofPack, type ProofPackStatement } from "@/core/proof/proofpack";
import type { ProofPackRecord } from "@/server/workspace/types";
import { forPeople } from "@/core/text/operator-detail";

// Status is its words in a colour and border (ADR 0180); a mark only for how it ended.
const STATUS = {
  verified: { label: "Verified", Icon: CheckCircleIcon, cls: "border-verified/30 bg-verified/[0.05] text-verified" },
  partially_verified: { label: "Partially verified", Icon: WarningCircleIcon, cls: "border-approval/30 bg-approval/[0.06] text-approval" },
  failed: { label: "Failed", Icon: XCircleIcon, cls: "border-failed/30 bg-failed/[0.05] text-failed" },
  unverified: { label: "Unverified", Icon: null, cls: "border-line-strong/40 bg-surface-raised text-ink-2" },
} as const;

/**
 * One ProofPack: its status and limits, an integrity check that recomputes the
 * digest from the stored statement on every load, and the signed record to
 * download. The digests sit in Technical details; the Seal appears only when verified.
 */
export async function ProofPackCard({ pack }: { pack: ProofPackRecord }) {
  const { intact } = await verifyProofPack(pack.statement, pack.digest);
  const statement = pack.statement as ProofPackStatement;
  const status = STATUS[pack.status];
  const limits = Array.isArray(statement?.predicate?.limits) ? statement.predicate.limits : [];
  const checks = Array.isArray(statement?.predicate?.checks) ? statement.predicate.checks : [];
  const verification = statement?.predicate?.verification ?? null;

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${status.cls}`} title={`sha256:${pack.digest}`}>
            {status.Icon ? <status.Icon size={16} weight="bold" aria-hidden /> : null} {status.label}
          </span>
        </div>
        <p className={`flex items-center gap-2 text-sm ${intact ? "text-ink-2" : "text-failed"}`}>
          {intact ? <ShieldCheckIcon size={16} className="shrink-0 text-verified" aria-hidden /> : <WarningCircleIcon size={16} className="shrink-0" aria-hidden />}
          {intact ? "Record intact: unchanged since it was made, checked just now." : "This record changed after it was made, so don't rely on it."}
        </p>
        <p className="text-xs text-ink-3">
          Recorded <LocalTime iso={pack.createdAt} />.{verification ? " It verifies the ProofPack of the applied change, from a check run in a test space." : ""}
          {pack.previous ? " It follows the one before it in this project." : " The first in this project."}
        </p>
        {checks.length ? (
          <ul className="grid gap-1 text-sm">
            {checks.map((c) => (
              <li key={c.command} className="flex items-center gap-2">
                <code className="min-w-0 truncate font-mono text-[0.8125rem]">{c.command}</code>
                <span className="shrink-0 text-xs text-ink-3">{c.status === "not_run" ? "not run" : c.status}</span>
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
          <a href={`/app/proofpacks/${pack.digest}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            <DownloadSimpleIcon size={16} aria-hidden /> Download the signed record
          </a>
          <span className="mt-1 block text-xs text-ink-3">
            Anyone you send it to can check it at{" "}
            <a href="/verify" className="underline underline-offset-2 hover:text-ink">
              farbaek.com/verify
            </a>
            , in their browser.
          </span>
        </p>
        <details className="text-xs text-ink-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center hover:text-ink [&::-webkit-details-marker]:hidden">Technical details</summary>
          <dl className="grid gap-1 break-all font-mono">
            <div>
              <dt className="inline font-sans">This ProofPack: </dt>
              <dd className="inline">sha256:{pack.digest}</dd>
            </div>
            {verification ? (
              <>
                <div>
                  <dt className="inline font-sans">Verifies: </dt>
                  <dd className="inline">sha256:{verification.appliedProofPack}</dd>
                </div>
                <div>
                  <dt className="inline font-sans">From check run: </dt>
                  <dd className="inline">sha256:{verification.receipt}</dd>
                </div>
              </>
            ) : null}
            {pack.previous ? (
              <div>
                <dt className="inline font-sans">Follows: </dt>
                <dd className="inline">sha256:{pack.previous}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-1 font-sans">The file is an in-toto statement in a DSSE envelope, signed with Farbaek&apos;s Ed25519 key.</p>
        </details>
      </div>
      {pack.status === "verified" && intact ? (
        <SealReveal hash={pack.digest} className="justify-self-center">
          <ProofPackSeal hash={pack.digest} caption="Farbaek ProofPack" size={160} className="block size-40" />
        </SealReveal>
      ) : null}
    </div>
  );
}
