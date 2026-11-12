import { CheckCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { PUBLIC_TITLE } from "@/components/ui/titles";
import { ForgetDeviceNow } from "@/components/device/device-account";

export const metadata: Metadata = {
  title: "Account deleted",
  robots: { index: false },
};

/** Where a person lands after deleting their account (ADR 0064). */
export default function AccountDeletedPage() {
  return (
    <section className="pt-16 pb-24 sm:pt-24">
      {/* Nothing the account kept for offline use stays in this browser (ADR 0192). */}
      <ForgetDeviceNow />
      <Container>
        <div className="max-w-[56ch]">
          <CheckCircleIcon size={32} weight="fill" className="text-verified" aria-hidden />
          <h1 className={`mt-5 ${PUBLIC_TITLE}`}>Your account is deleted.</h1>
          <p className="mt-5 text-title-4 leading-relaxed text-ink-2">
            Workspaces where you were the only member are gone, with their projects and published sites, and you&apos;ve left the others. Nightly backups that still hold
            your data are overwritten within 14 days.
          </p>
          <p className="mt-4 text-body leading-relaxed text-ink-3">
            You can sign up again with the same address any time. A new workspace starts on Free, since each address gets one trial.
          </p>
          <div className="mt-8">
            <ButtonLink href="/" variant="secondary">
              Back to Farbaek
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
