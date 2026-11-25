import Link from "next/link";

const TABS = [
  { id: "tasks", href: "/app/scheduled", label: "Tasks" },
  { id: "agents", href: "/app/scheduled/agents", label: "Agents" },
] as const;

/**
 * The two kinds of work Farbaek does by itself (stage 275, ADR 0282), as one page with two views: a task repeats an instruction, an
 * agent keeps working toward a goal. Links, so each view has its own address.
 */
export function ScheduledTabs({ current }: { current: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Scheduled work" className="inline-flex w-full rounded-full border border-line bg-surface p-0.5 shadow-e1 sm:w-fit">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={current === t.id ? "page" : undefined}
          className={`tap flex min-h-10 flex-1 items-center justify-center rounded-full px-5 text-sm transition-colors duration-[160ms] sm:flex-none ${current === t.id ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
