import { LockKeyIcon, ScrollIcon, TimerIcon } from "@phosphor-icons/react/ssr";
import { BrandLogo } from "@/components/brand/brand-logo";
import { deploymentName, EnvPill } from "@/components/office/badges";
import { OFFICE_POLICY } from "@/config/office";

/**
 * The way into Office Space: who it's for and what protects it on one side,
 * the current step on the other. Light theme, one accent, and no ornament
 * (ADR 0183).
 */
export default function OfficeAuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="main" className="mx-auto grid min-h-[100dvh] max-w-[1180px] content-start gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:content-center lg:items-center lg:gap-16 lg:py-12">
      <section className="grid content-start gap-8 lg:content-center">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo height={30} />
          <EnvPill label={deploymentName()} />
        </div>
        <div className="grid gap-4">
          <p className="text-sm font-medium text-ink-2">Office Space</p>
          <h1 className="max-w-[14ch] text-balance text-[clamp(2.2rem,5vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.04em]">Farbaek, from the inside.</h1>
          <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-2">The private office for Farbaek&apos;s staff: the whole platform in one place, for the people who run it.</p>
        </div>
        <ul className="hidden max-w-lg gap-4 sm:grid">
          <li className="flex gap-3 text-sm">
            <LockKeyIcon size={20} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="font-medium text-ink">Two codes to come in.</span> <span className="text-ink-2">One from your email, one from your authenticator app.</span>
            </span>
          </li>
          <li className="flex gap-3 text-sm">
            <TimerIcon size={20} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="font-medium text-ink">Short sessions.</span>{" "}
              <span className="text-ink-2">
                {OFFICE_POLICY.idleMinutes} minutes idle or {OFFICE_POLICY.maxSessionHours} hours in all, then you sign in again.
              </span>
            </span>
          </li>
          <li className="flex gap-3 text-sm">
            <ScrollIcon size={20} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="font-medium text-ink">Everything is on the record.</span> <span className="text-ink-2">Each action goes into a log that shows if anyone edits it.</span>
            </span>
          </li>
        </ul>
      </section>
      <section className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
        <div className="rounded-md bg-surface p-6 shadow-e2 sm:p-8">{children}</div>
      </section>
    </main>
  );
}
