import { ProhibitIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { CardTitle } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access" };

export default function OfficeNotStaff() {
  return (
    <div className="grid gap-4">
      <CardTitle icon={ProhibitIcon}>This account can&apos;t use Office Space</CardTitle>
      <p className="text-sm leading-relaxed text-ink-2">
        Office Space is for Farbaek&apos;s staff. If you should have access, ask an owner to invite this address, then sign in within the invite&apos;s time. You&apos;ve been signed out here.
      </p>
      <Link href="/sign-in" className={buttonClasses("secondary", "sm", "justify-self-start")}>
        Back to sign-in
      </Link>
    </div>
  );
}
