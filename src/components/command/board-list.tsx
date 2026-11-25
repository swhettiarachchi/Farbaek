import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { CardTitle } from "@/components/app/primitives";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BoardItem, BoardKind } from "@/core/command/board";

/** What kind of work a row is, in a word: said beside its time, so two rows with the same name are told apart. */
const KIND: Record<BoardKind, string> = { build: "Build", change: "Change", workflow: "Workflow", task: "Scheduled task", agent: "Agent" };

/**
 * One heading of the All work page (stage 276, ADR 0283) with its rows: what each thing is, where it stands and the one thing to
 * press. A heading with nothing under it says so in a sentence, so the page reads the same on a quiet day.
 */
export function BoardList({ id, icon, title, items, empty, note }: { id: string; icon: Icon; title: string; items: BoardItem[]; empty: string; note?: string | null }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <CardTitle id={id} icon={icon}>
        {title}
      </CardTitle>
      {items.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-3">{empty}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="group grid gap-2 rounded-md border border-line bg-surface p-4 shadow-e1 transition-colors duration-150 hover:border-accent/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-5">
                <span className="grid min-w-0 gap-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="line-clamp-2 min-w-0 text-body font-medium group-hover:text-accent">{item.title}</span>
                    <StatusBadge status={item.status} label={item.label} />
                  </span>
                  <span className="line-clamp-3 text-sm leading-relaxed text-ink-2">{item.line}</span>
                  <span className="text-sm text-ink-3">
                    {KIND[item.kind]}
                    {item.at && item.when === "next" ? (
                      <>
                        , next <LocalTime iso={item.at} />
                      </>
                    ) : item.at ? (
                      <>
                        , <RelativeTime iso={item.at} />
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent">
                  {item.action} <ArrowRightIcon size={14} weight="bold" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="text-sm text-ink-3">{note}</p> : null}
    </section>
  );
}
