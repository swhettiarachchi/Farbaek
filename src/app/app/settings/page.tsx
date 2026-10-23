import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutonomySettings } from "@/components/app/autonomy-settings";
import { ExecutionModeBadge } from "@/components/app/execution";
import { RenameWorkspaceForm } from "@/components/app/forms";
import { InvitePeople } from "@/components/app/invite-people";
import { revokeInvitationAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { CONTACT } from "@/config/contact";
import { invitableRoles } from "@/core/workspace/invitations";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { Card, PageHeader } from "@/components/app/primitives";
import { RelativeTime } from "@/components/ui/local-time";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Settings" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" } as const;

export default async function SettingsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const canManage = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const [members, invitations, autonomy] = await Promise.all([ctx.reader.listMembers(ws.id), canManage ? ctx.reader.listInvitations(ws.id) : Promise.resolve([]), ctx.reader.getAutonomy(ws.id)]);
  const canRename = ctx.mode === "live" && canManage;
  // People who joined through an invitation are shown by the address they were invited at.
  const emailOf = new Map(invitations.flatMap((i) => (i.acceptedBy ? [[i.acceptedBy, i.email] as const] : [])));
  const open = invitations.filter((i) => i.open);
  const seatLimit = ws.plan.limits.seats;
  const inUse = members.length + open.length;
  const seats = seatLimit === null ? `${inUse} seats in use.` : `${inUse} of ${seatLimit} seats in use, counting open invitations.`;
  const inviteRoles = invitableRoles(ctx.role);
  const inviteReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only."
      : !ctx.writes.enabled
        ? ctx.writes.reason
        : seatLimit !== null && inUse >= seatLimit
          ? "Every seat on this plan is taken, counting open invitations. Revoke one to invite someone else."
          : null;
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

      <Card>
        <AutonomySettings
          view={autonomy}
          verifiable={execution.mode === "sandboxed"}
          disabledReason={ctx.mode === "demo" ? "The demo workspace is read-only." : !ctx.writes.enabled ? ctx.writes.reason : canManage ? null : "Only owners and admins can change autonomy."}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
        <div className="grid gap-6">
          <Card>
            <h2 className="text-lg font-medium">Workspace</h2>
            <div className="mt-5">
              <RenameWorkspaceForm name={ws.name} disabledReason={renameReason} />
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-medium">Help</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Questions about your account, a workspace or sign-in: write to{" "}
              <a href={`mailto:${CONTACT.support}`} className="font-medium text-accent hover:underline">
                {CONTACT.support}
              </a>
              . Anything else, including Enterprise:{" "}
              <a href={`mailto:${CONTACT.hello}`} className="font-medium text-accent hover:underline">
                {CONTACT.hello}
              </a>
              .
            </p>
          </Card>
        </div>

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
                  <span className="block truncate text-[15px]">{m.userId === ctx.user.id ? `${ctx.user.email} (you)` : (emailOf.get(m.userId) ?? "Teammate")}</span>
                  <span className="block text-xs text-ink-3">
                    Joined <RelativeTime iso={m.joinedAt} />
                  </span>
                </span>
                <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">{ROLE_LABEL[m.role]}</span>
              </li>
            ))}
          </ul>
          {inviteRoles.length ? (
            <div className="mt-6 grid gap-6 border-t border-line pt-6">
              <div>
                <h3 className="text-base font-medium">Invite someone</h3>
                <div className="mt-4">
                  <InvitePeople roles={inviteRoles} seats={seats} disabledReason={inviteReason} />
                </div>
              </div>
              {open.length ? (
                <div>
                  <h3 className="text-base font-medium">Open invitations</h3>
                  <ul className="mt-3 divide-y divide-line">
                    {open.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px]">{i.email}</span>
                          <span className="block text-xs text-ink-3">
                            {ROLE_LABEL[i.role]}, expires <RelativeTime iso={i.expiresAt} />
                          </span>
                        </span>
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="invitationId" value={i.id} />
                          <button type="submit" disabled={inviteReason === "The demo workspace is read-only."} className={buttonClasses("secondary", "sm")}>
                            Revoke
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-3">Owners and admins invite people. {seats}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
