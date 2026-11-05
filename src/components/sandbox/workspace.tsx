"use client";

import { PauseIcon, PlayIcon, StopIcon, WarningIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { FarbaekApiError, FarbaekSandboxClient, type Execution, type SandboxSession } from "@/sdk/sandbox-client";
import { SessionStateBadge } from "./badges";
import { SandboxConsole } from "./console";
import { FilesPanel } from "./files-panel";
import { PreviewPanel } from "./preview-panel";
import { ChecksPanel, DetailsPanel, HistoryPanel, type ReceiptSummary, type TaskSummary } from "./side-panels";

export interface WorkspaceProps {
  orgId: string;
  me: string;
  session: SandboxSession;
  executions: Execution[];
  events: { id: number; event: string; actorId: string | null; occurredAt: string; detail: Record<string, unknown> }[];
  receipts: ReceiptSummary[];
  task: TaskSummary | null;
  capabilities: { pauseResume: boolean; metrics: boolean; previews: boolean; cancel: boolean; filesystem: boolean };
  previewReason: string | null;
  canOperate: boolean;
  runReason: string | null;
  notice: { tone: "info" | "warning" | "failed"; title: string; body: string } | null;
  usage: { running: string; vcpu: string; memory: string; active: string };
  egress: { allowOut: string[]; denyOut: string[] };
  labels: { template: string; size: string; network: string };
}

const TABS = [
  { id: "preview", label: "Preview" },
  { id: "checks", label: "Checks" },
  { id: "details", label: "Details" },
  { id: "history", label: "History" },
] as const;

export function SandboxWorkspace(props: WorkspaceProps) {
  const router = useRouter();
  const client = useMemo(() => new FarbaekSandboxClient({ baseUrl: "", workspaceId: props.orgId }), [props.orgId]);
  const { session } = props;
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("preview");
  const [busy, setBusy] = useState<"pause" | "resume" | "stop" | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = session.state === "ready";
  const transient = session.state === "requested" || session.state === "provisioning" || session.state === "stopping";

  // While a session is starting or stopping, follow its real state for up to two minutes.
  useEffect(() => {
    if (!transient) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      if (n > 40) window.clearInterval(id);
      else router.refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [transient, router]);

  async function act(kind: "pause" | "resume" | "stop") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "pause") await client.pause(session.id);
      else if (kind === "resume") await client.resume(session.id);
      else await client.stop(session.id);
      setConfirmStop(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof FarbaekApiError ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const ended = session.state === "terminated" || session.state === "expired" || session.state === "failed";
  const fileReason = !props.capabilities.filesystem ? "This runtime doesn't expose files." : !running ? "Files are available while the session runs." : null;
  const problems = props.executions.filter((e) => e.state === "failed" || e.state === "error" || e.state === "timed_out");

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 truncate text-[1.75rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.1rem]">{session.name}</h1>
            <SessionStateBadge state={session.state} />
          </div>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            {props.labels.template}, {props.labels.size}. {props.labels.network}.{" "}
            {ended ? (
              session.endedAt ? (
                <>
                  Ended <RelativeTime iso={session.endedAt} />.
                </>
              ) : null
            ) : (
              <>
                Ends <RelativeTime iso={session.expiresAt} /> at the latest.
              </>
            )}
          </p>
        </div>
        {!ended && props.canOperate ? (
          <div className="flex flex-wrap items-center gap-2">
            {props.capabilities.pauseResume && session.state === "ready" ? (
              <button type="button" onClick={() => void act("pause")} disabled={busy !== null} className={buttonClasses("secondary", "sm")}>
                <PauseIcon size={16} aria-hidden /> {busy === "pause" ? "Pausing…" : "Pause"}
              </button>
            ) : null}
            {props.capabilities.pauseResume && session.state === "paused" ? (
              <button type="button" onClick={() => void act("resume")} disabled={busy !== null} className={buttonClasses("accent", "sm")}>
                <PlayIcon size={16} aria-hidden /> {busy === "resume" ? "Resuming…" : "Resume"}
              </button>
            ) : null}
            {confirmStop ? (
              <span className="flex flex-wrap items-center gap-2 rounded-full border border-failed/30 bg-failed/[0.05] py-1 pl-4 pr-1">
                <span className="text-sm">Stop and destroy the sandbox?</span>
                <button type="button" onClick={() => void act("stop")} disabled={busy !== null} className={buttonClasses("danger", "sm")}>
                  {busy === "stop" ? "Stopping…" : "Stop"}
                </button>
                <button type="button" onClick={() => setConfirmStop(false)} className={buttonClasses("ghost", "sm")}>
                  Keep running
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmStop(true)} disabled={busy !== null || session.state === "stopping"} className={buttonClasses("secondary", "sm")}>
                <StopIcon size={16} aria-hidden /> Stop session
              </button>
            )}
          </div>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-sm border border-failed/30 bg-failed/[0.05] px-4 py-3 text-sm text-failed">
          {error}
        </p>
      ) : null}
      {props.notice ? (
        <div
          role="status"
          className={`flex gap-3 rounded-md border px-4 py-3 ${props.notice.tone === "failed" ? "border-failed/30 bg-failed/[0.04]" : props.notice.tone === "warning" ? "border-approval/30 bg-approval/[0.06]" : "border-info/25 bg-info/[0.05]"}`}
        >
          <WarningIcon size={18} weight="bold" className={`mt-0.5 shrink-0 ${props.notice.tone === "failed" ? "text-failed" : props.notice.tone === "warning" ? "text-approval" : "text-info"}`} aria-hidden />
          <div>
            <p className="text-sm font-medium">{props.notice.title}</p>
            <p className="mt-0.5 text-sm text-ink-2">{props.notice.body}</p>
          </div>
        </div>
      ) : null}

      <FilesPanel client={client} sessionId={session.id} canWrite={props.canOperate && running} readReason={fileReason} />

      <div className="h-[24rem]">
        <SandboxConsole
          client={client}
          sessionId={session.id}
          initial={props.executions}
          canRun={props.canOperate && running && props.runReason === null}
          disabledReason={props.runReason}
          canCancel={props.capabilities.cancel}
          onFinished={() => router.refresh()}
        />
      </div>

      <section aria-label="Session panels" className="rounded-md border border-line bg-surface shadow-e1">
        <div role="tablist" aria-label="Session panels" className="flex gap-1 overflow-x-auto border-b border-line p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`h-11 shrink-0 rounded-full px-4 text-sm ${tab === t.id ? "bg-ink font-medium text-surface" : "text-ink-2 hover:bg-surface-raised"}`}
            >
              {t.label}
              {t.id === "checks" && problems.length > 0 ? <span className="ml-1.5 tabular">({problems.length})</span> : null}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="p-5 sm:p-6">
          {tab === "preview" ? (
            <PreviewPanel
              client={client}
              sessionId={session.id}
              available={props.capabilities.previews && running && props.canOperate}
              reason={!props.capabilities.previews ? props.previewReason : !running ? "Previews work while the session runs." : !props.canOperate ? "Only the person who started this session, or an owner or admin, can open previews." : null}
            />
          ) : tab === "checks" ? (
            <ChecksPanel
              client={client}
              sessionId={session.id}
              task={props.task}
              receipts={props.receipts}
              problems={problems}
              canRun={props.canOperate && running && props.runReason === null}
              reason={props.runReason}
              onDone={() => router.refresh()}
            />
          ) : tab === "details" ? (
            <DetailsPanel client={client} session={session} usage={props.usage} egress={props.egress} metricsAvailable={props.capabilities.metrics} />
          ) : (
            <HistoryPanel events={props.events} me={props.me} />
          )}
        </div>
      </section>
    </div>
  );
}
