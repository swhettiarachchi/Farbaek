import { BuildingsIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminTable, Cell, Chip } from "@/components/admin/table";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { requireStaff } from "@/server/office/access";
import { loadWorkspaces } from "@/server/admin/data";

export const metadata: Metadata = { title: "Workspaces" };

export default async function OfficeWorkspaces() {
  const staff = await requireStaff();
  const admin = staff.admin;
  const rows = await loadWorkspaces(admin);

  return (
    <div className="grid gap-6">
      <PageHeader title="Workspaces" description={`${rows.length} ${rows.length === 1 ? "workspace" : "workspaces"}, newest first. AI used is this period's share of each workspace's own allowance. Open one to manage it.`} />
      {rows.length === 0 ? (
        <EmptyState icon={BuildingsIcon} title="No workspaces yet">
          A workspace appears here as soon as someone creates one after signing in.
        </EmptyState>
      ) : (
        <AdminTable caption="Workspaces" columns={["Workspace", "Plan", "Members", "Projects", "AI used", "Last activity"]}>
          {rows.map((w) => (
            <tr key={w.id}>
              <Cell>
                <Link href={`/workspaces/${w.id}`} className="block font-medium text-ink underline-offset-4 hover:text-accent hover:underline">
                  {w.name}
                </Link>
                <span className="block text-xs text-ink-3">
                  Created {w.createdAt ? <LocalTime iso={w.createdAt} /> : "at an unknown time"}
                </span>
              </Cell>
              <Cell>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={w.trialDaysLeft !== null ? "accent" : "neutral"}>{w.plan}</Chip>
                  {w.trialDaysLeft !== null ? (
                    <span className={`text-xs ${w.trialDaysLeft <= 3 ? "text-approval" : "text-ink-3"}`}>
                      {w.trialDaysLeft} {w.trialDaysLeft === 1 ? "day" : "days"} left
                    </span>
                  ) : null}
                </span>
              </Cell>
              <Cell mono>{w.members}</Cell>
              <Cell mono>{w.projects}</Cell>
              <Cell mono muted={w.aiPercent === null}>
                {w.aiPercent === null ? "None this period" : `${w.aiPercent}%`}
              </Cell>
              <Cell muted>{w.lastActivity ? <RelativeTime iso={w.lastActivity} /> : "No tasks yet"}</Cell>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
