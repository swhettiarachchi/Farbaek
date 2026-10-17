import { CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon, PlusIcon, TerminalWindowIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, Notice, PageHeader, UsageMeter } from "@/components/app/primitives";
import { ExecutionStateBadge, SessionStateBadge } from "@/components/sandbox/badges";
import { ConnectRuntimeSteps, RuntimeStatus } from "@/components/sandbox/runtime-status";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { FAILURE_LABELS, type FailureCategory } from "@/core/sandbox/failures";
import type { SessionState } from "@/core/sandbox/lifecycle";
import { NETWORK_PROFILE_LABELS } from "@/core/sandbox/network";
import { SANDBOX_SIZES, SANDBOX_TEMPLATES } from "@/core/sandbox/templates";
import { formatDuration } from "@/core/sandbox/usage";
import { healthWithin, sandboxForPage } from "@/server/sandbox/page-context";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Sandbox" };
export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; states: SessionState[] }> = {
  all: { label: "All", states: [] },
  active: { label: "Running or starting", states: ["requested", "provisioning", "ready", "stopping"] },
  paused: { label: "Paused", states: ["paused"] },
  ended: { label: "Ended", states: ["terminated", "expired"] },
  failed: { label: "Failed", states: ["failed"] },
};
const SORTS = { newest: "Newest first", oldest: "Oldest first", name: "Name", expiring: "Ending soonest" } as const;
const PAGE_SIZE = 12;

const number = new Intl.NumberFormat("en-US");

