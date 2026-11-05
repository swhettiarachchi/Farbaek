import { ArrowRightIcon, CheckCircleIcon, FlaskIcon, PauseCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { REASON_WORDS, type RehearsalSummary } from "@/core/trust/rehearsal";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function Verdict({ summary, since, replay }: { summary: RehearsalSummary; since: string; replay: boolean }) {
  const { verdict, total, wouldApply } = summary;
  if (verdict === "nothing_yet")
    return (
      <p className="flex items-start gap-2 text-[0.9375rem]">
        <FlaskIcon size={18} className="mt-0.5 shrink-0 text-simulated" aria-hidden />
        {replay ? (
          <span>No changes since <LocalTime iso={since} /> to replay.</span>
        ) : (
          <span>
            No changes yet since practice began <LocalTime iso={since} />. Each new change notes whether it would have applied on its own.
          </span>
        )}
      </p>
    );
  if (verdict === "none_would_apply")
    return (
      <p className="flex items-start gap-2 text-[0.9375rem]">
        <FlaskIcon size={18} className="mt-0.5 shrink-0 text-simulated" aria-hidden />
        <span>None of the {plural(total, "change", "changes")} would have applied on its own. So far, this setting would have changed nothing.</span>
      </p>
    );
  if (verdict === "would_have_paused")
    return (
      <p className="flex items-start gap-2 text-[0.9375rem]">
        <PauseCircleIcon size={18} weight="bold" className="mt-0.5 shrink-0 text-failed" aria-hidden />
        <span>This setting would have paused itself: a change it would have applied failed its checks.</span>
      </p>
    );
  if (verdict === "people_disagreed")
    return (
      <p className="flex items-start gap-2 text-[0.9375rem]">
        <WarningCircleIcon size={18} weight="bold" className="mt-0.5 shrink-0 text-approval" aria-hidden />
        <span>Someone discarded a change that would have applied on its own. Look at it before you turn this on.</span>
      </p>
    );
  return (
    <p className="flex items-start gap-2 text-[0.9375rem]">
      <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
      <span>
        Of the {plural(wouldApply, "change", "changes")} that would have applied on their own, none failed its checks and none was discarded.
      </span>
    </p>
  );
}

/**
 * Shadow mode's record (ADR 0075) on Settings: what level 2 would have done
 * since rehearsing began, set against what really happened. Every number
 * here is a simulated decision next to a real outcome, and says which. The
 * replay variant (ADR 0081) shows the same for past changes, predicted now,
 * with what it had to assume.
 */
export function RehearsalRecord({ summary, since, replay }: { summary: RehearsalSummary; since: string; replay?: { assumption: string; leftOut: number } }) {
  const o = summary.outcomes;
  const outcomes = [
    { n: o.verified, words: "passed their checks" },
    { n: o.partly, words: "partly passed" },
    { n: o.failed, words: "failed their checks" },
    { n: o.unchecked, words: "applied, not checked yet" },
    { n: o.discarded, words: "discarded by a person" },
    { n: o.pending, words: "still waiting for review" },
  ].filter((x) => x.n > 0);

  return (
    <section aria-labelledby={replay ? "replay-heading" : "rehearsal-heading"} className="mt-6 grid gap-4 rounded-md border border-dashed border-simulated/40 bg-simulated/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={replay ? "replay-heading" : "rehearsal-heading"} className="text-base font-medium">
          {replay ? "Replay of the last 30 days" : "Practice record"}
        </h3>
        <StatusBadge status="simulated" label={replay ? "Predicted from past changes" : "Simulated decisions"} />
      </div>

      <Verdict summary={summary} since={since} replay={Boolean(replay)} />

      {summary.total > 0 ? (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {[
              { label: "Changes", value: summary.total },
              { label: "Would have applied", value: summary.wouldApply },
              { label: "Would have waited", value: summary.wouldWait },
            ].map((s) => (
              <div key={s.label} className="rounded-sm border border-line bg-surface px-3 py-2.5">
                <dt className="text-xs text-ink-3">{s.label}</dt>
                <dd className="mt-0.5 text-xl font-medium tabular">{s.value.toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            {outcomes.length > 0 ? (
              <div>
                <p className="text-sm font-medium">What really happened to the ones that would have applied on their own</p>
                <ul className="mt-2 grid gap-1 text-sm text-ink-2">
                  {outcomes.map((x) => (
                    <li key={x.words}>
                      <span className="font-medium text-ink tabular">{x.n.toLocaleString("en-US")}</span> {x.words}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {summary.reasons.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Why the others would have waited</p>
                <ul className="mt-2 grid gap-1 text-sm text-ink-2">
                  {summary.reasons.map((r) => (
                    <li key={r.reason}>
                      <span className="font-medium text-ink tabular">{r.count.toLocaleString("en-US")}</span> {REASON_WORDS[r.reason]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {summary.example ? (
            <Link href={`/app/tasks/${summary.example.taskId}`} className="inline-flex min-h-11 items-center gap-1.5 justify-self-start text-sm font-medium text-accent hover:underline">
              {summary.example.kind === "failed" ? "See the change that failed" : "See the discarded change"} <ArrowRightIcon size={14} aria-hidden />
            </Link>
          ) : null}
        </>
      ) : null}

      {replay ? (
        <p className="text-xs leading-relaxed text-ink-3">
          Replayed now over changes since <LocalTime iso={since} />. {replay.assumption}
          {replay.leftOut > 0 ? ` ${plural(replay.leftOut, "change", "changes")} from the desktop agent ${replay.leftOut === 1 ? "is" : "are"} left out, since these never apply on their own.` : ""} Nothing was
          applied or changed: these are predictions from past changes, next to what really happened.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-ink-3">
          In practice mode since <LocalTime iso={since} />. Nothing applied on its own: these are simulated decisions, next to what people and checks really did.
        </p>
      )}
    </section>
  );
}
