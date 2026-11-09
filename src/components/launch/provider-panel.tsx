import { ArrowUpRightIcon, CheckCircleIcon, CloudArrowUpIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { CardTitle, Notice } from "@/components/app/primitives";
import { LiveRefresh } from "@/components/app/live-refresh";
import { RelativeTime } from "@/components/ui/local-time";
import { STATUS_KINDS, StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import { EVIDENCE_KIND } from "@/components/publish/evidence-kind";
import type { LaunchProvider } from "@/core/launch/providers";
import type { OrderStatus } from "@/core/launch/vercel";
import { EVIDENCE_WORDS, type EvidenceStatus } from "@/core/publish/evidence";
import { formatBytes } from "@/core/workspace/files";
import { disconnectProviderAction } from "@/app/app/projects/[projectId]/launch/launch-actions";
import { ConfirmAction } from "@/components/ui/confirm-action";
import type { ConnectionView, LaunchOrderView } from "@/server/launch/provider-store";
import { PROVIDER_COPY, type ProviderCopy } from "./provider-copy";
import { ConnectProvider, LaunchToProvider } from "./provider-forms";

// Each launch's state is its kind (ADR 0183): authorized waits on the host, sending and building are work going on.
const STATUS: Record<OrderStatus, { word: string | null; kind: Status }> = {
  authorized: { word: "Authorized", kind: "pending" },
  uploading: { word: "Sending files", kind: "working" },
  // The provider's own word: building on Vercel, publishing on Netlify.
  building: { word: null, kind: "working" },
  ready: { word: "Live", kind: "verified" },
  failed: { word: "Failed", kind: "failed" },
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
          <CardTitle id={titleId} icon={CloudArrowUpIcon}>
            Launch to {copy.name}
          </CardTitle>
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink-2">{copy.intro}</p>
        </div>
        {connection ? (
          // The verified kind, drawn here so a long account name can be cut short; the whole name is in the title and in the Account row below.
          <span
            title={`Connected as ${connection.accountName}`}
            className={`inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${STATUS_KINDS.verified.className}`}
          >
            <CheckCircleIcon size={14} weight="fill" className="shrink-0" aria-hidden /> <span className="truncate">Connected as {connection.accountName}</span>
          </span>
        ) : (
          <StatusBadge status="off" label="Not connected" />
        )}
      </div>

      {props.unfit ? (
        <Notice>{props.unfit}</Notice>
      ) : !connection ? (
        <ConnectProvider provider={provider} projectId={props.projectId} disabledReason={props.connectReason} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dl className="grid content-start divide-y divide-line rounded-md border border-line">
            {[
              { k: "Files", v: `${props.files.count.toLocaleString("en-US")} ${props.files.count === 1 ? "file" : "files"}, ${formatBytes(props.files.bytes)}, recorded exactly as they go`, mono: false, title: `sha256:${props.files.digest}`, kind: null },
              { k: "Proof", v: EVIDENCE_WORDS[props.evidence].title, mono: false, title: EVIDENCE_WORDS[props.evidence].detail, kind: EVIDENCE_KIND[props.evidence] },
              { k: "Account", v: `${connection.accountName}${connection.teamId ? `, team ${connection.teamId}` : ""}`, mono: false, title: undefined, kind: null },
              { k: "Goes to", v: `The live site (what ${copy.name} calls production)`, mono: false, title: undefined, kind: null },
              { k: copy.buildsLabel, v: props.builds, mono: provider === "vercel", title: undefined, kind: null },
            ].map((row) => (
              <div key={row.k} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
                <dt className="text-sm text-ink-3">{row.k}</dt>
                <dd className={`min-w-0 break-words text-sm text-ink ${row.mono ? "font-mono text-label" : ""}`} title={row.title}>
                  {row.kind ? (
                    <span className="flex items-start gap-1.5">
                      <StatusGlyph status={row.kind} className="mt-0.5" />
                      {row.v}
                    </span>
                  ) : (
                    row.v
                  )}
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
                    <StatusBadge status={s.kind} label={s.word ?? copy.working} />
                    <span className="font-mono text-label">{o.targetName}</span>
                    <span className="text-ink-3">
                      <RelativeTime iso={o.authorizedAt} />
                    </span>
                  </p>
                  <p className="text-xs leading-relaxed text-ink-3" title={`Files sha256:${o.filesDigest}`}>
                    {o.fileCount.toLocaleString("en-US")} {o.fileCount === 1 ? "file" : "files"}. {o.evidence === "verified" ? "Checks passed." : `Without passed checks. The reason given: ${o.overrideReason}`}
                  </p>
                  {o.failure ? (
                    <p className="flex items-start gap-2 text-sm text-failed">
                      <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {o.failure}
                    </p>
                  ) : null}
                  {o.status === "ready" && said ? <p className="text-sm text-ink-2">{said}</p> : null}
                  {o.url || o.inspectorUrl ? (
                    <p className="flex flex-wrap gap-x-4 text-sm">
                      {o.url && o.status === "ready" ? (
                        <a href={o.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline">
                          {o.url.replace("https://", "")} <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
                        </a>
                      ) : null}
                      {o.inspectorUrl ? (
                        <a href={o.inspectorUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-ink-2 hover:text-ink hover:underline">
                          {copy.logLink} <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
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
          <ConfirmAction
            action={disconnectProviderAction}
            fields={{ provider, projectId: props.projectId }}
            trigger={`Disconnect ${copy.name}`}
            question={<>Disconnect {copy.name}? New launches stop until it&apos;s connected again. Anything already live there stays live.</>}
            confirmLabel={`Disconnect ${copy.name}`}
            pendingLabel="Disconnecting…"
            keepLabel="Keep it connected"
          />
        ) : null}
      </div>
    </section>
  );
}
