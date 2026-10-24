import { DeviceMobileIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Card, Notice, PageHeader } from "@/components/app/primitives";
import { OfficeActionForm } from "@/components/office/action-form";
import { RoleBadge } from "@/components/office/badges";
import { StepUpField } from "@/components/office/fields";
import { LocalTime } from "@/components/ui/local-time";
import { OFFICE_POLICY } from "@/config/office";
import { requireStaff } from "@/server/office/access";
import { currentDeviceHash } from "@/server/office/devices";
import { officeAuth } from "@/server/office/supabase-auth";
import { endOtherSessionsAction, removeAuthenticatorAction } from "./actions";
import { AddAuthenticator } from "./add-authenticator";
import { DevicesCard } from "./devices";

export const metadata: Metadata = { title: "My security" };

export default async function OfficeSecurity() {
  const staff = await requireStaff();
  const factors = await officeAuth(staff.client).verifiedTotp();
  const devices = await staff.store.listDevices(staff.user.id);
  const currentHash = await currentDeviceHash();
  const endsAt = new Date(staff.firstFactorAt.getTime() + OFFICE_POLICY.maxSessionHours * 3_600_000).toISOString();

  return (
    <div className="grid gap-8">
      <PageHeader title="My security" description="Your devices, your authenticators and this office session." />

      {factors.length < 2 ? <Notice tone="warning">You have one authenticator. Add a second on another device, so a lost or broken phone doesn&apos;t lock you out.</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="text-lg font-medium">Authenticators</h2>
          <ul className="mt-4 grid gap-3">
            {factors.map((f) => (
              <li key={f.id} className="grid gap-3 rounded-sm border border-line p-4">
                <p className="flex items-center gap-2 text-sm">
                  <DeviceMobileIcon size={18} className="text-ink-2" aria-hidden />
                  <span className="font-medium">{f.friendlyName ?? "Authenticator app"}</span>
                </p>
                {factors.length > 1 ? (
                  <details className="text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center text-ink-2 hover:text-ink">Remove this authenticator</summary>
                    <OfficeActionForm action={removeAuthenticatorAction} submit="Remove it" tone="danger" className="mt-2 grid gap-3">
                      <input type="hidden" name="factorId" value={f.id} />
                      <StepUpField id={`remove-factor-${f.id}`} />
                    </OfficeActionForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <AddAuthenticator />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">This session</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">Signed in as</dt>
              <dd className="break-all text-right">{staff.user.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">Role</dt>
              <dd>
                <RoleBadge role={staff.role} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">Email code entered</dt>
              <dd>
                <LocalTime iso={staff.firstFactorAt.toISOString()} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">Ends at the latest</dt>
              <dd>
                <LocalTime iso={endsAt} />
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Signing in here ends any other office session of yours. A session also ends after {OFFICE_POLICY.idleMinutes} minutes without a click.
          </p>
          <OfficeActionForm action={endOtherSessionsAction} submit="End my other sessions" tone="secondary" className="mt-4 grid gap-2">
            <span className="sr-only">Ends every other office session of yours</span>
          </OfficeActionForm>
        </Card>
      </div>

      <DevicesCard devices={devices.ok ? devices.value : null} currentHash={currentHash} />
    </div>
  );
}
