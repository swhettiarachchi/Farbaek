import Link from "next/link";
import { TaskStateBadge } from "@/components/app/primitives";
import { RelativeTime } from "@/components/ui/local-time";
import type { Task } from "@/server/workspace/types";

export function TaskList({ tasks, showProject = true }: { tasks: Task[]; showProject?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link href={`/app/tasks/${t.id}`} className="group flex flex-col gap-2 px-4 py-4 hover:bg-canvas-2 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-medium group-hover:text-accent">{t.title}</span>
              <span className="mt-0.5 block text-xs text-ink-3">
                {showProject && t.projectName ? `${t.projectName}, updated ` : "Updated "}
                <RelativeTime iso={t.updatedAt} />
              </span>
            </span>
            <TaskStateBadge state={t.state} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
