import { ArrowSquareOutIcon, CheckCircleIcon, CircleDashedIcon, InfoIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { LiveRefresh } from "@/components/app/live-refresh";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import type { LaunchProvider } from "@/core/launch/providers";
import type { OrderStatus } from "@/core/launch/vercel";
import { EVIDENCE_WORDS, type EvidenceStatus } from "@/core/publish/evidence";
import { shortHash } from "@/core/trust/canonical-json";
import { formatBytes } from "@/core/workspace/files";
import { disconnectProviderAction } from "@/app/app/projects/[projectId]/launch/launch-actions";
import type { ConnectionView, LaunchOrderView } from "@/server/launch/provider-store";
import { PROVIDER_COPY, type ProviderCopy } from "./provider-copy";
import { ConnectProvider, LaunchToProvider } from "./provider-forms";

// A state under way is its word alone (ADR 0180); an icon only says how it ended.
const STATUS: Record<OrderStatus, { word: string | null; Icon: typeof CheckCircleIcon | null; className: string }> = {
  authorized: { word: "Authorized", Icon: null, className: "border-approval/40 text-approval" },
  uploading: { word: "Sending files", Icon: null, className: "border-approval/40 text-approval" },
  // The provider's own word: building on Vercel, publishing on Netlify.
  building: { word: null, Icon: null, className: "border-approval/40 text-approval" },
  ready: { word: "Live", Icon: CheckCircleIcon, className: "border-verified/40 text-verified" },
  failed: { word: "Failed", Icon: XCircleIcon, className: "border-failed/40 text-failed" },
};

function health(copy: ProviderCopy, code: number | null): string | null {
  if (code === null) return null;
  if (code === 0) return "Not answering yet when checked.";
  const guarded = copy.protectedAnswer(code);
  if (guarded) return guarded;
  if (code >= 200 && code < 400) return `Answering (${code}).`;
  return `Answered ${code} when checked.`;
}

/**
 * LaunchOS with a workspace's own hosting account on the Launch page (ADR
 * 0078, ADR 0093): connect the account, see exactly what goes and under
 * which evidence, confirm, and follow each launch to a live, checked address.
 */
export function ProviderPanel(props: {
  provider: LaunchProvider;
  projectId: string;
  launchKey: string;
  target: string;
  connection: ConnectionView | null;
  /** This provider's launches of the project, newest first. */
  orders: LaunchOrderView[];
  /** Whether any launch of the project is under way, with any provider: one runs at a time. */
  busy: boolean;
  files: { count: number; bytes: number; digest: string };
  evidence: EvidenceStatus;
  /** What the provider does with the files, in a few words. */
  builds: string;
  unfit: string | null;
  connectReason: string | null;
  launchReason: string | null;
  canOverride: boolean;
  canDisconnect: boolean;
}) {
  const { connection, orders, provider } = props;
  const copy = PROVIDER_COPY[provider];
  const active = orders.some((o) => o.status === "authorized" || o.status === "uploading" || o.status === "building");
  const verified = props.evidence === "verified";
  const launchReason =
    props.launchReason ?? (props.busy ? "A launch is under way. Wait for it to finish." : !verified && !props.canOverride ? "The latest change isn't verified, so an owner or admin has to launch it with a reason." : null);
  const titleId = `${provider}-title`;

  return (
    <section id={`launch-${provider}`} aria-labelledby={titleId} className="grid scroll-mt-24 gap-5 rounded-lg border border-line bg-surface p-5 shadow-e1 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-medium">
            Launch to {copy.name}
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink-2">{copy.intro}</p>
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
        <ConnectProvider provider={provider} projectId={props.projectId} disabledReason={props.connectReason} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dl className="grid content-start divide-y divide-line rounded-md border border-line">
            {[
              { k: "Files", v: `${props.files.count.toLocaleString("en-US")} files, ${formatBytes(props.files.bytes)}`, mono: false, title: undefined },
              { k: "Fingerprint", v: shortHash(props.files.digest), mono: true, title: `sha256:${props.files.digest}` },
              { k: "Proof", v: EVIDENCE_WORDS[props.evidence].title, mono: false, title: EVIDENCE_WORDS[props.evidence].detail },
              { k: "Account", v: `${connection.accountName}${connection.teamId ? `, team ${connection.teamId}` : ""}`, mono: false, title: undefined },
              { k: "Goes to", v: "Production", mono: false, title: undefined },
              { k: copy.buildsLabel, v: props.builds, mono: provider === "vercel", title: undefined },
            ].map((row) => (
              <div key={row.k} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
                <dt className="text-sm text-ink-3">{row.k}</dt>
                <dd className={`min-w-0 break-words text-sm ${row.mono ? "font-mono text-[0.8125rem]" : ""} ${row.k === "Proof" ? (props.evidence === "verified" ? "text-verified" : "text-approval") : "text-ink"}`} title={row.title}>
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>
          <LaunchToProvider provider={provider} projectId={props.projectId} launchKey={props.launchKey} target={props.target} needsReason={!verified && props.canOverride} disabledReason={launchReason} />
        </div>
      )}

      {orders.length > 0 ? (
        <div className="grid gap-3 border-t border-line pt-5">
          <h3 className="text-base font-medium">Launches</h3>
          <ul className="grid gap-3">
            {orders.map((o) => {
              const s = STATUS[o.status];
              const said = health(copy, o.healthStatus);
              return (
                <li key={o.id} className="grid gap-2 rounded-md border border-line p-4">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${s.className}`}>
                      {s.Icon ? <s.Icon size={14} weight="bold" aria-hidden /> : null} {s.word ?? copy.working}
                    </span>
                    <span className="font-mono text-[0.8125rem]">{o.targetName}</span>
                    <span className="text-ink-3">
                      <RelativeTime iso={o.authorizedAt} />
                    </span>
                  </p>
                  <p className="text-xs leading-relaxed text-ink-3">
                    {o.fileCount.toLocaleString("en-US")} files, fingerprint <span className="font-mono" title={`sha256:${o.filesDigest}`}>{shortHash(o.filesDigest)}</span>.{" "}
                    {o.evidence === "verified" ? "Checks passed." : `Without passed checks. The reason given: ${o.overrideReason}`}
                  </p>
                  {o.failure ? <p className="text-sm text-failed">{o.failure}</p> : null}
                  {o.status === "ready" && said ? <p className="text-sm text-ink-2">{said}</p> : null}
                  {o.url || o.inspectorUrl ? (
                    <p className="flex flex-wrap gap-x-4 text-sm">
                      {o.url && o.status === "ready" ? (
                        <a href={o.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline">
                          {o.url.replace("https://", "")} <ArrowSquareOutIcon size={14} aria-hidden />
                        </a>
                      ) : null}
                      {o.inspectorUrl ? (
                        <a href={o.inspectorUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-ink-2 hover:text-ink hover:underline">
                          {copy.logLink} <ArrowSquareOutIcon size={14} aria-hidden />
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
        <p className="max-w-[68ch] text-xs leading-relaxed text-ink-3">{copy.domainNote}</p>
        {connection && props.canDisconnect ? (
          <form action={disconnectProviderAction}>
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="projectId" value={props.projectId} />
            <button type="submit" className={buttonClasses("secondary", "sm")}>
              Disconnect {copy.name}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
