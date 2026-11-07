import { CheckCircleIcon, DownloadSimpleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Card } from "@/components/app/primitives";
import { FACT_LABELS, READINESS_LABELS, type ContextPassport, type FactStatus, type Readiness } from "@/core/realityloop/context-passport";

/** Each status is its word in its colour (ADR 0180); the word is always there, so colour is never alone. */
const FACT_TONE: Record<FactStatus, string> = {
  verified_current: "text-verified",
  possibly_stale: "text-approval",
  conflicting: "text-failed",
  inferred: "text-unverified",
  missing: "text-failed",
  unavailable: "text-ink-3",
};

const READINESS_LOOK: Record<Readiness, { icon: Icon | null; tone: string; ring: string }> = {
  ready: { icon: CheckCircleIcon, tone: "text-verified", ring: "border-verified/30 bg-verified/5" },
  ready_with_warnings: { icon: null, tone: "text-approval", ring: "border-approval/30 bg-approval/5" },
  not_ready: { icon: XCircleIcon, tone: "text-failed", ring: "border-failed/30 bg-failed/5" },
};

const SHOWN = 12;

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/**
 * Context Readiness (ADR 0116): what Farbaek knows about the task before the
 * agent starts, where each fact comes from, and what isn't confirmed.
 */
export function ContextReadinessCard({ passport, taskId }: { passport: ContextPassport; taskId: string }) {
  const look = READINESS_LOOK[passport.readiness];
  const counts = new Map<FactStatus, number>();
  for (const f of passport.facts) counts.set(f.status, (counts.get(f.status) ?? 0) + 1);
  const shown = passport.facts.slice(0, SHOWN);
  const total = passport.facts.length;
  const byStatus = [...counts.entries()].map(([status, n]) => `${n} ${FACT_LABELS[status].toLowerCase()}`);

  return (
    <Card id="readiness" className="scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">What Farbaek knows</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-ink-2">
            What Farbaek knows about this task before the agent starts, from the project&apos;s own files, the plan and the last checks. The agent and the plan drafter see these facts too.
          </p>
        </div>
        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${look.ring} ${look.tone}`}>
          {look.icon ? <look.icon size={16} weight="bold" aria-hidden /> : null}
          {READINESS_LABELS[passport.readiness]}
        </span>
      </div>

      {total > 0 ? (
        <p className="mt-4 text-sm text-ink-2">
          {total === 1 ? "1 fact" : `${total} facts`}: {list(byStatus)}.
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-line">
        {shown.map((f) => {
          const refs = f.sources.filter((src) => src.kind === "file").slice(0, 2);
          return (
            <li key={f.id} className="grid gap-1 py-3">
              <p className="text-sm text-ink">{f.statement}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-[0.75rem] text-ink-3">
                <span className={`font-medium ${FACT_TONE[f.status]}`}>{FACT_LABELS[f.status]}</span>
                {refs.map((r) => (
                  <span key={r.ref} className="truncate font-mono">
                    {r.ref}
                    {r.revision ? ` r${r.revision}` : ""}
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
      {passport.facts.length > SHOWN ? <p className="mt-2 text-[0.8125rem] text-ink-3">{passport.facts.length - SHOWN} more in the download.</p> : null}

      {passport.nextSteps.length ? (
        <div className="mt-5 rounded-sm border border-line bg-canvas-2 p-4">
          <h3 className="text-sm font-medium">Before the agent starts</h3>
          <ul className="mt-2 grid gap-1.5 text-sm text-ink-2">
            {passport.nextSteps.map((step) => (
              <li key={step} className="ml-4 list-disc marker:text-ink-3">
                {step}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <a href={`/app/tasks/${taskId}/passport`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline" download>
        <DownloadSimpleIcon size={16} aria-hidden />
        Download these facts as a file
      </a>
    </Card>
  );
}
