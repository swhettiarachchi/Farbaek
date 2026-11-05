import { CheckCircleIcon, EyeIcon, MinusCircleIcon } from "@phosphor-icons/react/ssr";
import type { ExecutionMode } from "@/core/execution/sandbox";

/** The workspace's execution mode, stated plainly. */
export function ExecutionModeBadge({ mode }: { mode: ExecutionMode }) {
  return mode.mode === "sandboxed" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-verified/30 bg-verified/[0.05] px-3 py-1 text-sm font-medium text-verified">
      <CheckCircleIcon size={16} weight="fill" aria-hidden /> Test space · {mode.provider}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong/40 bg-surface-raised px-3 py-1 text-sm font-medium text-ink-2">
      <EyeIcon size={16} weight="bold" aria-hidden /> Review only
    </span>
  );
}

/** Required checks and whether they ran. Without a sandbox none run, and none count as passing. */
export function ChecksList({ checks, mode }: { checks: string[]; mode: ExecutionMode }) {
  if (checks.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        The plan lists no checks, so nothing can confirm the change. Add checks such as <code className="font-mono text-[13px]">pnpm test</code> to the plan.
      </p>
    );
  }
  return (
    <ul className="grid gap-2">
      {checks.map((c) => (
        <li key={c} className="flex items-center gap-3 rounded-sm border border-line px-3 py-2">
          <MinusCircleIcon size={18} className="shrink-0 text-unverified" aria-hidden />
          <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{c}</code>
          <span className="shrink-0 text-xs text-ink-3">{mode.mode === "review_only" ? "Not run" : "Waiting to run"}</span>
        </li>
      ))}
    </ul>
  );
}
