import { PulseIcon } from "@phosphor-icons/react/ssr";
import { CardTitle } from "@/components/app/primitives";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import type { WatchView } from "@/server/launch/watch-store";
import { WatchToggle } from "./watch-toggle";

const SLOTS = 24;

// The state is its kind's chip (ADR 0183); the fact beside it is a line, not part of the chip.
function Badge({ watch }: { watch: WatchView | null }) {
  if (!watch) return <StatusBadge status="off" label="Off" />;
  if (watch.state === "breached")
    return (
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge status="failed" label="Down" />
        <span className="text-xs text-ink-3">
          Down since <RelativeTime iso={watch.breachedAt!} />
        </span>
      </span>
    );
  if (watch.state === "ok") return <StatusBadge status="verified" label="Answering" />;
  return <StatusBadge status="pending" label="Waiting for the first check" />;
}

/**
 * Outcome watch on the Launch page (ADR 0080): Farbaek keeps checking what's
 * live every hour and says when it goes down or comes back. The strip shows
 * the last 24 checks, oldest on the left.
 */
export function OutcomeWatch({ projectId, watch, disabledReason }: { projectId: string; watch: WatchView | null; disabledReason: string | null }) {
  const checks = [...(watch?.history ?? [])].reverse();
  const answered = checks.filter((c) => c.ok).length;
  const empty = Math.max(0, SLOTS - checks.length);

  return (
    <section aria-labelledby="watch-title" className="grid gap-4 rounded-lg border border-line bg-surface p-5 shadow-e1 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle id="watch-title" icon={PulseIcon}>
            Outcome watch
          </CardTitle>
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink-2">
            Farbaek checks what&apos;s live every hour. A Farbaek Site has to answer with exactly the version that should be live. A launch to your own host has to answer at its
            address. Two failed checks in a row mean it&apos;s down. Whoever turned the watch on hears by email and on their devices, and again when it&apos;s back.
          </p>
        </div>
        <Badge watch={watch} />
      </div>

      {watch ? (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            {/* A check that answered is a full bar and a failed one a short bar, so the strip never relies on colour alone. */}
            <div className="flex h-7 items-end gap-[3px]" aria-hidden>
              {Array.from({ length: empty }, (_, i) => (
                <span key={`e${i}`} className="h-1.5 flex-1 rounded-[3px] bg-line" />
              ))}
              {checks.map((c, i) => (
                <span
                  key={`${c.at}-${i}`}
                  title={`${new Date(c.at).toUTCString()}: ${c.ok ? "answering" : "failed"}${c.detail ? `. ${c.detail}` : ""}`}
                  className={`flex-1 rounded-[3px] ${c.ok ? "h-7 bg-verified/70" : "h-3.5 bg-failed"}`}
                />
              ))}
            </div>
            <p className="text-xs text-ink-3">
              {checks.length === 0 ? "No checks yet: the first runs within the hour." : `${answered} of the last ${checks.length} ${checks.length === 1 ? "check" : "checks"} answered. Oldest on the left.`}
            </p>
          </div>
          {watch.lastCheckedAt ? (
            <p className="text-sm text-ink-2">
              Last checked <LocalTime iso={watch.lastCheckedAt} />
              {watch.lastDetail ? `: ${watch.lastDetail}` : "."}
            </p>
          ) : null}
        </div>
      ) : null}

      <WatchToggle projectId={projectId} on={watch !== null} disabledReason={disabledReason} />
    </section>
  );
}
