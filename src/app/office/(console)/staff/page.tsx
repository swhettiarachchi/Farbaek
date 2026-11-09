import { CaretDownIcon, EnvelopeSimpleIcon, IdentificationBadgeIcon, ShieldCheckIcon, UserPlusIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Chip } from "@/components/admin/table";
import { CardTitle, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { OfficeActionForm } from "@/components/office/action-form";
import { RoleBadge } from "@/components/office/badges";
import { ReasonField, StepUpField } from "@/components/office/fields";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { OFFICE_POLICY } from "@/config/office";
import { ROLE_LABELS, ROLE_SUMMARIES, STAFF_ROLES, type StaffRole } from "@/core/office/permissions";
import { requireStaff } from "@/server/office/access";
import { loadStaffPage } from "@/server/office/staff-data";
import { changeRoleAction, endSessionsAction, inviteStaffAction, removeStaffAction, resetAuthenticatorAction, revokeInviteAction } from "./actions";

export const metadata: Metadata = { title: "Staff" };

function RoleSelect({ id, defaultValue }: { id: string; defaultValue?: StaffRole }) {
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm">
      <span className={LABEL_CLASSES}>Role</span>
      <select id={id} name="role" defaultValue={defaultValue ?? "support"} className={inputClasses()}>
        {STAFF_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function OfficeStaff() {
  const staff = await requireStaff();
  const { active, removed, invites } = await loadStaffPage(staff.admin);
  const owner = staff.can("staff.manage");

  return (
    <div className="grid gap-10">
      <PageHeader title="Staff" description="Who can use Office Space, with what role. Only owners invite or change staff, and each change needs a reason and a fresh authenticator code." />
      {!owner ? <Notice>Your role can see the staff but not change it. An owner can.</Notice> : null}

      <section aria-labelledby="team-title" className="grid gap-3">
        <CardTitle id="team-title" icon={IdentificationBadgeIcon}>
          On the staff
        </CardTitle>
        <ul className="grid gap-3">
          {active.map((m) => {
            const self = m.userId === staff.user.id;
            return (
              <li key={m.userId} className="rounded-md border border-line bg-surface shadow-e1">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="break-all font-medium">{m.email}</span>
                      {self ? <Chip>You</Chip> : null}
                      {m.resetUntil ? <Chip kind="info">Can add a new authenticator</Chip> : null}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      Since <LocalTime iso={m.since} /> ·{" "}
                      {m.openSessions > 0 && m.lastSeenAt ? (
                        <>
                          active <RelativeTime iso={m.lastSeenAt} />
                        </>
                      ) : (
                        "signed out"
                      )}
                    </p>
                  </div>
                  <RoleBadge role={m.role} />
                </div>
                {owner && !self ? (
                  <details className="group border-t border-line">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm text-ink-2 hover:text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
                      <CaretDownIcon size={14} weight="bold" className="transition-transform group-open:rotate-180" aria-hidden /> Manage {m.email}
                    </summary>
                    <div className="grid gap-6 px-4 pb-5 sm:px-5 lg:grid-cols-2">
                      <OfficeActionForm action={changeRoleAction} submit="Change role" tone="secondary" className="grid content-start gap-3 rounded-sm bg-surface-raised/60 p-4">
                        <input type="hidden" name="userId" value={m.userId} />
                        <RoleSelect id={`role-${m.userId}`} defaultValue={m.role} />
                        <ReasonField id={`role-reason-${m.userId}`} />
                        <StepUpField id={`role-totp-${m.userId}`} />
                      </OfficeActionForm>
                      <div className="grid content-start gap-4">
                        <OfficeActionForm action={endSessionsAction} submit="End their sessions" tone="secondary" className="grid gap-3 rounded-sm bg-surface-raised/60 p-4">
                          <input type="hidden" name="userId" value={m.userId} />
                          <ReasonField id={`end-reason-${m.userId}`} />
                        </OfficeActionForm>
                        <OfficeActionForm action={resetAuthenticatorAction} submit="Let them add a new authenticator" tone="secondary" className="grid gap-3 rounded-sm bg-surface-raised/60 p-4">
                          <p className="text-xs leading-relaxed text-ink-2">For a lost phone. Confirm who they are on a call first: their mailbox alone isn&apos;t proof. Their old authenticators are removed.</p>
                          <input type="hidden" name="userId" value={m.userId} />
                          <ReasonField id={`reset-reason-${m.userId}`} />
                          <StepUpField id={`reset-totp-${m.userId}`} />
                        </OfficeActionForm>
                        <OfficeActionForm action={removeStaffAction} submit={`Remove ${m.email}`} tone="danger" className="grid gap-3 rounded-sm border border-failed/25 p-4">
                          <input type="hidden" name="userId" value={m.userId} />
                          <ReasonField id={`remove-reason-${m.userId}`} />
                          <StepUpField id={`remove-totp-${m.userId}`} />
                        </OfficeActionForm>
                      </div>
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="invites-title" className="grid gap-3">
        <CardTitle id="invites-title" icon={EnvelopeSimpleIcon}>
          Open invites
        </CardTitle>
        {invites.length === 0 ? (
          <p className="rounded-md border border-line bg-surface px-5 py-4 text-sm text-ink-2">No open invites.</p>
        ) : (
          <ul className="grid gap-3">
            {invites.map((i) => (
              <li key={i.id} className="grid gap-3 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium">{i.email}</span>
                  <RoleBadge role={i.role} />
                  <span className="text-xs text-ink-3">
                    Expires <RelativeTime iso={i.expiresAt} />
                  </span>
                </p>
                {owner ? (
                  <OfficeActionForm action={revokeInviteAction} submit="Withdraw invite" tone="secondary" className="grid gap-3 sm:max-w-md">
                    <input type="hidden" name="inviteId" value={i.id} />
                    <ReasonField id={`revoke-${i.id}`} />
                  </OfficeActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {owner ? (
        <section aria-labelledby="invite-title" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
          <div className="grid gap-5 rounded-md bg-surface p-5 shadow-e1 sm:p-6">
            <div>
              <CardTitle id="invite-title" icon={UserPlusIcon}>
                Invite someone
              </CardTitle>
              <p className="mt-1 text-sm text-ink-2">
                They sign in with this address within the invite&apos;s time, set up an authenticator and join with the role you choose. Farbaek doesn&apos;t email invites yet, so tell them yourself.
              </p>
            </div>
            <OfficeActionForm action={inviteStaffAction} submit="Send the invite" className="grid gap-4 lg:grid-cols-2">
              <label htmlFor="invite-email" className="grid gap-1.5 text-sm">
                <span className={LABEL_CLASSES}>Their work email</span>
                <input id="invite-email" name="email" type="email" required className={inputClasses()} />
              </label>
              <RoleSelect id="invite-role" />
              <label htmlFor="invite-days" className="grid gap-1.5 text-sm">
                <span className={LABEL_CLASSES}>Invite lasts</span>
                <select id="invite-days" name="days" defaultValue="3" className={inputClasses()}>
                  {Array.from({ length: OFFICE_POLICY.inviteMaxDays }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? "day" : "days"}
                    </option>
                  ))}
                </select>
              </label>
              <StepUpField id="invite-totp" />
              <div className="lg:col-span-2">
                <ReasonField id="invite-reason" />
              </div>
            </OfficeActionForm>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="roles-title" className="grid gap-3">
        <CardTitle id="roles-title" icon={ShieldCheckIcon}>
          What each role can do
        </CardTitle>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {STAFF_ROLES.map((r) => (
            <div key={r} className="rounded-md border border-line bg-surface p-4">
              <dt>
                <RoleBadge role={r} />
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-2">{ROLE_SUMMARIES[r]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {removed.length > 0 ? (
        <details className="rounded-md border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm text-ink-2">Removed staff ({removed.length})</summary>
          <ul className="grid gap-2 px-4 pb-4 text-sm">
            {removed.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-2 text-ink-2">
                <span className="break-all">{m.email}</span> <Chip>{ROLE_LABELS[m.role]}</Chip>
                <span className="text-xs text-ink-3">removed {m.removedAt ? <RelativeTime iso={m.removedAt} /> : null}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {active.length === 0 ? (
        <EmptyState icon={IdentificationBadgeIcon} title="No staff yet">
          The first owner joins by signing in with the address set as OFFICE_OWNER_EMAIL.
        </EmptyState>
      ) : null}
    </div>
  );
}
