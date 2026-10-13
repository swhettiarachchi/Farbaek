import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExecutionModeBadge } from "@/components/app/execution";
import { RenameWorkspaceForm } from "@/components/app/forms";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { Card, Notice, PageHeader } from "@/components/app/primitives";
import { RelativeTime } from "@/components/ui/local-time";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Settings" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" } as const;

export default async function SettingsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const members = await ctx.reader.listMembers(ws.id);
  const canRename = ctx.mode === "live" && ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const execution = currentExecutionMode();
  const renameReason = ctx.mode === "demo" ? "The demo workspace is read-only." : canRename ? null : "Only owners and admins can rename this workspace.";

  return (
    <div className="grid gap-8">
      <PageHeader title="Settings" description="Workspace details and the people in it." />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Execution</h2>
          <ExecutionModeBadge mode={execution} />
        </div>
        {execution.mode === "review_only" ? (
          <div className="mt-3 grid gap-2 text-sm leading-relaxed text-ink-2">
            <p>{execution.reason}</p>
            <p>
              What works: contracts, AI proposals, diffs, approvals and applying changes as file revisions. What doesn&apos;t: builds, tests and previews. Tasks wait in
              verification and are never marked verified without real check results.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-2">Checks run in an isolated microVM with restricted network access.</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <h2 className="text-lg font-medium">Workspace</h2>
          <div className="mt-5">
            <RenameWorkspaceForm name={ws.name} disabledReason={renameReason} />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">
            People <span className="text-ink-3 tabular">{members.length}</span>
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-surface-raised text-sm font-medium text-ink-2">
                  {m.userId === ctx.user.id ? ctx.user.email.slice(0, 1).toUpperCase() : "·"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{m.userId === ctx.user.id ? `${ctx.user.email} (you)` : "Teammate"}</span>
                  <span className="block text-xs text-ink-3">
                    Joined <RelativeTime iso={m.joinedAt} />
                  </span>
                </span>
                <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">{ROLE_LABEL[m.role]}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Notice>Inviting people arrives in a later stage. Teammates&apos; email addresses aren&apos;t shown until invitations exist.</Notice>
          </div>
        </Card>
      </div>
    </div>
  );
}
