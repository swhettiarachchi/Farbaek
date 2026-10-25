import { ArrowSquareOutIcon, CheckCircleIcon, CircleDashedIcon, HourglassMediumIcon, InfoIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { LiveRefresh } from "@/components/app/live-refresh";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import type { OrderStatus, VercelSettings } from "@/core/launch/vercel";
import { EVIDENCE_WORDS, type EvidenceStatus } from "@/core/publish/evidence";
import { shortHash } from "@/core/trust/canonical-json";
import { formatBytes } from "@/core/workspace/files";
import { disconnectVercelAction } from "@/app/app/projects/[projectId]/launch/vercel-actions";
import type { ConnectionView, LaunchOrderView } from "@/server/launch/provider-store";
import { ConnectVercel, LaunchVercel } from "./vercel-forms";

const STATUS: Record<OrderStatus, { word: string; Icon: typeof CheckCircleIcon; className: string }> = {
  authorized: { word: "Authorized", Icon: HourglassMediumIcon, className: "border-approval/40 text-approval" },
  uploading: { word: "Sending files", Icon: HourglassMediumIcon, className: "border-approval/40 text-approval" },
  building: { word: "Building on Vercel", Icon: HourglassMediumIcon, className: "border-approval/40 text-approval" },
  ready: { word: "Live", Icon: CheckCircleIcon, className: "border-verified/40 text-verified" },
  failed: { word: "Failed", Icon: XCircleIcon, className: "border-failed/40 text-failed" },
};

function health(code: number | null): string | null {
  if (code === null) return null;
  if (code === 0) return "Not answering yet when checked.";
  if (code === 401 || code === 403) return `Answers with Vercel's sign-in (${code}): Deployment Protection is on for this address in Vercel.`;
  if (code >= 200 && code < 400) return `Answering (${code}).`;
  return `Answered ${code} when checked.`;
}

/**
 * LaunchOS with Vercel on the Launch page (ADR 0078): connect the
 * workspace's own account, see exactly what goes and under which evidence,
 * confirm, and follow each launch to a live, checked address.
 */
export function VercelPanel(props: {
  projectId: string;
  launchKey: string;
  target: string;
  connection: ConnectionView | null;
  orders: LaunchOrderView[];
  files: { count: number; bytes: number; digest: string };
  evidence: EvidenceStatus;
  settings: VercelSettings;
  unfit: string | null;
  connectReason: string | null;
  launchReason: string | null;
  canOverride: boolean;
  canDisconnect: boolean;
}) {
  const { connection, orders } = props;
  const active = orders.some((o) => o.status === "authorized" || o.status === "uploading" || o.status === "building");
  const verified = props.evidence === "verified";
  const launchReason = props.launchReason ?? (active ? "A launch is under way. Wait for it to finish." : !verified && !props.canOverride ? "The latest change isn't verified, so an owner or admin has to launch it with a reason." : null);
  const builds = props.settings.framework ? `${props.settings.framework}${props.settings.buildCommand ? `, ${props.settings.buildCommand}` : ""}` : props.settings.buildCommand ?? "Vercel detects it";

  return (
    <section aria-labelledby="vercel-title" className="grid gap-5 rounded-lg border border-line bg-surface p-5 shadow-e1 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="vercel-title" className="text-lg font-medium">
            Launch to Vercel
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink-2">
            Vercel builds and hosts it on your own Vercel account, and bills that account under your plan there. Farbaek doesn&apos;t charge for launches and buys nothing for you.
          </p>
        </div>
        {connection ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-verified/40 px-3 text-xs font-medium text-verified">
            <CheckCircleIcon size={14} weight="fill" aria-hidden /> Connected as {connection.accountName}
          </span>
        ) : (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-xs text-ink-2">
            <CircleDashedIcon size={14} aria-hidden /> Not connected
          </span>
        )}
      </div>

      {props.unfit ? (
        <p className="flex items-start gap-2 rounded-sm border border-line bg-surface-raised/60 px-4 py-3 text-sm text-ink-2">
          <InfoIcon size={18} className="mt-px shrink-0 text-ink-3" aria-hidden /> {props.unfit}
        </p>
      ) : !connection ? (
        <ConnectVercel projectId={props.projectId} disabledReason={props.connectReason} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dl className="grid content-start divide-y divide-line rounded-md border border-line">
            {[
              { k: "Files", v: `${props.files.count.toLocaleString("en-US")} files, ${formatBytes(props.files.bytes)}`, mono: false, title: undefined },
              { k: "Fingerprint", v: shortHash(props.files.digest), mono: true, title: `sha256:${props.files.digest}` },
              { k: "Evidence", v: EVIDENCE_WORDS[props.evidence].title, mono: false, title: EVIDENCE_WORDS[props.evidence].detail },
              { k: "Account", v: `${connection.accountName}${connection.teamId ? `, team ${connection.teamId}` : ""}`, mono: false, title: undefined },
              { k: "Goes to", v: "Production", mono: false, title: undefined },
              { k: "Vercel builds it with", v: builds, mono: true, title: undefined },
            ].map((row) => (
              <div key={row.k} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
                <dt className="text-sm text-ink-3">{row.k}</dt>
                <dd className={`min-w-0 break-words text-sm ${row.mono ? "font-mono text-[13px]" : ""} ${row.k === "Evidence" ? (props.evidence === "verified" ? "text-verified" : "text-approval") : "text-ink"}`} title={row.title}>
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>
          <LaunchVercel projectId={props.projectId} launchKey={props.launchKey} target={props.target} needsReason={!verified && props.canOverride} disabledReason={launchReason} />
        </div>
      )}

      {orders.length > 0 ? (
        <div className="grid gap-3 border-t border-line pt-5">
          <h3 className="text-base font-medium">Launches</h3>
          <ul className="grid gap-3">
            {orders.map((o) => {
              const s = STATUS[o.status];
              return (
                <li key={o.id} className="grid gap-2 rounded-md border border-line p-4">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${s.className}`}>
                      <s.Icon size={14} weight="bold" aria-hidden /> {s.word}
                    </span>
                    <span className="font-mono text-[13px]">{o.targetName}</span>
                    <span className="text-ink-3">
                      <RelativeTime iso={o.authorizedAt} />
                    </span>
                  </p>
                  <p className="text-xs leading-relaxed text-ink-3">
                    {o.fileCount.toLocaleString("en-US")} files, fingerprint <span className="font-mono" title={`sha256:${o.filesDigest}`}>{shortHash(o.filesDigest)}</span>.{" "}
                    {o.evidence === "verified" ? "Verified evidence." : `Without verified evidence. The reason given: ${o.overrideReason}`}
                  </p>
                  {o.failure ? <p className="text-sm text-failed">{o.failure}</p> : null}
                  {o.status === "ready" && health(o.healthStatus) ? <p className="text-sm text-ink-2">{health(o.healthStatus)}</p> : null}
                  {o.url || o.inspectorUrl ? (
                    <p className="flex flex-wrap gap-x-4 text-sm">
                      {o.url && o.status === "ready" ? (
                        <a href={o.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline">
                          {o.url.replace("https://", "")} <ArrowSquareOutIcon size={14} aria-hidden />
                        </a>
                      ) : null}
                      {o.inspectorUrl ? (
                        <a href={o.inspectorUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-ink-2 hover:text-ink hover:underline">
                          Build log on Vercel <ArrowSquareOutIcon size={14} aria-hidden />
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <LiveRefresh active={active} everyMs={5_000} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="max-w-[68ch] text-xs leading-relaxed text-ink-3">Buying a domain isn&apos;t part of LaunchOS yet. Add one you own in the project&apos;s settings on Vercel.</p>
        {connection && props.canDisconnect ? (
          <form action={disconnectVercelAction}>
            <input type="hidden" name="projectId" value={props.projectId} />
            <button type="submit" className={buttonClasses("secondary", "sm")}>
              Disconnect Vercel
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
