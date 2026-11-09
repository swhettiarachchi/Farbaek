import { HardDrivesIcon, PlugsConnectedIcon } from "@phosphor-icons/react/ssr";
import { ExecutionModeBadge } from "@/components/app/execution";
import { CardTitle } from "@/components/app/primitives";
import { StatusGlyph, type Status } from "@/components/ui/status-badge";
import type { RuntimeHealth } from "@/core/sandbox/runtime";
import type { SandboxOverview } from "@/server/sandbox/service";

const CAPABILITY_LABELS: [keyof SandboxOverview["capabilities"], string][] = [
  ["filesystem", "files"],
  ["cancel", "cancelling commands"],
  ["pauseResume", "pause and resume"],
  ["previews", "private previews"],
  ["metrics", "resource readings"],
];

/** The runtime's product name, for a sentence; the id is for the server's own settings. */

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** Where code runs and whether that runtime answers right now. Never inferred from stored records. */
export function RuntimeStatus({ overview, health }: { overview: SandboxOverview; health: RuntimeHealth | null | "slow" }) {
  // The connection as one of the shared kinds (ADR 0183): answering is verified, slow needs a look, no runtime is off.
  const live: { kind: Status; tone: string; text: string } =
    health === null
      ? { kind: "off", tone: "text-ink-2", text: overview.connectedReason ?? "Not connected." }
      : health === "slow"
        ? { kind: "attention", tone: "text-caution", text: "The runtime didn't answer within 4 seconds." }
        : health.ok
          ? { kind: "verified", tone: "text-verified", text: `Runtime answered in ${health.latencyMs} ms.` }
          : { kind: "failed", tone: "text-failed", text: health.reason };
  const can = CAPABILITY_LABELS.filter(([key]) => overview.capabilities[key]).map(([, label]) => label);
  const cannot = CAPABILITY_LABELS.filter(([key]) => !overview.capabilities[key]).map(([, label]) => label);

  return (
    <section aria-labelledby="runtime-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle id="runtime-heading" icon={HardDrivesIcon}>
          Runtime
        </CardTitle>
        <ExecutionModeBadge mode={overview.execution} />
      </div>
      {overview.provider ? <p className="mt-1 text-sm text-ink-2">Code runs in a private throwaway computer, never on Farbaek&apos;s servers.</p> : null}
      <p className={`mt-4 flex items-start gap-2 text-sm ${live.tone}`}>
        <StatusGlyph status={live.kind} size={16} className="mt-0.5" />
        <span>{live.text}</span>
      </p>
      {overview.execution.mode === "review_only" && overview.provider ? (
        <p className="mt-2 text-sm text-ink-2">{overview.execution.reason}</p>
      ) : null}
      {overview.provider ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          {can.length ? `This runtime supports ${list(can)}` : "This runtime supports none of the extras"}
          {cannot.length ? `, but not ${list(cannot)}.` : "."}
        </p>
      ) : null}
      {overview.provider && overview.previewReason ? <p className="mt-3 text-xs text-ink-3">{overview.previewReason}</p> : null}
    </section>
  );
}

/**
 * Shown when no runtime is connected. A member reads one honest sentence. How
 * to connect one is for whoever runs the server, in docs/sandbox/README.md and
 * the staff console, never on a page customers see (ADR 0180).
 */
export function ConnectRuntimeSteps() {
  return (
    <section aria-labelledby="connect-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
      <CardTitle id="connect-heading" icon={PlugsConnectedIcon}>
        Test spaces aren&apos;t connected here
      </CardTitle>
      <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-2">
        Checks can&apos;t run on this server yet, and nothing is shown as if they had. Changes still wait for your review, and they stay unverified. Ask whoever runs this
        Farbaek to connect test spaces.
      </p>
    </section>
  );
}
