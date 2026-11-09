import { ArrowUpRightIcon, GlobeIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { CardTitle } from "@/components/app/primitives";
import { RelativeTime } from "@/components/ui/local-time";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge, StatusGlyph } from "@/components/ui/status-badge";
import { EVIDENCE_WORDS } from "@/core/publish/evidence";
import { formatBytes } from "@/core/workspace/files";
import type { PublishPanelData } from "@/server/publish/panel";
import { EVIDENCE_KIND } from "./evidence-kind";
import { PublishForm } from "./publish-form";
import { SetLiveForm } from "./set-live-form";
import { SiteDomains } from "./site-domains";

/**
 * Publish (ADR 0029): put the project's static site live at its own address
 * on the site domain, after a security check of exactly these files. Each
 * publish is kept, so any earlier version can be made live again. Without
 * verified evidence for the latest change (ADR 0050), an owner or admin
 * publishes with a reason that stays with the version.
 */
export function PublishPanel({ projectId, data, disabledReason: given }: { projectId: string; data: PublishPanelData; disabledReason: string | null }) {
  const { site, live, address, evidence } = data;
  const disabledReason = site?.blocked ? "Farbaek has taken this site offline." : given;
  // Only publishing needs evidence: domains and earlier versions stay in reach.
  const publishDisabled = disabledReason ?? (data.needsOverride && !data.canOverride ? "An owner or admin can publish this with a reason, or run the latest change's checks first." : null);
  const words = EVIDENCE_WORDS[evidence.status];
  const blockLink =
    data.block?.code === "NO_CHECK" || data.block?.code === "CHECK_STALE" || data.block?.code === "CRITICAL_FINDINGS" || data.block?.code === "CHECK_RUNNING"
      ? { href: `/app/projects/${projectId}/security`, label: data.block.code === "CRITICAL_FINDINGS" ? "See the findings" : "Open Security" }
      : null;

  return (
    <section id="publish" aria-labelledby="publish-heading" className="grid scroll-mt-24 gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle id="publish-heading" icon={GlobeIcon}>
          Publish
        </CardTitle>
        {live && address ? <StatusBadge status="verified" label="Live" /> : <StatusBadge status="off" label="Not published" />}
      </div>

      {site?.blocked ? (
        <p role="status" className="flex items-start gap-2.5 rounded-sm border border-failed/30 bg-failed/[0.05] px-4 py-3 text-sm text-ink">
          <StatusGlyph status="blocked" className="mt-0.5" />
          <span>
            <span className="font-medium">Farbaek took this site offline</span> <RelativeTime iso={site.blocked.at} />. {site.blocked.notice} It can&apos;t go live again until
            Farbaek lifts this; visitors see that the site isn&apos;t available.{" "}
            <Link href="/app/help/new?topic=other" className="font-medium text-accent underline-offset-4 hover:underline">
              Ask Farbaek about this
            </Link>
          </span>
        </p>
      ) : null}

      {live && address ? (
        <div className="grid gap-1">
          <a href={address} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 break-all font-mono text-body text-accent hover:underline">
            {address.replace(/^https?:\/\//, "")} <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
          </a>
          <p className="text-sm text-ink-2">
            Version {live.number}, published <RelativeTime iso={live.createdAt} />
            {live.securityScore !== null ? ` after a security check that scored ${live.securityScore}` : ""}.
          </p>
          {data.unpublishedChanges ? (
            <p className="text-sm font-medium text-ink">The files changed since this version. Publish again to put the changes live.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-ink-2">
          Put this site on the internet at its own address. Farbaek publishes exactly the files you have now, after a security check of those files finds nothing critical. Every plan can run the rules check that this needs.
        </p>
      )}

      <div className="flex flex-wrap items-start gap-3 rounded-sm border border-line px-4 py-3 text-sm">
        <StatusGlyph status={EVIDENCE_KIND[evidence.status]} className="mt-[0.1875rem]" />
        <p className="min-w-0 flex-1 leading-relaxed text-ink-2">
          <span className="font-medium text-ink">{words.title}.</span> {words.detail}
          {data.needsOverride ? " Publishing without it needs a reason from an owner or admin." : ""}
        </p>
        {evidence.taskId ? (
          <Link href={`/app/tasks/${evidence.taskId}`} className={buttonClasses("secondary", "sm")}>
            Open the task
          </Link>
        ) : null}
      </div>

      {data.block ? (
        <div className="flex flex-wrap items-center gap-3 rounded-sm border border-line bg-surface-raised/60 px-4 py-3 text-sm">
          <span className="flex min-w-0 flex-1 items-start gap-2.5 text-ink-2">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
            {data.block.message}
          </span>
          {blockLink ? (
            <Link href={blockLink.href} className={buttonClasses("secondary", "sm")}>
              {blockLink.label}
            </Link>
          ) : null}
        </div>
      ) : null}

      {data.domain && data.block?.code !== "NO_DOMAIN" && data.block?.code !== "NOT_STATIC" ? (
        <PublishForm
          projectId={projectId}
          domain={data.domain}
          initialName={data.suggestedName}
          live={Boolean(live)}
          address={address}
          override={data.needsOverride && data.canOverride}
          disabledReason={publishDisabled ?? (data.block ? "Publishing waits on the step above." : null)}
        />
      ) : null}

      {site ? (
        <SiteDomains
          projectId={projectId}
          domains={data.domains.map((d) => ({ id: d.id, hostname: d.hostname, status: d.status, records: d.records }))}
          available={data.domainsAvailable}
          disabledReason={disabledReason}
        />
      ) : null}

      {site && data.deployments.length > 0 ? (
        <details className="group">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-ink-2">Every version</summary>
          <ol className="mt-2 grid gap-2">
            {data.deployments.map((d) => {
              const isLive = d.id === site.liveDeploymentId;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-sm border border-line px-3.5 py-2.5 text-sm">
                  <span className="font-medium">Version {d.number}</span>
                  <span className="text-ink-3">
                    <RelativeTime iso={d.createdAt} /> · {d.fileCount} {d.fileCount === 1 ? "file" : "files"}, {formatBytes(d.totalBytes)}
                  </span>
                  {d.evidence ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                      <StatusGlyph status={EVIDENCE_KIND[d.evidence]} size={14} />
                      {d.evidence === "verified" ? "Verified" : "Without passed checks"}
                    </span>
                  ) : null}
                  <span className="ml-auto">
                    {isLive ? (
                      <StatusBadge status="verified" label="Live" />
                    ) : disabledReason ? null : (
                      <SetLiveForm projectId={projectId} deploymentId={d.id} version={d.number} />
                    )}
                  </span>
                  {d.overrideReason ? <p className="basis-full text-xs leading-relaxed text-ink-2">Reason: {d.overrideReason}</p> : null}
                  <details className="basis-full text-xs text-ink-3">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center hover:text-ink [&::-webkit-details-marker]:hidden">Technical details</summary>
                    <p className="break-all font-mono">sha256:{d.digest}</p>
                    {d.evidenceProofPack ? <p className="break-all font-mono">ProofPack sha256:{d.evidenceProofPack}</p> : null}
                  </details>
                </li>
              );
            })}
          </ol>
          {live && !disabledReason ? (
            <SetLiveForm projectId={projectId} deploymentId={null} className="mt-3" />
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            Each version records exactly which file revisions went live. It shows what was published, not that the site works.
          </p>
        </details>
      ) : null}
    </section>
  );
}
