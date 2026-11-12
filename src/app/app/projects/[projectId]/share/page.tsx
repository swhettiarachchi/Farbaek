import { ArrowLeftIcon, LinkSimpleIcon, UserPlusIcon, UsersThreeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { GuestAccessForm, GuestInviteForm, ShareLinkForm } from "@/components/sharing/share-forms";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { GUEST_ACCESS_LABELS } from "@/core/workspace/sharing";
import { withheldFor } from "@/core/workspace/permissions";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import type { ProjectSharing } from "@/server/workspace/sharing";
import { createSupabaseSharingDeps } from "@/server/workspace/sharing-wiring";
import { removeGuestAction, revokeGuestInviteAction, revokeShareLinkAction } from "./actions";

export const metadata: Metadata = { title: "Share" };

const EMPTY: ProjectSharing = { canShare: false, guests: [], invitations: [], links: [] };

/**
 * Sharing one project (ADR 0188): people invited to this project only, and
 * read-only links. Members see who has access; owners, admins and members
 * who may publish change it. The database checks every change again.
 */
export default async function SharePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();

  const admin = ctx.mode === "live" ? createSupabaseAdminClient() : null;
  const loaded = admin ? await createSupabaseSharingDeps(admin).sharing({ projectId: project.id, actor: ctx.user.id }) : null;
  const sharing = loaded?.ok ? loaded.value : EMPTY;

  const reason =
    ctx.mode !== "live"
      ? "Sharing needs a real workspace. This is the demo with sample data."
      : !loaded?.ok
        ? "Sharing couldn't be read just now. Reload the page to try again."
        : project.archivedAt
          ? "This project is archived, so it can't be shared."
          : !ctx.writes.enabled
            ? ctx.writes.reason
            : !sharing.canShare
              ? (withheldFor(ctx.role, ctx.permissions, "publish") ?? "Only owners, admins and members who may publish can share a project.")
              : null;
  // Closing access stays possible while saving is paused; only who may share decides it.
  const closeReason = ctx.mode !== "live" || !loaded?.ok ? reason : sharing.canShare ? null : "Only owners, admins and members who may publish can change who has access.";

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/app/projects/${project.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> {project.name}
        </Link>
        <div className="mt-3">
          <PageHeader
            title={`Share ${project.name}`}
            description="People you invite here open this project only. They never see your workspace, its other projects, its people or its billing."
          />
        </div>
      </div>

      {ctx.mode !== "live" ? <Notice>{reason}</Notice> : null}

      <Card>
        <CardTitle icon={UserPlusIcon}>Invite someone</CardTitle>
        <p className="mt-1 text-sm text-ink-2">They sign in with the address you invite, then find the project under Shared with you.</p>
        <div className="mt-5">
          <GuestInviteForm projectId={project.id} disabledReason={reason} />
        </div>
      </Card>

      <section aria-labelledby="people-heading" className="grid gap-4">
        <CardTitle id="people-heading" icon={UsersThreeIcon}>
          People with access
        </CardTitle>
        <p className="text-sm text-ink-2">
          Everyone in your workspace can open this project too. Below are the people from outside it.
        </p>
        {sharing.guests.length === 0 && sharing.invitations.length === 0 ? (
          <p className="text-sm text-ink-3">Nobody from outside your workspace has access yet.</p>
        ) : (
          <ul className="grid gap-3">
            {sharing.guests.map((g) => (
              <li key={g.userId} className="grid gap-3 rounded-md border border-line bg-surface p-4 shadow-e1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="truncate font-medium">{g.email}</p>
                  <p className="mt-0.5 text-sm text-ink-3">
                    {GUEST_ACCESS_LABELS[g.access].title}, since <LocalTime iso={g.since} date />.
                  </p>
                </div>
                <div className="grid gap-2 sm:justify-items-end">
                  <GuestAccessForm projectId={project.id} guestId={g.userId} email={g.email} access={g.access} disabledReason={reason} />
                  <ConfirmAction
                    action={removeGuestAction}
                    fields={{ projectId: project.id, guestId: g.userId }}
                    trigger="Remove"
                    question={<>Remove {g.email}? They can&apos;t open this project any more. What they changed stays in its history.</>}
                    confirmLabel={`Remove ${g.email}`}
                    pendingLabel="Removing…"
                    disabledReason={closeReason}
                  />
                </div>
              </li>
            ))}
            {sharing.invitations.map((v) => (
              <li key={v.id} className="grid gap-3 rounded-md border border-dashed border-line-strong bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="truncate font-medium">{v.email}</p>
                  <p className="mt-0.5 text-sm text-ink-3">
                    Invited to {GUEST_ACCESS_LABELS[v.access].title.toLowerCase()}. The link works until <LocalTime iso={v.expiresAt} />.
                  </p>
                </div>
                <ConfirmAction
                  action={revokeGuestInviteAction}
                  fields={{ projectId: project.id, invitationId: v.id }}
                  trigger="Revoke"
                  question={<>Revoke the invitation for {v.email}? Its link stops working.</>}
                  confirmLabel="Revoke invitation"
                  pendingLabel="Revoking…"
                  disabledReason={closeReason}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardTitle icon={LinkSimpleIcon}>Read-only link</CardTitle>
        <p className="mt-1 text-sm text-ink-2">For someone who only needs to read the code, without an account.</p>
        <div className="mt-5">
          <ShareLinkForm projectId={project.id} disabledReason={reason} />
        </div>
        {sharing.links.length > 0 ? (
          <div className="mt-6 grid gap-3 border-t border-line pt-5">
            <p className="text-xs font-medium text-ink-3">Links that work now</p>
            <ul className="grid gap-3">
              {sharing.links.map((l) => (
                <li key={l.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="text-sm text-ink-2">
                    <p>
                      Made <LocalTime iso={l.createdAt} date />.{" "}
                      {l.expiresAt ? (
                        <>
                          Works until <LocalTime iso={l.expiresAt} />.
                        </>
                      ) : (
                        <>Works until it&apos;s turned off.</>
                      )}{" "}
                      {l.allowDownload ? "Allows a download." : "Reading only."}
                    </p>
                    <p className="mt-0.5 text-ink-3">{l.lastOpenedAt ? <>Last opened <RelativeTime iso={l.lastOpenedAt} />.</> : "Not opened yet."}</p>
                  </div>
                  <ConfirmAction
                    action={revokeShareLinkAction}
                    fields={{ projectId: project.id, linkId: l.id }}
                    trigger="Turn off"
                    question="Turn this link off? Anyone opening it from now on sees that it was turned off."
                    confirmLabel="Turn link off"
                    pendingLabel="Turning off…"
                    disabledReason={closeReason}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
