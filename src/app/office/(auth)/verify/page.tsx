import { KeyIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { CardTitle } from "@/components/app/primitives";
import { redirect } from "next/navigation";
import { firstFactorAt } from "@/core/office/session-policy";
import { getStaff, officeClients } from "@/server/office/access";
import { officeAuth } from "@/server/office/supabase-auth";
import { SignInSteps } from "../steps";
import { TotpForm } from "./totp-form";

export const metadata: Metadata = { title: "Authenticator code" };

export default async function OfficeVerify() {
  const r = await getStaff();
  if (r.ok) redirect("/");
  const clients = await officeClients();
  if (!clients) redirect("/sign-in");
  const auth = officeAuth(clients.client);
  const claims = await auth.claims();
  if (!claims || !firstFactorAt(claims.amr)) redirect("/sign-in");
  if ((await auth.verifiedTotp()).length === 0) redirect("/enroll");

  return (
    <div className="grid gap-6">
      <SignInSteps current={1} />
      <div>
        <CardTitle icon={KeyIcon}>Your authenticator code</CardTitle>
        <p className="mt-1.5 text-sm text-ink-2">Open your authenticator app and enter the 6-digit code for Farbaek Office Space.</p>
      </div>
      <TotpForm />
      <p className="text-xs leading-relaxed text-ink-3">Lost your phone? Ask an owner to let you add a new authenticator. Nobody can do it from an email alone.</p>
    </div>
  );
}
