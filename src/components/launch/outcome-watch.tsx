import { CheckCircleIcon, CircleDashedIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import type { WatchView } from "@/server/launch/watch-store";
import { WatchToggle } from "./watch-toggle";

const SLOTS = 24;
// Failed checks are striped as well as red, so the strip never relies on colour alone.
const FAILED_STRIPES = "repeating-linear-gradient(135deg, var(--color-failed) 0 3px, color-mix(in oklab, var(--color-failed) 45%, var(--color-surface)) 3px 6px)";

function Badge({ watch }: { watch: WatchView | null }) {
  if (!watch)
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-xs text-ink-2">
        <CircleDashedIcon size={14} aria-hidden /> Off
      </span>
    );
  if (watch.state === "breached")
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-failed/40 px-3 text-xs font-medium text-failed">
        <WarningIcon size={14} weight="bold" aria-hidden /> Needs a look since <RelativeTime iso={watch.breachedAt!} />
      </span>
    );
  if (watch.state === "ok")
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-verified/40 px-3 text-xs font-medium text-verified">
        <CheckCircleIcon size={14} weight="fill" aria-hidden /> Answering
      </span>
    );
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-approval/40 px-3 text-xs font-medium text-approval">
      Waiting for the first check
    </span>
  );
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
          <h2 id="watch-title" className="text-lg font-medium">
            Outcome watch
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink-2">
            Farbaek checks what&apos;s live every hour: the Farbaek Site against exactly the version that should be live, or the address of the latest launch to Vercel or Netlify. Two failed checks in a
            row mean it&apos;s down, and whoever turned the watch on hears by email and on their devices, then again when it&apos;s back.
          </p>
        </div>
        <Badge watch={watch} />
      </div>

      {watch ? (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <div className="flex h-7 items-end gap-[3px]" aria-hidden>
              {Array.from({ length: empty }, (_, i) => (
                <span key={`e${i}`} className="h-2 flex-1 rounded-[3px] border border-dashed border-line" />
              ))}
              {checks.map((c, i) => (
                <span
                  key={`${c.at}-${i}`}
                  title={`${new Date(c.at).toUTCString()}: ${c.ok ? "answering" : "failed"}${c.detail ? `. ${c.detail}` : ""}`}
                  className={`flex-1 rounded-[3px] ${c.ok ? "h-7 bg-verified/70" : "h-4"}`}
                  style={c.ok ? undefined : { backgroundImage: FAILED_STRIPES }}
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
