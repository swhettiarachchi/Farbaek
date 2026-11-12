import type { Metadata } from "next";
import { AcceptInvitationForm } from "@/components/app/accept-invitation";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { LocalTime } from "@/components/ui/local-time";
import { INVITE_ROLE_LABELS, type InviteRole } from "@/core/workspace/invitations";
import { signOut } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { previewInvitation } from "@/server/workspace/invitations";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { AcceptGuestInvitationForm } from "@/components/sharing/guest-forms";
import type { GuestAccess } from "@/core/workspace/sharing";
import { previewGuestInvitation, type ProjectInvitationPreview } from "@/server/workspace/sharing";
import { createSupabaseSharingDeps } from "@/server/workspace/sharing-wiring";

export const metadata: Metadata = { title: "Invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const CLOSED = {
  accepted: "This invitation was already used. If it was yours, the workspace is in your list.",
  revoked: "This invitation was revoked. Ask the person who invited you for a new one.",
  expired: "This invitation has expired. Ask the person who invited you for a new one.",
} as const;

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Container className="flex min-h-[70dvh] items-start justify-center py-16 sm:items-center">
      <div className="w-full max-w-[460px]">
        <h1 className={FOCUSED_TITLE}>{title}</h1>
        <div className="mt-6 grid gap-5 text-body leading-relaxed text-ink-2">{children}</div>
      </div>
    </Container>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) {
    return (
      <Frame title="Invitations aren't available here">
        <p>This server isn&apos;t connected to its database, so it can&apos;t read invitations.</p>
      </Frame>
    );
  }

  const invitation = await previewInvitation(createSupabaseWriteDeps(user, admin, ""), token);
  // A link to one project (ADR 0188) uses the same kind of token, kept in its own table.
  const guest = invitation ? null : await previewGuestInvitation(createSupabaseSharingDeps(admin), token);
  if (guest) return <ProjectInvitation token={token} invitation={guest} email={await signedInEmail(user)} />;
  if (!invitation) {
    return (
      <Frame title="This invitation link isn't valid">
        <p>Check that you copied all of it, or ask the person who invited you to send it again.</p>
        <div>
          <ButtonLink href="/">Back to home</ButtonLink>
        </div>
      </Frame>
    );
  }
  if (invitation.state !== "open") {
    return (
      <Frame title={`Your invitation to ${invitation.orgName}`}>
        <p>{CLOSED[invitation.state]}</p>
        <div>
          <ButtonLink href="/app">Open Farbaek</ButtonLink>
        </div>
      </Frame>
    );
  }

  const role = INVITE_ROLE_LABELS[invitation.role as InviteRole] ?? { title: invitation.role, detail: "" };
  const { data } = await user.auth.getClaims();
  const signedInAs = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null;
  const summary = (
    <p>
      You&apos;re invited to join <span className="font-medium text-ink">{invitation.orgName}</span> as {role.title.toLowerCase()}. {role.detail} The invitation is for{" "}
      <span className="font-medium text-ink">{invitation.email}</span> and works until <LocalTime iso={invitation.expiresAt} />.
    </p>
  );

  if (!signedInAs) {
    return (
      <Frame title={`Join ${invitation.orgName}`}>
        {summary}
        <p>Sign in with {invitation.email} to accept. We email you a one-time link, then bring you back here.</p>
        <div>
          <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</ButtonLink>
        </div>
      </Frame>
    );
  }

  if (signedInAs !== invitation.email) {
    return (
      <Frame title={`Join ${invitation.orgName}`}>
        {summary}
        <p>
          You&apos;re signed in as <span className="font-medium text-ink">{signedInAs}</span>, but this invitation only works for {invitation.email}. Sign out, then open this
          link again and sign in with that address.
        </p>
        <form action={signOut}>
          <button type="submit" className={buttonClasses("secondary")}>
            Sign out
          </button>
        </form>
      </Frame>
    );
  }

  return (
    <Frame title={`Join ${invitation.orgName}`}>
      {summary}
      <AcceptInvitationForm token={token} orgName={invitation.orgName} />
    </Frame>
  );
}

async function signedInEmail(user: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>): Promise<string | null> {
  const { data } = await user.auth.getClaims();
  return typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null;
}

const INVITED_TO: Record<GuestAccess, string> = {
  view: "You can read its files, tasks, plans and proof.",
  edit: "You can change its files and add tasks.",
};

const PROJECT_CLOSED = {
  accepted: "This invitation was already used. If it was yours, the project is under Shared with you.",
  revoked: "This invitation was revoked. Ask the person who invited you for a new one.",
  expired: "This invitation has expired. Ask the person who invited you for a new one.",
} as const;

/** An invitation to one project: the person opens that project only, never the rest of its workspace. */
function ProjectInvitation({ token, invitation, email }: { token: string; invitation: ProjectInvitationPreview; email: string | null }) {
  const title = `Open ${invitation.projectName}`;
  if (invitation.state !== "open") {
    return (
      <Frame title={`Your invitation to ${invitation.projectName}`}>
        <p>{PROJECT_CLOSED[invitation.state]}</p>
        <div>
          <ButtonLink href="/shared">Shared with you</ButtonLink>
        </div>
      </Frame>
    );
  }
  const summary = (
    <p>
      <span className="font-medium text-ink">{invitation.orgName}</span> invited you to the project <span className="font-medium text-ink">{invitation.projectName}</span>.{" "}
      {INVITED_TO[invitation.access]} You see this project only, never the rest of the
      workspace. The invitation is for <span className="font-medium text-ink">{invitation.email}</span> and works until <LocalTime iso={invitation.expiresAt} />.
    </p>
  );
  if (!email) {
    return (
      <Frame title={title}>
        {summary}
        <p>Sign in with {invitation.email} to open it. You don&apos;t need a workspace of your own.</p>
        <div>
          <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to open it</ButtonLink>
        </div>
      </Frame>
    );
  }
  if (email !== invitation.email) {
    return (
      <Frame title={title}>
        {summary}
        <p>
          You&apos;re signed in as <span className="font-medium text-ink">{email}</span>, but this invitation only works for {invitation.email}. Sign out, then open this link
          again and sign in with that address.
        </p>
        <form action={signOut}>
          <button type="submit" className={buttonClasses("secondary")}>
            Sign out
          </button>
        </form>
      </Frame>
    );
  }
  return (
    <Frame title={title}>
      {summary}
      <AcceptGuestInvitationForm token={token} projectName={invitation.projectName} />
    </Frame>
  );
}
