import { CheckCircleIcon, MinusCircleIcon, PlugsConnectedIcon, PlugsIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { ExecutionModeBadge } from "@/components/app/execution";
import type { RuntimeHealth } from "@/core/sandbox/runtime";
import type { SandboxOverview } from "@/server/sandbox/service";

const CAPABILITY_LABELS: [keyof SandboxOverview["capabilities"], string][] = [
  ["filesystem", "Files"],
  ["cancel", "Cancel commands"],
  ["pauseResume", "Pause and resume"],
  ["previews", "Private previews"],
  ["metrics", "Resource metrics"],
];

/** Where code runs and whether that runtime answers right now. Never inferred from stored records. */
export function RuntimeStatus({ overview, health }: { overview: SandboxOverview; health: RuntimeHealth | null | "slow" }) {
  const live =
    health === null
      ? { icon: PlugsIcon, tone: "text-ink-3", text: overview.connectedReason ?? "Not connected." }
      : health === "slow"
        ? { icon: WarningIcon, tone: "text-approval", text: "The runtime didn't answer within 4 seconds." }
        : health.ok
          ? { icon: PlugsConnectedIcon, tone: "text-verified", text: `Runtime answered in ${health.latencyMs} ms.` }
          : { icon: WarningIcon, tone: "text-failed", text: health.reason };

  return (
    <section aria-labelledby="runtime-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="runtime-heading" className="text-lg font-medium">
          Runtime
        </h2>
        <ExecutionModeBadge mode={overview.execution} />
      </div>
      <p className="mt-1 text-sm text-ink-2">{overview.provider ? `${overview.provider}, Firecracker microVMs. Code runs there, never on Farbaek's servers.` : "No runtime is connected."}</p>
      <p className={`mt-4 flex items-start gap-2 text-sm ${live.tone}`}>
        <live.icon size={18} weight="bold" className="mt-px shrink-0" aria-hidden />
        <span>{live.text}</span>
      </p>
      {overview.execution.mode === "review_only" && overview.provider ? (
        <p className="mt-2 text-sm text-ink-2">{overview.execution.reason}</p>
      ) : null}
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="What this runtime supports">
        {CAPABILITY_LABELS.map(([key, label]) => {
          const on = overview.capabilities[key];
          const Glyph = on ? CheckCircleIcon : MinusCircleIcon;
          return (
            <li
              key={key}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${on ? "border-verified/30 text-verified" : "border-dashed border-line-strong/50 text-ink-3"}`}
            >
              <Glyph size={14} weight="bold" aria-hidden />
              {label}
              <span className="sr-only">{on ? ", available" : ", not available"}</span>
            </li>
          );
        })}
      </ul>
      {overview.provider && overview.previewReason ? <p className="mt-3 text-xs text-ink-3">Previews: {overview.previewReason}</p> : null}
    </section>
  );
}

/** The steps to connect a runtime, shown when none is. Plain instructions, no fake progress. */
export function ConnectRuntimeSteps() {
  const steps: [string, string][] = [
    ["Run a runtime you trust", "E2B Embed on a Linux host with KVM that you control (self-hosted), or E2B Cloud while you set that up. Both give each session its own microVM."],
    ["Connect it", "Run pnpm setup:env and choose sandbox: it asks for SANDBOX_PROVIDER, E2B_API_KEY and, for self-hosting, E2B_DOMAIN. Keys stay on the server."],
    ["Build the images", "pnpm sandbox:templates builds the Node.js and Python images in two sizes on your runtime."],
    ["Prove the isolation", "pnpm sandbox:smoke starts a sandbox, runs a harmless command, checks the network rules and cleans up. When it passes, set SANDBOX_ISOLATION_VERIFIED_AT."],
  ];
  return (
    <section aria-labelledby="connect-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
      <h2 id="connect-heading" className="text-lg font-medium">
        Connect a runtime
      </h2>
      <p className="mt-1 max-w-[62ch] text-sm text-ink-2">
        Until a runtime is connected and verified, Farbaek stays in Review Only: nothing runs, and nothing is shown as if it had. The full guide is in docs/sandbox/README.md.
      </p>
      <ol className="mt-5 grid gap-4 sm:grid-cols-2">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/[0.08] text-sm font-medium text-accent tabular">{i + 1}</span>
            <div>
              <p className="text-[15px] font-medium">{title}</p>
              <p className="mt-0.5 text-sm text-ink-2">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
