"use client";

import { useEffect, type ReactNode } from "react";
import { claimDevice, forgetDevice } from "./device-store";

/** On every signed-in page: copies another account kept in this browser are removed (ADR 0192). Renders nothing. */
export function DeviceOwner({ userId }: { userId: string }) {
  useEffect(() => {
    claimDevice(userId).catch(() => undefined);
  }, [userId]);
  return null;
}

/**
 * Sign out, removing what this browser kept for the account first. Saves
 * still waiting stay, so nothing typed offline is lost; the device page says
 * whose they are.
 */
export function SignOutForm({ action, className, children }: { action: () => Promise<void>; className?: string; children: ReactNode }) {
  return (
    <form
      className={className}
      action={async () => {
        await forgetDevice().catch(() => undefined);
        await action();
      }}
    >
      {children}
    </form>
  );
}

/** After an account is deleted: nothing it kept stays in this browser, not even unsent saves. Renders nothing. */
export function ForgetDeviceNow() {
  useEffect(() => {
    forgetDevice({ evenWaiting: true }).catch(() => undefined);
  }, []);
  return null;
}
