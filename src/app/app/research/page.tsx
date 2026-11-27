import { ArrowRightIcon, CalendarCheckIcon, FolderSimpleIcon, MagnifyingGlassIcon } from "@/components/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardTitle, EmptyState, Notice } from "@/components/app/primitives";
import { ResearchBox } from "@/components/research/research-box";
import { LocalTime } from "@/components/ui/local-time";
import { PAGE_STACK } from "@/components/ui/surfaces";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { sampleResearch } from "@/content/research-samples";
import { checksLine, researchLine, sitesLine, type ResearchItem } from "@/core/research/library";
import { listResearch, type ResearchLists } from "@/server/research/library";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Research" };

/** One piece of research: its question, what it was, how its citations checked, where it read, when, and its project. */
function Row({ item, project, repeats = false }: { item: ResearchItem; project: string | undefined; repeats?: boolean }) {
  const checks = checksLine(item.checks);
  const sites = sitesLine(item);
  return (
    <li>
      <Link
        href={`/app/chat/${item.conversationId}`}
        className="group grid h-full gap-2 rounded-md border border-line bg-surface p-4 shadow-e1 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-e2 sm:p-5"
      >
        <span className="flex items-start gap-3">
          <span className="line-clamp-2 min-w-0 flex-1 text-body font-medium text-ink">{item.title}</span>
          <ArrowRightIcon size={16} weight="bold" className="mt-1 shrink-0 text-ink-3 motion-safe:transition-transform motion-safe:duration-200 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
        </span>
        <span className="text-sm leading-relaxed text-ink-2">
          {researchLine(item)}
          {checks ? ` ${checks}` : ""}
        </span>
        {sites ? <span className="truncate text-sm text-ink-3">{sites}</span> : null}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>
            {repeats ? "Last checked " : ""}
            <LocalTime iso={item.at} date />
          </span>
          {project ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <FolderSimpleIcon size={14} weight="bold" className="shrink-0" aria-hidden />
              <span className="truncate">{project}</span>
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/**
 * Research (stage 288, ADR 0296): a box that starts a piece of research in Chat, and everything this person has
 * researched, findable again. Each row is an answer that read the live web, said from the record it kept: what it cited,
 * of what it checked, and how those citations checked. Nothing new is stored, and nobody's research is listed for anyone
 * else. What a scheduled task or an agent researches by itself is listed once for each, under its own heading.
 */
export default async function ResearchPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const live = ctx.mode === "live";
  const client = live ? await createSupabaseServerClient().catch(() => null) : null;
  const sample: ResearchLists = { asked: sampleResearch(), repeated: [] };
  const [lists, projects] = await Promise.all([live ? (client ? listResearch(client, ws.id) : Promise.resolve(null)) : Promise.resolve(sample), ctx.reader.listProjects(ws.id).catch(() => [])]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const nameOf = (item: ResearchItem) => (item.projectId ? projectName.get(item.projectId) : undefined);

  return (
    <div className={PAGE_STACK}>
      {/* It opens as Home, Chat and Build do (ADR 0228): one question and one box. */}
      <header className="mx-auto grid w-full max-w-3xl justify-items-center gap-3 pt-1 text-center sm:pt-8">
        <h1 className={FOCUSED_TITLE}>What should we research?</h1>
        <p className="max-w-[54ch] text-body leading-relaxed text-ink-2">Ask something that needs the live web. Farbaek AI searches, reads the pages and answers with numbered sources you can open.</p>
      </header>

      <section id="start" aria-label="Start a piece of research" className="mx-auto w-full max-w-3xl scroll-mt-24">
        <ResearchBox />
      </section>

      {lists === null ? (
        <Notice tone="warning">Your research couldn&apos;t be read just now. Reload the page in a moment.</Notice>
      ) : lists.asked.length === 0 ? (
        <EmptyState icon={MagnifyingGlassIcon} title="No research yet">
          An answer that checks the live web is kept here with its sources, so you can find it again. Ask your first question in the box above.
        </EmptyState>
      ) : (
        <section aria-labelledby="research-heading" className="grid gap-4">
          <CardTitle id="research-heading" icon={MagnifyingGlassIcon}>
            Your research
          </CardTitle>
          {live ? null : <p className="text-sm text-ink-3">Sample research, made from the demo&apos;s sample chats.</p>}
          <ul className="grid gap-3 lg:grid-cols-2">
            {lists.asked.map((item) => (
              <Row key={item.id} item={item} project={nameOf(item)} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="kept-heading" className="grid gap-4">
        <CardTitle id="kept-heading" icon={CalendarCheckIcon}>
          Kept up to date
        </CardTitle>
        {lists && lists.repeated.length > 0 ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {lists.repeated.map((item) => (
              <Row key={item.id} item={item} project={nameOf(item)} repeats />
            ))}
          </ul>
        ) : null}
        <div className="grid gap-2 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
          <p className="max-w-prose text-sm leading-relaxed text-ink-2">
            {lists && lists.repeated.length > 0
              ? "Research that a scheduled task or an agent repeats is listed once here, by its latest run."
              : "Ask for research with a time, such as “every Monday morning”, and Chat offers to schedule it under the answer. What it repeats is then listed here, by its latest run."}
          </p>
          <Link href="/app/scheduled" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-accent hover:underline">
            See what is scheduled <ArrowRightIcon size={14} weight="bold" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
