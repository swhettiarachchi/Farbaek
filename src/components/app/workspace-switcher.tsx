import { CaretUpDownIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { switchWorkspace } from "@/app/app/actions";
import { getPlan } from "@/core/billing/catalog";
import type { WorkspaceSummary } from "@/server/workspace/organizations";

function planLabel(ws: WorkspaceSummary): string {
  if (ws.plan.source === "trial") return `${getPlan(ws.plan.planId).name} trial`;
  return getPlan(ws.plan.planId).name;
}

/** Works without JavaScript: a disclosure with one form per workspace. */
export function WorkspaceSwitcher({ workspaces, current, canCreate }: { workspaces: WorkspaceSummary[]; current: WorkspaceSummary; canCreate: boolean }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 shadow-e1 [&::-webkit-details-marker]:hidden">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-sm font-semibold text-on-primary">
          {current.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{current.name}</span>
          <span className="block truncate text-xs text-ink-3">{planLabel(current)}</span>
        </span>
        <CaretUpDownIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
        <span className="sr-only">Switch workspace</span>
      </summary>
      <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 rounded-sm border border-line bg-surface p-1.5 shadow-e3">
        <ul>
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <form action={switchWorkspace}>
                <input type="hidden" name="orgId" value={ws.id} />
                <button type="submit" className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-sm hover:bg-surface-raised">
                  <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                  {ws.id === current.id ? <CheckIcon size={15} weight="bold" className="text-accent" aria-label="Current" /> : null}
                </button>
              </form>
            </li>
          ))}
        </ul>
        {canCreate ? (
          <Link href="/app/workspaces/new" className="mt-1 flex items-center gap-2 rounded-[8px] border-t border-line px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-raised">
            <PlusIcon size={15} aria-hidden /> New workspace
          </Link>
        ) : null}
      </div>
    </details>
  );
}
