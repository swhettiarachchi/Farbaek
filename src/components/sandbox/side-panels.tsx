"use client";

import { ArrowsClockwiseIcon, CheckCircleIcon, ReceiptIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { JsonView } from "@/components/code/json-view";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { FAILURE_LABELS, type FailureCategory } from "@/core/sandbox/failures";
import { EXECUTION_STATE_LABELS } from "@/core/sandbox/lifecycle";
import { FarbaekApiError, type Execution, type FarbaekSandboxClient, type ResourceSample, type SandboxSession } from "@/sdk/sandbox-client";

// Status is its word in its colour and border (ADR 0180); a mark only for how it ended.
const RECEIPT_STATUS = {
  verified: { label: "Verified", icon: CheckCircleIcon, className: "text-verified border-verified/40" },
  partially_verified: { label: "Partly verified", icon: WarningIcon, className: "text-approval border-approval/40" },
  failed: { label: "Failed", icon: XCircleIcon, className: "text-failed border-failed/40" },
  unverified: { label: "Not verified", icon: null, className: "text-unverified border-unverified/60 border-dashed" },
} as const;

/** The runtime's words for a person: product names, and what "isolation" means. The ids are for the server's settings. */
const PROVIDER_WORDS: Record<string, string> = { e2b: "E2B", E2B: "E2B", vercel: "Vercel Sandbox" };
const ISOLATION_WORDS: Record<string, string> = { microvm: "its own private computer", container: "its own container", process: "its own process" };
const SIZE_WORDS: Record<string, string> = { small: "small", medium: "medium", large: "large" };
const CLEANUP_WORDS: Record<string, string> = { pending: "not yet", done: "done", failed: "failed", not_needed: "not needed" };

export interface ReceiptSummary {
  digest: string;
  status: keyof typeof RECEIPT_STATUS;
  createdAt: string;
  statement: unknown;
}

export interface TaskSummary {
  id: string;
  title: string;
  state: string;
  checks: string[];
}

export function ChecksPanel({
  client,
  sessionId,
  task,
  receipts,
  problems,
  canRun,
  reason,
  onDone,
}: {
  client: FarbaekSandboxClient;
  sessionId: string;
  task: TaskSummary | null;
  receipts: ReceiptSummary[];
  problems: Execution[];
  canRun: boolean;
  reason: string | null;
  onDone: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const r = await client.runChecks(sessionId);
      setResult({ tone: "info", text: `${r.passed} of ${r.total} ${r.total === 1 ? "check" : "checks"} passed, and that's recorded. This doesn't mark the task verified. Its own Run the checks does that, in a fresh test space nobody can change.` });
      onDone();
    } catch (e) {
      setResult({ tone: "error", text: e instanceof FarbaekApiError ? e.message : "The checks couldn't run." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section>
        <h3 className="text-base font-medium">Plan checks</h3>
        {task ? (
          <>
            <p className="mt-1 text-sm text-ink-2">
              Linked to <span className="font-medium text-ink">{task.title}</span>. Each check runs here with its real exit code, and what happened is recorded. This is for trying things, so it doesn&apos;t mark the task verified. To do that, use Run the checks on the task&apos;s page, which runs them in a fresh test space nobody can change.
            </p>
            {task.checks.length ? (
              <ul className="mt-3 grid gap-1.5">
                {task.checks.map((c) => (
                  <li key={c} className="break-all rounded-sm border border-line px-3 py-2 font-mono text-[0.8125rem]">
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-3">The approved plan lists no checks.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void run()} disabled={!canRun || running || task.checks.length === 0} className={buttonClasses("accent", "sm")}>
                {running ? "Running checks…" : "Run checks"}
              </button>
              {!canRun && reason ? <span className="text-xs text-ink-3">{reason}</span> : null}
            </div>
            {result ? (
              <p role={result.tone === "error" ? "alert" : "status"} className={`mt-3 text-sm ${result.tone === "error" ? "text-failed" : "text-ink"}`}>
                {result.text}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-2">This session isn&apos;t linked to a task. Start a session from a task to run its plan&apos;s checks here.</p>
        )}
      </section>

      <section>
        <h3 className="text-base font-medium">Receipts</h3>
        {receipts.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No receipts yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {receipts.map((r) => {
              const s = RECEIPT_STATUS[r.status];
              return (
                <li key={r.digest} className="rounded-sm border border-line">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2">
                      <ReceiptIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
                      <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${s.className}`}>
                        {s.icon ? <s.icon size={14} weight="bold" aria-hidden /> : null} {s.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-2" title={`sha256:${r.digest}`}>
                        Signed record
                      </span>
                      <span className="shrink-0 text-xs text-ink-3">
                        <RelativeTime iso={r.createdAt} />
                      </span>
                    </summary>
                    <div className="max-h-80 overflow-auto rounded-b-sm bg-media p-3 text-xs">
                      <JsonView value={r.statement} label={`Receipt ${r.digest.slice(0, 12)}`} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-base font-medium">Problems</h3>
        {problems.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No failed commands in this session.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {problems.slice(0, 5).map((e) => (
              <li key={e.id} className="rounded-sm border border-failed/25 bg-failed/[0.04] px-3 py-2">
                <p className="flex items-center gap-2 text-sm">
                  <XCircleIcon size={16} weight="bold" className="shrink-0 text-failed" aria-hidden />
                  <code className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]" title={e.command}>
                    {e.command}
                  </code>
                  <span className="shrink-0 text-xs text-failed">{e.exitCode !== null ? `Failed (exit ${e.exitCode})` : EXECUTION_STATE_LABELS[e.state]}</span>
                </p>
                {e.exitCode === null && e.failure && Object.hasOwn(FAILURE_LABELS, e.failure) ? <p className="mt-1 text-xs text-ink-2">{FAILURE_LABELS[e.failure as FailureCategory].title}.</p> : null}
                {e.stderr ? <pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap break-words font-mono text-xs text-ink-2">{e.stderr.slice(-600)}</pre> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  return `${Math.round(n / 1024 ** 2)} MiB`;
}

export function DetailsPanel({
  client,
  session,
  usage,
  egress,
  metricsAvailable,
}: {
  client: FarbaekSandboxClient;
  session: SandboxSession;
  usage: { running: string; vcpu: string; memory: string; active: string };
  egress: { allowOut: string[]; denyOut: string[] };
  metricsAvailable: boolean;
}) {
  const [sample, setSample] = useState<ResourceSample | null>(session.metrics);
  const [state, setState] = useState<"idle" | "loading" | "none" | "error">("idle");

  async function refresh() {
    setState("loading");
    try {
      const s = await client.metrics(session.id);
      if (s) {
        setSample(s);
        setState("idle");
      } else setState("none");
    } catch {
      setState("error");
    }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{value}</dd>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <dl>
        {row("Runtime", `${PROVIDER_WORDS[session.provider] ?? session.provider}, ${ISOLATION_WORDS[session.isolation] ?? session.isolation}`)}
        {row("Environment", `${session.template === "node-ts" ? "Node.js and TypeScript" : "Python"}, ${SIZE_WORDS[session.size] ?? session.size}`)}
        {row("Requested", `${session.resources.requested.vcpu} vCPU, ${session.resources.requested.memoryMiB} MiB`)}
        {row("Reported", session.resources.reported ? `${session.resources.reported.vcpu} vCPU, ${session.resources.reported.memoryMiB ?? "?"} MiB` : "Not reported by the runtime")}
        {row("Outbound allowed", egress.allowOut.length ? <span className="break-all font-mono text-xs">{egress.allowOut.join(", ")}</span> : "Nothing")}
        {row("Always blocked", <span className="break-all font-mono text-xs">{egress.denyOut.join(", ")}</span>)}
        {row("Started", <LocalTime iso={session.createdAt} />)}
        {row(session.endedAt ? "Ended" : "Ends by", <LocalTime iso={session.endedAt ?? session.expiresAt} />)}
        {row("Cleanup", `${CLEANUP_WORDS[session.cleanup.status] ?? session.cleanup.status.replace(/_/g, " ")}${session.cleanup.attempts ? `, ${session.cleanup.attempts} attempt${session.cleanup.attempts === 1 ? "" : "s"}` : ""}`)}
        {row("Project files", session.snapshot ? <span title={`sha256:${session.snapshot.sha256}`}>{session.snapshot.files} files copied in, recorded with their digest</span> : "None copied in")}
      </dl>
      <div className="grid content-start gap-4">
        <div className="rounded-md border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-medium">Resources now</h3>
            <button type="button" onClick={() => void refresh()} disabled={!metricsAvailable || state === "loading" || session.state !== "ready"} className={buttonClasses("secondary", "sm")}>
              <ArrowsClockwiseIcon size={16} aria-hidden /> {state === "loading" ? "Reading…" : "Read now"}
            </button>
          </div>
          {sample ? (
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-3">CPU</dt>
                <dd className="font-medium tabular">{sample.cpuPct}% of {sample.cpuCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Memory</dt>
                <dd className="font-medium tabular">
                  {bytes(sample.memUsedBytes)} / {bytes(sample.memTotalBytes)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Disk</dt>
                <dd className="font-medium tabular">
                  {bytes(sample.diskUsedBytes)} / {bytes(sample.diskTotalBytes)}
                </dd>
              </div>
              <p className="col-span-3 text-xs text-ink-3">
                Sampled by the runtime <RelativeTime iso={sample.at} />.
              </p>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink-3">
              {state === "none"
                ? "The runtime has no sample yet. It collects one every few seconds."
                : state === "error"
                  ? "Reading metrics failed."
                  : metricsAvailable
                    ? "No sample taken yet."
                    : "This runtime doesn't report metrics."}
            </p>
          )}
        </div>
        <div className="rounded-md border border-line p-4">
          <h3 className="text-base font-medium">This session&apos;s usage</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink-3">Running time</dt>
              <dd className="font-medium tabular">{usage.running}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Time running commands</dt>
              <dd className="font-medium tabular">{usage.active}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">vCPU time</dt>
              <dd className="font-medium tabular">{usage.vcpu}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Memory</dt>
              <dd className="font-medium tabular">{usage.memory}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink-3">Provisioned time is billed whether or not a command runs. Farbaek&apos;s measurement, not an invoice.</p>
        </div>
      </div>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  "session.requested": "Requested",
  "session.provision": "Starting",
  "session.provisioned": "Running",
  "session.pause": "Paused",
  "session.resume": "Resumed",
  "session.stop": "Stop requested",
  "session.expire": "Time or idle limit reached",
  "session.finish_termination": "Terminated",
  "session.finish_expiry": "Expired",
  "session.fail": "Failed",
  "execution.started": "Command started",
  "execution.finished": "Command finished",
  "execution.cancel_requested": "Cancel requested",
  "preview.opened": "Preview opened",
  "preview.revoked": "Preview closed",
  "receipt.recorded": "Receipt recorded",
  "cleanup.done": "Test space destroyed",
  "cleanup.failed": "Cleanup failed, will retry",
};

export function HistoryPanel({ events, me }: { events: { id: number; event: string; actorId: string | null; occurredAt: string; detail: Record<string, unknown> }[]; me: string }) {
  if (events.length === 0) return <p className="text-sm text-ink-3">No history yet.</p>;
  return (
    <ol className="grid gap-0">
      {events.map((e) => (
        <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line py-2 last:border-0">
          <span className="text-sm">
            {EVENT_LABELS[e.event] ?? e.event}
            <span className="text-ink-3">
              {" "}
              by {e.actorId === null ? "Farbaek" : e.actorId === me ? "you" : "a teammate"}
              {typeof e.detail.state === "string" ? `, ${String(e.detail.state).replace("_", " ")}` : ""}
              {typeof e.detail.exit_code === "number" ? `, exit ${e.detail.exit_code}` : ""}
            </span>
          </span>
          <span className="text-xs text-ink-3">
            <RelativeTime iso={e.occurredAt} />
          </span>
        </li>
      ))}
    </ol>
  );
}
