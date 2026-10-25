import { ClockIcon, DesktopIcon, DeviceMobileIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/app/primitives";
import { OfficeActionForm } from "@/components/office/action-form";
import { StepUpField, officeInputClass } from "@/components/office/fields";
import { LocalTime } from "@/components/ui/local-time";
import type { StaffDevice } from "@/server/office/staff-store";
import { approveDeviceAction, revokeDeviceAction } from "./actions";
import { AddDeviceForm } from "./add-device-form";

const isPhone = (label: string) => /iPhone|iPad|Android/.test(label);

/**
 * Your Office Space devices (ADR 0069). Trusted ones can open the office;
 * waiting ones need the code that only they show, plus a fresh authenticator
 * code, from this trusted device.
 */
export function DevicesCard({ devices, currentHash }: { devices: StaffDevice[] | null; currentHash: string | null }) {
  const trusted = (devices ?? []).filter((d) => d.state === "trusted");
  const waiting = (devices ?? []).filter((d) => d.state === "waiting");

  return (
    <Card>
      <h2 className="text-lg font-medium">Devices</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">Office Space opens only on these. Every other device sees nothing at officespace.farbaek.com, not even the sign-in page.</p>

      {devices === null ? (
        <p className="mt-4 text-sm text-failed">Your devices couldn&apos;t be loaded. Reload the page.</p>
      ) : (
        <>
          {waiting.length > 0 ? (
            <ul className="mt-4 grid gap-3">
              {waiting.map((d) => (
                <li key={d.id} className="grid gap-3 rounded-sm border border-approval/40 bg-approval/[0.05] p-4">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <ClockIcon size={18} weight="bold" className="text-approval" aria-hidden />
                    <span className="font-medium">{d.label}</span>
                    <span className="text-ink-2">
                      is waiting, asked <LocalTime iso={d.requestedAt} />
                    </span>
                  </p>
                  <OfficeActionForm action={approveDeviceAction} submit={`Approve ${d.label}`} className="grid gap-3">
                    <input type="hidden" name="deviceId" value={d.id} />
                    <label htmlFor={`device-code-${d.id}`} className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">Code the new device shows</span>
                      <input id={`device-code-${d.id}`} name="code" required inputMode="numeric" autoComplete="off" pattern="[0-9 ]{6,7}" maxLength={7} className={`${officeInputClass} font-mono tracking-[0.3em]`} />
                    </label>
                    <StepUpField id={`device-totp-${d.id}`} />
                  </OfficeActionForm>
                  <details className="text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center text-ink-2 hover:text-ink">Not yours? Remove this request</summary>
                    <OfficeActionForm action={revokeDeviceAction} submit="Remove the request" tone="danger" className="mt-2 grid gap-3">
                      <input type="hidden" name="deviceId" value={d.id} />
                    </OfficeActionForm>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="mt-4 grid gap-3">
            {trusted.map((d) => {
              const here = d.tokenHash === currentHash;
              const Icon = isPhone(d.label) ? DeviceMobileIcon : DesktopIcon;
              return (
                <li key={d.id} className="grid gap-2 rounded-sm border border-line p-4">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Icon size={18} className="text-ink-2" aria-hidden />
                    <span className="font-medium">{d.label}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-verified/35 bg-verified/[0.06] px-2 py-0.5 text-xs font-medium text-verified">
                      <SealCheckIcon size={12} weight="fill" aria-hidden /> Trusted
                    </span>
                    {here ? <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">This device</span> : null}
                  </p>
                  <p className="text-xs text-ink-3">
                    {d.approvedVia === "first_device" ? "Your first device, trusted" : "Approved"} {d.approvedAt ? <LocalTime iso={d.approvedAt} /> : null}. Last used <LocalTime iso={d.lastSeenAt} />.
                  </p>
                  {trusted.length > 1 ? (
                    <details className="text-sm">
                      <summary className="flex min-h-11 cursor-pointer items-center text-ink-2 hover:text-ink">Remove {here ? "this device" : d.label}</summary>
                      <p className="mt-1 text-xs leading-relaxed text-ink-3">
                        {here
                          ? "This device stops opening the office straight away. To use it again, make a device code on another trusted device."
                          : "It stops opening the office at its next page. To use it again, make a device code for it here."}
                      </p>
                      <OfficeActionForm action={revokeDeviceAction} submit={here ? "Remove this device" : `Remove ${d.label}`} tone="danger" className="mt-2 grid gap-3">
                        <input type="hidden" name="deviceId" value={d.id} />
                      </OfficeActionForm>
                    </details>
                  ) : (
                    // The last trusted device can't be removed (migration v45): the office would reopen to anyone.
                    <p className="text-xs leading-relaxed text-ink-3">Your only trusted device stays until you add another, so the office can&apos;t open to anyone else.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-base font-medium">Add a device</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">A new phone or computer needs a one-time code from here before it can even see the sign-in page.</p>
        <div className="mt-4">
          <AddDeviceForm />
        </div>
      </div>
    </Card>
  );
}
