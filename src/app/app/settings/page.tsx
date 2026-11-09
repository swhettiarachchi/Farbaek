import { BuildingsIcon, DownloadSimpleIcon, EnvelopeSimpleIcon, GithubLogoIcon, KeyIcon, LifebuoyIcon, TerminalWindowIcon, TrashIcon, UsersThreeIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutonomySettings } from "@/components/app/autonomy-settings";
import { RehearsalRecord } from "@/components/app/rehearsal-record";
import { checkFeature } from "@/core/billing/entitlements";
import { summarizeRehearsal } from "@/core/trust/rehearsal";
import { LEVEL_3_NOT_IN_PLAN, SHADOW_NOT_IN_PLAN, readAutonomyRecord } from "@/server/workspace/autonomy";
import { levelThreeStatus } from "@/core/trust/autonomy-levels";
import { DeleteAccount } from "@/components/app/delete-account";
import { EmailPreferencesForm } from "@/components/app/email-preferences";
import { GitHubConnectionCard } from "@/components/app/github-connection";
import { ModelKeyCard } from "@/components/app/model-key";
import { readModelKey } from "@/server/ai/workspace-ai";
import { readGitHubConnection } from "@/server/github/store";
import { ThisDevice } from "@/components/app/this-device";
import { Phones } from "@/components/app/phones";
import { readMyPhones } from "@/server/phone/store";
import { readMyDevices } from "@/server/push/store";
import { vapidPublicKey } from "@/server/push/wiring";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { MemberControls } from "@/components/app/member-controls";
import { MemberPermissions } from "@/components/app/member-permissions";
import { PERMISSIONS_NOT_IN_PLAN } from "@/server/workspace/member-permissions";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { DELETION_WORDS, deletionPlan, isStaffAccount } from "@/server/workspace/account";
import { readEmailConfig } from "@/server/email/config";
import { ExecutionModeBadge } from "@/components/app/execution";
import { RenameWorkspaceForm } from "@/components/app/forms";
import { InvitePeople } from "@/components/app/invite-people";
import { revokeInvitationAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { CONTACT } from "@/config/contact";
import { invitableRoles } from "@/core/workspace/invitations";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { Card, CardTitle, PageHeader } from "@/components/app/primitives";
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
  const [members, invitations, autonomy, emailChoices] = await Promise.all([
    ctx.reader.listMembers(ws.id),
    canManage ? ctx.reader.listInvitations(ws.id) : Promise.resolve([]),
    ctx.reader.getAutonomy(ws.id),
    ctx.reader.getEmailPreferences(),
  ]);
  // Shadow mode's record (ADR 0075), only while the workspace rehearses level 2.
  const rehearsal = autonomy.shadowSince ? await ctx.reader.listRehearsal(ws.id, autonomy.shadowSince).catch(() => null) : null;
  const shadowFeature = checkFeature(ws.plan, "shadow_mode");
  const shadowReason = shadowFeature.allowed ? null : shadowFeature.code === "FEATURE_NOT_IN_PLAN" ? SHADOW_NOT_IN_PLAN : shadowFeature.message;
  // Notifications on people's devices (ADR 0079), read as the person.
  const pushClient = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const myDevices = pushClient ? await readMyDevices(pushClient, ctx.user.id).catch(() => []) : [];
  // Phones signed in with the Farbaek app (ADR 0110), read as the person.
  const myPhones = pushClient ? await readMyPhones(pushClient, ctx.user.id).catch(() => []) : [];
  // The workspace's own AI key (ADR 0125): whether one is set and which, never the key.
  const modelKey = pushClient ? await readModelKey(pushClient, ws.id) : null;
  // The workspace's GitHub connection (ADR 0126): who connected it, never the token.
  const github = pushClient ? await readGitHubConnection(pushClient, ws.id).catch(() => null) : null;
  const modelKeyReason = ctx.mode === "demo" ? "The demo workspace is read-only." : ctx.writes.enabled ? null : ctx.writes.reason;
  // Level 3 (ADR 0086): the plan first, then the record it's earned from, read as the person. A running level 3 can always change its limits.
  const levelThreeFeature = checkFeature(ws.plan, "advanced_autonomy");
  const levelThreeOn = autonomy.level === 3 && autonomy.suspendedAt === null;
  const levelThreeRecord = !levelThreeOn && levelThreeFeature.allowed && pushClient ? await readAutonomyRecord(pushClient, ws.id) : null;
  const levelThreeEarned = levelThreeStatus(levelThreeRecord);
  const levelThreeReason = levelThreeOn
    ? null
    : !levelThreeFeature.allowed
      ? levelThreeFeature.code === "FEATURE_NOT_IN_PLAN"
        ? LEVEL_3_NOT_IN_PLAN
        : levelThreeFeature.message
      : levelThreeEarned.earned
        ? null
        : levelThreeEarned.reason;
  const emailReason = ctx.mode === "demo" ? "The demo workspace is read-only." : readEmailConfig() ? null : "Farbaek isn't sending email from this server yet.";
  const owners = members.filter((m) => m.role === "owner").length;
  const peopleReason = ctx.mode === "demo" ? "The demo workspace is read-only." : !ctx.writes.enabled ? ctx.writes.reason : null;
  // Permissions per person (ADR 0087): turning one off needs the plan, turning one back on never does.
  const permissionsFeature = checkFeature(ws.plan, "advanced_rbac");
  const permissionsPlanReason = permissionsFeature.allowed ? null : permissionsFeature.code === "FEATURE_NOT_IN_PLAN" ? PERMISSIONS_NOT_IN_PLAN : permissionsFeature.message;
  // What deleting this account would do, from the database's own plan (ADR 0064).
  const admin = ctx.mode === "live" ? createSupabaseAdminClient() : null;
  const [plan, staff] = admin ? await Promise.all([deletionPlan(admin, ctx.user.id).catch(() => null), isStaffAccount(admin, ctx.user.id).catch(() => false)]) : [null, false];
  const deleteReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only."
      : staff
        ? "This is a Farbaek staff account, so it's kept. Write to support to close it."
        : plan === null
          ? "Your workspaces couldn't be checked just now, so deleting is off. Try again in a moment."
          : null;
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
      <PageHeader title="Settings" description="Your workspace, the people in it, and how much the agent can do on its own." />

      <Card>
        <CardTitle icon={BuildingsIcon}>Workspace</CardTitle>
        <div className="mt-5">
          <RenameWorkspaceForm name={ws.name} disabledReason={renameReason} />
        </div>
      </Card>

      <Card>
        <CardTitle icon={UsersThreeIcon}>People</CardTitle>
        <p className="mt-1 max-w-[65ch] text-sm text-ink-2">
          Owners and admins can do everything. Members approve changes, publish and start agent runs unless an owner or admin turns one off. Viewers read everything and change nothing.
        </p>
        <ul className="mt-4 divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-medium text-ink-2">
                  {(m.userId === ctx.user.id ? ctx.user.email : (emailOf.get(m.userId) ?? "Teammate")).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem]">{m.userId === ctx.user.id ? `${ctx.user.email} (you)` : (emailOf.get(m.userId) ?? "Teammate")}</span>
                  <span className="block text-xs text-ink-3">
                    Joined <RelativeTime iso={m.joinedAt} />
                  </span>
                </span>
                <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">{ROLE_LABEL[m.role]}</span>
              </div>
              <MemberControls
                userId={m.userId}
                name={m.userId === ctx.user.id ? "yourself" : (emailOf.get(m.userId) ?? "this teammate")}
                role={m.role}
                actorRole={ctx.role}
                isSelf={m.userId === ctx.user.id}
                lastOwner={m.role === "owner" && owners === 1}
                disabledReason={peopleReason}
              />
              {m.role === "member" ? (
                <MemberPermissions
                  userId={m.userId}
                  name={m.userId === ctx.user.id ? "yourself" : (emailOf.get(m.userId) ?? "this teammate")}
                  permissions={m.permissions}
                  canManage={canManage}
                  isSelf={m.userId === ctx.user.id}
                  planReason={permissionsPlanReason}
                  disabledReason={peopleReason}
                />
              ) : null}
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
                        <span className="block truncate text-[0.9375rem]">{i.email}</span>
                        <span className="block text-xs text-ink-3">
                          {ROLE_LABEL[i.role]}, expires <RelativeTime iso={i.expiresAt} />
                        </span>
                      </span>
                      <ConfirmAction
                        action={revokeInvitationAction}
                        fields={{ invitationId: i.id }}
                        trigger="Revoke"
                        question={<>Revoke the invitation to {i.email}? Its link stops working and the seat is free again.</>}
                        confirmLabel="Revoke invitation"
                        pendingLabel="Revoking…"
                        keepLabel="Keep it open"
                        disabledReason={peopleReason}
                      />
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

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section id="email" aria-labelledby="email-title" className="scroll-mt-24">
          <Card>
            <CardTitle id="email-title" icon={EnvelopeSimpleIcon}>
              Email
            </CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              Farbaek writes to <span className="break-all">{ctx.user.email}</span>, the address you sign in with. These choices are yours, in every workspace.
            </p>
            <div className="mt-4">
              <EmailPreferencesForm preferences={emailChoices} disabledReason={emailReason} />
            </div>
          </Card>
        </section>
        <section id="device" aria-label="This device" className="scroll-mt-24">
          <Card>
            <ThisDevice vapidKey={vapidPublicKey()} devices={myDevices} disabledReason={ctx.mode === "demo" ? "The demo workspace has no account to notify." : null} />
          </Card>
        </section>
        <section id="phones" aria-labelledby="phones-title" className="scroll-mt-24">
          <Card>
            <Phones phones={myPhones} disabledReason={ctx.mode === "demo" ? "The demo workspace has no account for phones to sign in to." : null} />
          </Card>
        </section>
        <Card>
          <CardTitle icon={LifebuoyIcon}>Help</CardTitle>
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

      <section id="autonomy" aria-label="How much the agent can do on its own" className="scroll-mt-24">
        <Card>
          <AutonomySettings
            view={autonomy}
            verifiable={execution.mode === "sandboxed"}
            shadowReason={shadowReason}
            replayReason={ctx.mode === "demo" ? "The demo workspace has no past changes to replay." : shadowReason}
            levelThreeReason={levelThreeReason}
            disabledReason={ctx.mode === "demo" ? "The demo workspace is read-only." : !ctx.writes.enabled ? ctx.writes.reason : canManage ? null : "Only owners and admins can change this."}
          />
          {autonomy.shadowSince ? (
            rehearsal ? (
              <RehearsalRecord summary={summarizeRehearsal(rehearsal)} since={autonomy.shadowSince} />
            ) : (
              <p role="alert" className="mt-6 flex items-start gap-2 text-sm text-failed">
                <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
                <span>The practice record couldn&apos;t be read. Reload the page to try again.</span>
              </p>
            )
          ) : null}
        </Card>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle icon={TerminalWindowIcon}>Where checks run</CardTitle>
          <ExecutionModeBadge mode={execution} />
        </div>
        {execution.mode === "review_only" ? (
          <div className="mt-3 grid gap-2 text-sm leading-relaxed text-ink-2">
            <p>{execution.reason}</p>
            <p>
              What works: plans, suggested changes, reviewing and approving them, and applying them. What doesn&apos;t: builds, tests and previews. Tasks wait at the
              checks, and are never marked verified without real results.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-2">Checks run on a private, throwaway computer with limited internet access.</p>
        )}
      </Card>

      <section id="ai-key" aria-labelledby="ai-key-title" className="scroll-mt-24">
        <Card>
          <CardTitle id="ai-key-title" icon={KeyIcon}>
            Your own AI account
          </CardTitle>
          <p className="mt-1 mb-4 text-sm text-ink-2">Use this workspace&apos;s own Anthropic account instead of Farbaek&apos;s, directly or through your company&apos;s own server.</p>
          <ModelKeyCard current={modelKey} canManage={canManage} disabledReason={modelKeyReason} />
        </Card>
      </section>

      <section id="github" aria-labelledby="github-title" className="scroll-mt-24">
        <Card>
          <CardTitle id="github-title" icon={GithubLogoIcon}>
            GitHub
          </CardTitle>
          <p className="mt-1 mb-4 text-sm text-ink-2">Open a pull request on GitHub for each change you apply, with its ProofPack result as a status check.</p>
          <GitHubConnectionCard current={github} canManage={canManage} disabledReason={modelKeyReason} />
        </Card>
      </section>

      <section id="your-data" aria-labelledby="your-data-title" className="scroll-mt-24">
        <Card>
          <CardTitle id="your-data-title" icon={DownloadSimpleIcon}>
            Your data
          </CardTitle>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-2">
            Download what Farbaek holds about you, as a file. It has your account, email choices, workspaces and roles, and support requests. It also has the actions you took,
            your AI use, and the projects, tasks and sites you created. A project&apos;s files are in Export everything, on its page.
          </p>
          <div className="mt-5 grid justify-items-start gap-2">
            {ctx.mode === "live" ? (
              <a href="/app/account/export" download className={buttonClasses("secondary", "md")}>
                <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> Download my data
              </a>
            ) : (
              <>
                <span aria-disabled="true" className={buttonClasses("secondary", "md", "pointer-events-none opacity-50")}>
                  <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> Download my data
                </span>
                <p className="text-sm text-ink-3">The demo workspace has no account to download.</p>
              </>
            )}
          </div>
        </Card>
      </section>

      <section id="delete-account" aria-labelledby="delete-account-title" className="scroll-mt-24">
        <Card>
          <CardTitle id="delete-account-title" icon={TrashIcon}>
            Delete your account
          </CardTitle>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-2">
            Here&apos;s what happens to each workspace you&apos;re in. Want a copy first? Download your data above, and use Export everything on each project&apos;s page for its files and history.
          </p>
          <div className="mt-5">
            <DeleteAccount
              email={ctx.user.email}
              rows={plan ? plan.map((p) => ({ orgId: p.orgId, orgName: p.orgName, outcome: p.outcome, words: DELETION_WORDS[p.outcome] })) : null}
              disabledReason={deleteReason}
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
