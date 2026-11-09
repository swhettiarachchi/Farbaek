import { DevicesIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { CardTitle } from "@/components/app/primitives";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { deviceLabel } from "@/core/office/devices";
import { firstFactorAt } from "@/core/office/session-policy";
import { officeClients } from "@/server/office/access";
import { currentDeviceHash } from "@/server/office/devices";
import { requestMeta } from "@/server/office/request-meta";
import { officeAuth } from "@/server/office/supabase-auth";
import { SignInSteps } from "../steps";
import { ContinueForm } from "./continue-form";

export const metadata: Metadata = { title: "Approve this device" };

/**
 * A device that isn't trusted yet (ADR 0069). After both codes, it shows the
 * code that only this device ever shows; approving it from a trusted device
 * lets this one in.
 *
 * It never calls getStaff(): that ends any sign-in without an office session,
 * and a device waiting for approval has none yet, so the phone was sent back
 * to the sign-in page (tests/design/office-device-page.test.ts).
 */
export default async function OfficeDevice() {
  const clients = await officeClients();
  if (!clients) redirect("/sign-in");
  const claims = await officeAuth(clients.client).claims();
  if (!claims || !firstFactorAt(claims.amr)) redirect("/sign-in");
  if (claims.aal !== "aal2") redirect("/verify");

  const meta = await requestMeta();
  const hash = await currentDeviceHash();
  const label = deviceLabel(meta.userAgent);
  const check = hash ? await clients.store.checkDevice(claims.sub, { hash, label }, clients.office.ownerEmail, meta) : null;
  if (check?.ok && check.value.status === "not_staff") redirect("/not-staff");
  const code = check?.ok && check.value.status === "pending" ? check.value.code : null;
  const trusted = check?.ok && check.value.status === "trusted";
  // Already in on this device: straight to the console.
  if (trusted && claims.session_id) {
    const session = await clients.store.checkSession({ userId: claims.sub, sessionId: claims.session_id });
    if (session.ok && session.value.status === "active") redirect("/");
  }

  return (
    <div className="grid gap-6">
      <SignInSteps current={2} />
      <div>
        <CardTitle icon={DevicesIcon}>{trusted ? "This device is approved" : "Approve this device"}</CardTitle>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          {trusted
            ? "You can open the office on it now."
            : "Office Space only opens on devices you trust. This one is new, so approve it from a device you've already used."}
        </p>
      </div>

      {code ? (
        <>
          <div className="rounded-md border border-line bg-surface-sunken p-5 text-center">
            <p className="text-sm text-ink-2">Device code for {label}</p>
            <p className="mt-2 font-mono text-[2rem] font-semibold tracking-[0.3em] text-ink tabular">
              {code.slice(0, 3)} {code.slice(3)}
            </p>
          </div>
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed text-ink-2 marker:text-ink-3">
            <li>On your trusted computer or phone, open Office Space, then My security.</li>
            <li>Under Devices, find {label}, enter this code and a fresh authenticator code, and approve it.</li>
            <li>Come back here and select Continue.</li>
          </ol>
        </>
      ) : !trusted && !hash ? (
        <p className="text-sm leading-relaxed text-ink-2">Select Continue to check this device. If it&apos;s your first, it&apos;s trusted straight away; otherwise you&apos;ll get its code.</p>
      ) : !trusted ? (
        <p role="alert" className="flex items-start gap-2 rounded-sm border border-line bg-surface-raised/70 p-3 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>This device couldn&apos;t be checked. Select Continue to try again, or sign in again on it.</span>
        </p>
      ) : null}

      <ContinueForm />
      <p className="text-xs leading-relaxed text-ink-3">
        Lost every device you trust? The owner can reset your devices on Farbaek&apos;s server; the next device you sign in on is then trusted.
      </p>
    </div>
  );
}
