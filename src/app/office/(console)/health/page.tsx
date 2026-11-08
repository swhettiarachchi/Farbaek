import { ArrowClockwiseIcon, CaretRightIcon, CheckCircleIcon, HardDrivesIcon, PlugsConnectedIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import { deploymentConnections } from "@/server/admin/data";
import { liveRunsHere } from "@/server/cloud-agent/executor";
import { requireStaff } from "@/server/office/access";
import { loadHealth, serverFacts, type CheckState } from "@/server/office/health";

export const metadata: Metadata = { title: "Health" };

// Each check is its kind (ADR 0183): OK is verified, needs a look is attention, unknown is not checked yet.
const LOOK: Record<CheckState, { kind: Status; word: string; edge: string }> = {
  ok: { kind: "verified", word: "OK", edge: "border-line" },
  attention: { kind: "attention", word: "Needs a look", edge: "border-caution/35" },
  unknown: { kind: "unverified", word: "Unknown", edge: "border-line-2" },
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
            <ArrowClockwiseIcon size={16} weight="bold" aria-hidden /> Check again
          </Link>
        }
      />

      {"error" in health ? (
        <p role="alert" className="flex items-start gap-3 rounded-lg border border-failed/35 bg-surface p-5 text-sm">
          <WarningCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>
            <span className="block text-base font-medium text-ink">The platform check didn&apos;t complete</span>
            <span className="text-ink-2">{health.error}</span>
          </span>
        </p>
      ) : (
        <>
          <section
            aria-label="Summary"
            className={`flex flex-wrap items-center gap-4 rounded-lg border bg-surface p-5 shadow-e1 sm:p-6 ${attention === 0 ? "border-verified/30" : "border-caution/35"}`}
          >
            {/* A neutral callout; the icon's colour says which (ADR 0183). */}
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-raised ${attention === 0 ? "text-verified" : "text-caution"}`}>
              {attention === 0 ? <CheckCircleIcon size={24} weight="fill" aria-hidden /> : <WarningCircleIcon size={24} weight="fill" aria-hidden />}
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
                    <StatusBadge status={look.kind} label={look.word} />
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
                        Open <CaretRightIcon size={14} weight="bold" className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
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
          <CardTitle icon={HardDrivesIcon}>This server</CardTitle>
          <p className="mt-1 text-sm text-ink-2">The process that answered this page.</p>
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
          <CardTitle icon={PlugsConnectedIcon}>Connections</CardTitle>
          <p className="mt-1 text-sm text-ink-2">What this deployment is set up to do. Names only, never a key.</p>
          <ul className="mt-4 grid gap-3">
            {connections.map((c) => (
              <li key={c.name} className="flex items-start gap-3 text-sm">
                <StatusGlyph status={c.on ? "verified" : "off"} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="sr-only">{c.on ? "On: " : "Off: "}</span>
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
