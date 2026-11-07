import { PlugsConnectedIcon, PlugsIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { ExecutionModeBadge } from "@/components/app/execution";
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
const PROVIDER_NAMES: Record<string, string> = { e2b: "E2B", vercel: "Vercel Sandbox" };

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

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
  const can = CAPABILITY_LABELS.filter(([key]) => overview.capabilities[key]).map(([, label]) => label);
  const cannot = CAPABILITY_LABELS.filter(([key]) => !overview.capabilities[key]).map(([, label]) => label);
  const provider = overview.provider ? (PROVIDER_NAMES[overview.provider] ?? overview.provider) : null;

  return (
    <section aria-labelledby="runtime-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="runtime-heading" className="text-lg font-medium">
          Runtime
        </h2>
        <ExecutionModeBadge mode={overview.execution} />
      </div>
      {provider ? <p className="mt-1 text-sm text-ink-2">Code runs on {provider}, in a private throwaway computer, never on Farbaek&apos;s servers.</p> : null}
      <p className={`mt-4 flex items-start gap-2 text-sm ${live.tone}`}>
        <live.icon size={18} weight="bold" className="mt-px shrink-0" aria-hidden />
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
      {overview.provider && overview.previewReason ? <p className="mt-3 text-xs text-ink-3">Previews: {overview.previewReason}</p> : null}
    </section>
  );
}

/**
 * Shown when no runtime is connected. A member reads one honest sentence; the
 * steps are for whoever runs this Farbaek, folded away so they never read as
 * something a member is meant to do.
 */
export function ConnectRuntimeSteps() {
  const steps: [string, string][] = [
    [
      "Choose a runtime you trust",
      "Vercel Sandbox (a free, hard-capped Hobby plan; no previews), or E2B: E2B Cloud, or E2B Embed on a Linux host with KVM that you control. Each gives every session its own private computer.",
    ],
    ["Connect it", "Run node scripts/setup-env.mjs sandbox and choose the runtime. It asks for the token or key with hidden input and generates the rest. Keys stay on the server."],
    ["Build the images (E2B only)", "pnpm sandbox:templates builds the Node.js and Python images in two sizes on E2B. Vercel Sandbox uses its managed image, so there's nothing to build."],
    ["Prove the isolation", "pnpm sandbox:smoke starts a sandbox, runs a harmless command, checks the network rules and cleans up. When it passes, set SANDBOX_ISOLATION_VERIFIED_AT."],
  ];
  return (
    <section aria-labelledby="connect-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
      <h2 id="connect-heading" className="text-lg font-medium">
        Test spaces aren&apos;t connected here
      </h2>
      <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-2">
        This Farbaek has no runtime connected yet, so checks can&apos;t run here and nothing is shown as if it had. Changes still wait for your review; they stay unverified. Ask
        whoever runs this Farbaek to connect one.
      </p>
      <details className="mt-4 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
          For whoever runs this server
        </summary>
        <p className="mt-2 max-w-[62ch] text-ink-2">The full guide is in docs/sandbox/README.md.</p>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/[0.08] text-sm font-medium text-accent tabular">{i + 1}</span>
              <div>
                <p className="text-[0.9375rem] font-medium">{title}</p>
                <p className="mt-0.5 text-sm text-ink-2">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
