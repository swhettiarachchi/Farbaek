"use client";

import { CheckCircleIcon, DeviceMobileIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { disconnectPhoneAction, type DisconnectState } from "@/app/app/phone-actions";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";

export interface PhoneRow {
  id: string;
  name: string;
  platform: "ios" | "android";
  appVersion: string | null;
  lastSeenAt: string;
}

/**
 * Phones signed in with the Farbaek app (ADR 0110), with a way to disconnect
 * each. One action state for the list, so the result stays on screen after
 * the phone's row is gone.
 */
export function Phones({ phones, disabledReason }: { phones: PhoneRow[]; disabledReason: string | null }) {
  const [state, action, pending] = useActionState<DisconnectState, FormData>(disconnectPhoneAction, { status: "idle" });
  return (
    <div>
      <h2 id="phones-title" className="text-lg font-medium">
        Phones
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">Phones signed in with the Farbaek app. Disconnecting one signs the app out there and stops its notifications.</p>
      {state.status === "done" ? (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-verified">
          <CheckCircleIcon size={16} weight="fill" aria-hidden />
          {state.message}
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-failed">
          <WarningCircleIcon size={16} aria-hidden />
          {state.message}
        </p>
      ) : null}
      {phones.length === 0 ? (
        <p className="mt-4 rounded-sm border border-dashed border-line-strong/60 p-4 text-sm text-ink-2">
          {disabledReason ?? "No phones are signed in. When you sign in with the Farbaek app, the phone appears here."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {phones.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <DeviceMobileIcon size={22} className="shrink-0 text-ink-2" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-ink-3">
                    {p.platform === "ios" ? "iPhone app" : "Android app"}
                    {p.appVersion ? ` ${p.appVersion}` : ""}, last used <RelativeTime iso={p.lastSeenAt} />
                  </p>
                </div>
              </div>
              <form action={action}>
                <input type="hidden" name="deviceId" value={p.id} />
                <button type="submit" disabled={pending} className={buttonClasses("secondary", "sm", "min-h-11")} aria-label={`Disconnect ${p.name}`}>
                  Disconnect
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
