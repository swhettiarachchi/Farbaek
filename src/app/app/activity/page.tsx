import {
  ChartPieSliceIcon,
  ClockCounterClockwiseIcon,
  DesktopIcon,
  DownloadSimpleIcon,
  FolderSimpleIcon,
  GitDiffIcon,
  GlobeIcon,
  InfoIcon,
  LifebuoyIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { ACTIVITY_CATEGORIES, type ActivityCategory } from "@/core/workspace/activity";
import { loadActivity } from "@/server/workspace/activity";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Activity" };

const PAGE = 50;

const ICONS: Record<ActivityCategory, Icon> = {
  people: UsersIcon,
  projects: FolderSimpleIcon,
  changes: GitDiffIcon,
  agents: DesktopIcon,
  sites: GlobeIcon,
  trust: ShieldCheckIcon,
  billing: ChartPieSliceIcon,
  farbaek: LifebuoyIcon,
};

const isCategory = (v: unknown): v is ActivityCategory => typeof v === "string" && ACTIVITY_CATEGORIES.some((c) => c.id === v);

/**
 * The workspace's activity log (ADR 0119): what the audit log recorded, who
 * did it and when, newest first, by category, with a CSV download. Every
 * member can read it; row security decides which events reach them.
 */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const category = isCategory(query.category) ? query.category : null;
  const before = typeof query.before === "string" && /^\d{1,18}$/.test(query.before) ? Number(query.before) : null;
  // One more than a page, to know whether there are older ones.
  const rows = await loadActivity(ctx, ctx.current.id, { category, before, limit: PAGE + 1 });
  const shown = rows.slice(0, PAGE);
  const older = rows.length > PAGE ? shown.at(-1)!.id : null;
  const link = (c: ActivityCategory | null, b: number | null = null) => {
    const params = new URLSearchParams();
    if (c) params.set("category", c);
    if (b !== null) params.set("before", String(b));
    const s = params.toString();
    return s ? `/app/activity?${s}` : "/app/activity";
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Activity"
        description="What happened in this workspace, from its audit log: who did it and when. Every member can read it."
        actions={
          <a href={`/app/activity/export${category ? `?category=${category}` : ""}`} download className={buttonClasses("secondary", "sm")}>
            <DownloadSimpleIcon size={16} aria-hidden /> Download CSV
          </a>
        }
      />

      <nav aria-label="Filter activity" className="-mx-1 flex flex-wrap gap-2 px-1">
        {[{ id: null, label: "Everything" }, ...ACTIVITY_CATEGORIES].map((c) => {
          const current = c.id === category;
          return (
            <Link
              key={c.id ?? "all"}
              href={link(c.id)}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors duration-150 ${current ? "border-transparent bg-primary font-medium text-on-primary" : "border-line bg-surface text-ink-2 hover:text-ink"}`}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <EmptyState icon={ClockCounterClockwiseIcon} title={before ? "Nothing older" : "Nothing recorded yet"}>
          {before
            ? "That's the start of this workspace's activity."
            : category
              ? "Nothing in this category yet. Choose another one, or Everything."
              : "Creating projects, changing files, approving changes and pairing agents all show here."}
        </EmptyState>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
          {shown.map((r) => {
            const RowIcon = r.category ? ICONS[r.category] : InfoIcon;
            const details = Object.keys(r.metadata).length > 0;
            return (
              <li key={r.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-2">
                  <RowIcon size={18} aria-hidden />
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="text-[15px] leading-snug">
                    {r.href ? (
                      <Link href={r.href} className="flex min-h-11 items-center underline decoration-line-strong/50 underline-offset-4 hover:decoration-ink">
                        {r.text}
                      </Link>
                    ) : (
                      r.text
                    )}
                  </p>
                  <p className="text-xs text-ink-3">
                    <RelativeTime iso={r.occurredAt} />{" "}
                    <span className="hidden sm:inline">
                      (<LocalTime iso={r.occurredAt} />)
                    </span>
                  </p>
                  {details ? (
                    <details className="group">
                      <summary className="inline-flex min-h-11 min-w-11 cursor-pointer items-center text-xs text-ink-2 hover:text-ink">Details</summary>
                      <pre className="overflow-x-auto rounded-sm border border-line bg-surface-sunken p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-ink-2">
                        {JSON.stringify({ action: r.action, target: r.target, ...r.metadata }, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {older !== null ? (
        <div>
          <ButtonLink href={link(category, older)} variant="secondary" size="sm">
            Show older
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