export default async function SandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filter = one("state") in FILTERS ? one("state") : "all";
  const sort = (one("sort") in SORTS ? one("sort") : "newest") as keyof typeof SORTS;
  const q = one("q").slice(0, 80);
  const page = Math.max(1, Math.min(500, Number(one("page")) || 1));

  const sandbox = await sandboxForPage(ctx);
  if (!sandbox.ok) {
    return (
      <div className="grid gap-8">
        <PageHeader title="Sandbox" description="Isolated environments where code runs, outside Farbaek's servers." />
        <Notice tone="warning">{sandbox.reason}</Notice>
      </div>
    );
  }
  const { service, store, actor } = sandbox.value;
  const [overview, health, list, recent, failed] = await Promise.all([
    service.overview(actor),
    healthWithin(() => service.health()),
    store.listSessions(actor.orgId, { states: FILTERS[filter]!.states, search: q || undefined, sort, page, pageSize: PAGE_SIZE }),
    store.recentExecutions(actor.orgId, 8),
    store.listSessions(actor.orgId, { states: ["failed"], sort: "newest", page: 1, pageSize: 3 }),
  ]);
  const names = new Map(list.rows.map((s) => [s.id, s.name]));
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const canStart = overview.execution.mode === "sandboxed" && ctx.writes.enabled;
  const startReason = overview.execution.mode !== "sandboxed" ? overview.execution.reason : !ctx.writes.enabled ? ctx.writes.reason : null;
  const limits = overview.limits.limits;
  const href = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ state: filter, sort, ...(q ? { q } : {}), page: String(page), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    return `/app/sandbox?${p}`;
  };

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Sandbox"
        description="Isolated environments where code runs, outside Farbaek's servers. Every command is recorded with its real exit code."
        actions={
          canStart ? (
            <ButtonLink href="/app/sandbox/new" variant="accent" size="sm">
              <PlusIcon size={16} weight="bold" aria-hidden /> New session
            </ButtonLink>
          ) : (
            <span className="flex flex-col items-start gap-1 sm:items-end">
              <button type="button" disabled className={buttonClasses("accent", "sm")}>
                <PlusIcon size={16} weight="bold" aria-hidden /> New session
              </button>
              <span className="max-w-[36ch] text-xs text-ink-3 sm:text-right">{startReason}</span>
            </span>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <RuntimeStatus overview={overview} health={health} />
        <Card>
          <h2 className="text-lg font-medium">Usage this {overview.limits.periodKind === "trial" ? "trial" : "period"}</h2>
          <div className="mt-4 grid gap-5">
            <UsageMeter label="Sessions now" used={overview.activeSessions} limit={limits.maxConcurrentSessions} reached="At the limit. Stop a session to start another." />
            <UsageMeter
              label="Sandbox minutes"
              used={overview.minutesUsed}
              limit={limits.minutesPerPeriod}
              detail="Wall-clock running time of every session, the way runtimes bill it."
              reached="Used up for this period. New sessions start next period."
            />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-xs text-ink-3">vCPU time</dt>
              <dd className="mt-0.5 font-medium tabular">{formatDuration(overview.usage.vcpuSeconds)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Memory</dt>
              <dd className="mt-0.5 font-medium tabular">{number.format(Math.round(overview.usage.gibSeconds / 60))} GiB-min</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Commands ran</dt>
              <dd className="mt-0.5 font-medium tabular">{formatDuration(overview.usage.activeExecutionSeconds)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            Farbaek&apos;s own measurement, not a provider invoice. Plan limits: {limits.maxSessionMinutes} min per session, stops after {limits.idleMinutes} idle min, commands up to{" "}
            {Math.round(limits.maxCommandSeconds / 60)} min.
          </p>
        </Card>
      </div>

      {overview.execution.mode !== "sandboxed" && !overview.provider ? <ConnectRuntimeSteps /> : null}

      <section aria-labelledby="sessions-heading" className="grid gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="sessions-heading" className="text-xl font-medium tracking-[-0.02em]">
            Sessions <span className="text-base font-normal text-ink-3 tabular">({number.format(list.total)})</span>
          </h2>
          <form method="get" action="/app/sandbox" className="grid grid-cols-2 gap-2 sm:flex sm:items-end" role="search">
            <label className="col-span-2 grid gap-1 text-xs text-ink-2 sm:col-span-1">
              Search
              <span className="relative">
                <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Session name"
                  className="h-11 w-full rounded-sm border border-line bg-surface pl-9 pr-3 text-base text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:w-52 sm:text-sm"
                />
              </span>
            </label>
            <label className="grid gap-1 text-xs text-ink-2">
              Show
              <select name="state" defaultValue={filter} className="h-11 rounded-sm border border-line bg-surface px-3 text-base text-ink sm:text-sm">
                {Object.entries(FILTERS).map(([k, f]) => (
                  <option key={k} value={k}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-ink-2">
              Sort
              <select name="sort" defaultValue={sort} className="h-11 rounded-sm border border-line bg-surface px-3 text-base text-ink sm:text-sm">
                {Object.entries(SORTS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonClasses("secondary", "sm", "col-span-2 h-11 sm:col-span-1")}>
              Apply
            </button>
          </form>
        </div>

        {list.total === 0 ? (
          filter === "all" && !q ? (
            <EmptyState
              icon={TerminalWindowIcon}
              title="No sessions yet"
              action={
                canStart ? (
                  <ButtonLink href="/app/sandbox/new" variant="accent" size="sm">
                    <PlusIcon size={16} weight="bold" aria-hidden /> Start a session
                  </ButtonLink>
                ) : undefined
              }
            >
              {canStart
                ? "Start a Node.js or Python session, copy in a project's files, and run its builds and tests in an isolated microVM."
                : "Sessions appear here once a runtime is connected and verified. Nothing has run in this workspace."}
            </EmptyState>
          ) : (
            <p className="rounded-md border border-dashed border-line-strong/40 bg-surface px-5 py-8 text-center text-sm text-ink-2">
              No sessions match. <Link href="/app/sandbox" className="font-medium text-accent hover:underline">Clear the filters</Link>
            </p>
          )
        ) : (
          <>
            <ul className="grid gap-3 md:hidden">
              {list.rows.map((s) => (
                <li key={s.id}>
                  <Link href={`/app/sandbox/${s.id}`} className="block rounded-md border border-line bg-surface p-4 shadow-e1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate text-[15px] font-medium">{s.name}</span>
                      <SessionStateBadge state={s.state} />
                    </div>
                    <p className="mt-1 text-sm text-ink-2">
                      {SANDBOX_TEMPLATES[s.template].label}, {SANDBOX_SIZES[s.size].label.toLowerCase()}
                    </p>
                    <p className="mt-2 text-xs text-ink-3">
                      Started <RelativeTime iso={s.createdAt} />
                      {s.createdBy === actor.userId ? " by you" : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-hidden rounded-md border border-line bg-surface shadow-e1 md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas-2 text-xs text-ink-2">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Session</th>
                    <th scope="col" className="px-4 py-3 font-medium">State</th>
                    <th scope="col" className="px-4 py-3 font-medium">Network</th>
                    <th scope="col" className="px-4 py-3 font-medium">Started</th>
                    <th scope="col" className="px-4 py-3 font-medium">Last activity</th>
                    <th scope="col" className="px-4 py-3 font-medium">Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas-2">
                      <td className="max-w-[16rem] px-4 py-3">
                        <Link href={`/app/sandbox/${s.id}`} className="block truncate font-medium text-ink hover:text-accent">
                          {s.name}
                        </Link>
                        <span className="text-xs text-ink-3">
                          {SANDBOX_TEMPLATES[s.template].label}, {SANDBOX_SIZES[s.size].label.toLowerCase()}
                          {s.createdBy === actor.userId ? ", yours" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <SessionStateBadge state={s.state} />
                      </td>
                      <td className="px-4 py-3 text-ink-2">{NETWORK_PROFILE_LABELS[s.network].title}</td>
                      <td className="px-4 py-3 text-ink-2">
                        <RelativeTime iso={s.createdAt} />
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        <RelativeTime iso={s.lastActivityAt} />
                      </td>
                      <td className="px-4 py-3 text-ink-2">{s.endedAt ? <>Ended <RelativeTime iso={s.endedAt} /></> : <RelativeTime iso={s.expiresAt} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <nav aria-label="Session pages" className="flex items-center justify-between gap-3 text-sm">
                {page > 1 ? (
                  <Link href={href({ page: page - 1 })} className={buttonClasses("secondary", "sm")}>
                    <CaretLeftIcon size={16} aria-hidden /> Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-ink-2 tabular">
                  Page {page} of {pages}
                </span>
                {page < pages ? (
                  <Link href={href({ page: page + 1 })} className={buttonClasses("secondary", "sm")}>
                    Next <CaretRightIcon size={16} aria-hidden />
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        )}
      </section>

      {recent.length > 0 || failed.rows.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {recent.length > 0 ? (
            <Card>
              <h2 className="text-lg font-medium">Recent commands</h2>
              <ul className="mt-4 grid gap-2">
                {recent.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-sm border border-line px-3 py-2">
                    <ExecutionStateBadge state={e.state} exitCode={e.exitCode} />
                    <Link href={`/app/sandbox/${e.sessionId}`} className="min-w-0 flex-1 truncate font-mono text-[13px] hover:text-accent" title={e.command}>
                      {e.command}
                    </Link>
                    <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">{names.get(e.sessionId) ?? ""}</span>
                    <span className="shrink-0 text-xs text-ink-3 tabular">{e.durationMs !== null ? formatDuration(e.durationMs / 1000) : "running"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {failed.rows.length > 0 ? (
            <Card>
              <h2 className="text-lg font-medium">Failed sessions</h2>
              <ul className="mt-4 grid gap-3">
                {failed.rows.map((s) => {
                  const label = FAILURE_LABELS[(s.failureCategory ?? "provider_unavailable") as FailureCategory] ?? FAILURE_LABELS.provider_unavailable;
                  return (
                    <li key={s.id} className="rounded-sm border border-failed/25 bg-failed/[0.04] px-4 py-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-failed">
                        <WarningIcon size={16} weight="bold" aria-hidden /> {label.title}
                      </p>
                      <p className="mt-1 text-sm text-ink">
                        <Link href={`/app/sandbox/${s.id}`} className="font-medium hover:text-accent">
                          {s.name}
                        </Link>
                        {s.failureMessage ? `: ${s.failureMessage}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-ink-2">{label.action}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
