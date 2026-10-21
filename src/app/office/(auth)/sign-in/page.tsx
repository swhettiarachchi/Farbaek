import { InfoIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/server/office/access";
import { CODE_SENT_MESSAGE } from "@/server/office/sign-in";
import { SignInSteps } from "../steps";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function OfficeSignIn({ searchParams }: { searchParams: Promise<{ ended?: string; code?: string }> }) {
  const r = await getStaff();
  if (r.ok) redirect("/");
  if (!r.ok && r.reason === "verify") redirect("/verify");
  const { ended, code } = await searchParams;

  return (
    <div className="grid gap-6">
      <SignInSteps current={0} />
      <div>
        <h2 className="text-2xl font-medium tracking-[-0.02em]">Sign in to Office Space</h2>
        <p className="mt-1.5 text-sm text-ink-2">For Farbaek staff only. We&apos;ll email you a code.</p>
      </div>
      {ended ? (
        <p className="flex items-start gap-2 rounded-sm border border-info/25 bg-info/[0.05] px-4 py-3 text-sm">
          <InfoIcon size={18} weight="bold" className="mt-px shrink-0 text-info" aria-hidden /> Your session ended, so nobody can use it from this browser. Sign in again to carry on.
        </p>
      ) : null}
      {code ? (
        <p className="flex items-start gap-2 rounded-sm border border-info/25 bg-info/[0.05] px-4 py-3 text-sm">
          <InfoIcon size={18} weight="bold" className="mt-px shrink-0 text-info" aria-hidden /> Office Space signs in with the 6-digit code from that email, not its link. Enter your address to get a fresh code.
        </p>
      ) : null}
      <SignInForm sentMessage={CODE_SENT_MESSAGE} />
    </div>
  );
}
