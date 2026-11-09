import { QrCodeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { CardTitle } from "@/components/app/primitives";
import { redirect } from "next/navigation";
import { firstFactorAt } from "@/core/office/session-policy";
import { getStaff, officeClients } from "@/server/office/access";
import { officeAuth } from "@/server/office/supabase-auth";
import { SignInSteps } from "../steps";
import { EnrollPanel } from "./enroll-panel";

export const metadata: Metadata = { title: "Set up your authenticator" };

export default async function OfficeEnroll() {
  const r = await getStaff();
  if (r.ok) redirect("/");
  const clients = await officeClients();
  if (!clients) redirect("/sign-in");
  const auth = officeAuth(clients.client);
  const claims = await auth.claims();
  if (!claims || !firstFactorAt(claims.amr)) redirect("/sign-in");
  if ((await auth.verifiedTotp()).length > 0) redirect("/verify");
  if (!(await clients.store.mayEnroll(claims.sub, clients.office.ownerEmail))) redirect("/not-staff");

  return (
    <div className="grid gap-6">
      <SignInSteps current={1} />
      <div>
        <CardTitle icon={QrCodeIcon}>Set up your authenticator</CardTitle>
        <p className="mt-1.5 text-sm text-ink-2">
          Office Space asks for a code from an authenticator app every time you sign in. Use one you trust, such as 1Password, Google Authenticator, Microsoft Authenticator or Authy.
        </p>
      </div>
      <EnrollPanel />
    </div>
  );
}
