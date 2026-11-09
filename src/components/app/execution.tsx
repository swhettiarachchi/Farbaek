import { StatusBadge, StatusGlyph } from "@/components/ui/status-badge";
import type { ExecutionMode } from "@/core/execution/sandbox";

/** The workspace's execution mode, stated plainly: a connected test space, or review only with nothing to run checks. */
export function ExecutionModeBadge({ mode }: { mode: ExecutionMode }) {
  return mode.mode === "sandboxed" ? <StatusBadge status="verified" label="Test space" /> : <StatusBadge status="off" label="Review only" />;
}

/** Required checks and whether they ran. Without a sandbox none run, and none count as passing. */
export function ChecksList({ checks, mode }: { checks: string[]; mode: ExecutionMode }) {
  if (checks.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        The plan lists no checks, so nothing can confirm the change. Add checks such as <code className="font-mono text-label">pnpm test</code> to the plan.
      </p>
    );
  }
  // Not run here at all is "not yet"; waiting for a test space is waiting on a system (ADR 0183).
  const reviewOnly = mode.mode === "review_only";
  return (
    <ul className="grid gap-2">
      {checks.map((c) => (
        <li key={c} className="flex items-center gap-3 rounded-sm border border-line px-3 py-2">
          <StatusGlyph status={reviewOnly ? "unverified" : "pending"} />
          <code className="min-w-0 flex-1 truncate font-mono text-label">{c}</code>
          <span className="shrink-0 text-xs text-ink-3">{reviewOnly ? "Not run" : "Waiting to run"}</span>
        </li>
      ))}
    </ul>
  );
}
