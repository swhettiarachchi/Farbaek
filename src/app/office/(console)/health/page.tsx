import { ArrowClockwiseIcon, CaretRightIcon, CheckCircleIcon, CircleDashedIcon, ProhibitIcon, QuestionIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice, PageHeader } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { deploymentConnections } from "@/server/admin/data";
import { liveRunsHere } from "@/server/cloud-agent/executor";
import { requireStaff } from "@/server/office/access";
import { loadHealth, serverFacts, type CheckState } from "@/server/office/health";

export const metadata: Metadata = { title: "Health" };

const LOOK: Record<CheckState, { icon: typeof CheckCircleIcon; word: string; tone: string; edge: string }> = {
  ok: { icon: CheckCircleIcon, word: "OK", tone: "text-verified", edge: "border-line" },
  attention: { icon: WarningIcon, word: "Needs a look", tone: "text-approval", edge: "border-approval/40" },
  unknown: { icon: QuestionIcon, word: "Unknown", tone: "text-ink-3", edge: "border-dashed border-line-strong/50" },
};

export default async function OfficeHealth() {
  const staff = await requireStaff();
  const now = new Date();
  const [health, connections] = [await loadHealth(staff.admin, now), deploymentConnections()];
  const facts = serverFacts();
  const attention = "checks" in health ? health.checks.filter((c) => c.state !== "ok").length : null;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Health"
        description="Is Farbaek working right now? Read live from the database and this server. Nothing here is estimated."
        actions={
          <Link href="/health" className={buttonClasses("secondary", "sm")}>
            <ArrowClockwiseIcon size={16} aria-hidden /> Check again
          </Link>
        }
      />

      {"error" in health ? (
        <p role="alert" className="flex items-start gap-3 rounded-lg border border-failed/35 bg-failed/[0.05] p-5 text-sm">
          <ProhibitIcon size={22} weight="bold" className="shrink-0 text-failed" aria-hidden />
          <span>
            <span className="block text-base font-medium text-ink">The platform check didn&apos;t complete</span>
            <span className="text-ink-2">{health.error}</span>
          </span>
        </p>
      ) : (
        <>
          <section
            aria-label="Summary"
            className={`flex flex-wrap items-center gap-4 rounded-lg border p-5 sm:p-6 ${attention === 0 ? "border-verified/30 bg-verified/[0.05]" : "border-approval/35 bg-approval/[0.06]"}`}
          >
            <span className={`relative flex size-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-e1 ${attention === 0 ? "text-verified" : "text-approval"}`}>
              {attention === 0 ? (
                <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-verified/40 motion-safe:animate-ping [animation-duration:2.4s]" />
              ) : null}
              {attention === 0 ? <CheckCircleIcon size={24} weight="fill" aria-hidden /> : <WarningIcon size={24} weight="fill" aria-hidden />}
            </span>
            <span className="grid gap-0.5">
              <span className="text-lg font-medium">{attention === 0 ? "Everything checked is working" : `${attention} ${attention === 1 ? "check needs" : "checks need"} a look`}</span>
              <span className="text-sm text-ink-2">
                Checked <LocalTime iso={now.toISOString()} />.
              </span>
            </span>
          </section>

          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {health.checks.map((c) => {
              const look = LOOK[c.state];
              const body = (
                <>
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm text-ink-2">{c.label}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${look.tone}`}>
                      <look.icon size={15} weight="fill" aria-hidden /> {look.word}
                    </span>
                  </span>
                  <span className="mt-2 block font-mono text-[1.6rem] font-medium leading-tight tracking-[-0.03em] tabular">{c.value}</span>
                  <span className="mt-2 block text-xs leading-relaxed text-ink-3">{c.detail}</span>
                </>
              );
              const cls = `block h-full rounded-md border bg-surface p-5 shadow-e1 ${look.edge}`;
              return (
                <li key={c.key}>
                  {c.href ? (
                    <Link href={c.href} className={`${cls} group transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-e2 motion-reduce:hover:translate-y-0`}>
                      {body}
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
                        Open <CaretRightIcon size={12} className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-medium">This server</h2>
          <p className="mt-1 text-sm text-ink-2">The process that answered this page. Railway may run more than one.</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="text-ink-3">{f.label}</dt>
                <dd className="mt-0.5 break-all font-mono text-ink">{f.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-ink-3">Runs on this server</dt>
              <dd className="mt-0.5 font-mono text-ink tabular">{liveRunsHere()}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Connections</h2>
          <p className="mt-1 text-sm text-ink-2">What this deployment is set up to do. Names only, never a key.</p>
          <ul className="mt-4 grid gap-3">
            {connections.map((c) => (
              <li key={c.name} className="flex items-start gap-3 text-sm">
                {c.on ? (
                  <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-label="On" />
                ) : (
                  <CircleDashedIcon size={18} className="mt-0.5 shrink-0 text-ink-3" aria-label="Off" />
                )}
                <span className="min-w-0">
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="block text-ink-2">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Notice>Sign-in email delivery isn&apos;t something this page can see. Supabase sends it through Spacemail; check a real sign-in to confirm it arrives.</Notice>
    </div>
  );
}
