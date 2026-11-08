import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CONTACT } from "@/config/contact";
import { turnstileSiteKey } from "@/server/auth/captcha";
import { safeNextPath } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { PasswordSignInForm } from "./password-form";

export const metadata: Metadata = {
  title: "Sign in with a password",
  robots: { index: false, follow: false },
};

/**
 * Signing in with a password (ADR 0151). Only accounts Farbaek set up with a
 * password have one, such as the review accounts app stores ask for. Everyone
 * else signs in on /sign-in with an email link, Google or Apple.
 */
export default async function PasswordSignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect(next);
  }
  const back = `/sign-in?${new URLSearchParams({ next })}`;

  return (
    <Container className="grid min-h-[calc(100dvh-4rem)] items-center py-12 lg:py-16">
      <div className="w-full max-w-[440px] justify-self-center">
        <h1 className="text-[2.4rem] font-medium leading-[1.05] tracking-[-0.035em]">Sign in with a password</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
          For accounts Farbaek set up with a password, such as app store review accounts. Every other account signs in with an email link, Google or Apple.
        </p>
        <div className="mt-8 rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
          <div className="rounded-md bg-surface p-5 shadow-e1 sm:p-6">
            {supabase ? (
              <PasswordSignInForm next={next} captchaSiteKey={turnstileSiteKey()} />
            ) : (
              <p className="flex items-start gap-2.5 rounded-sm border border-line bg-surface-raised/70 px-4 py-3 text-sm text-ink">
                <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
                <span>
                  Sign-in isn&apos;t connected in this environment. Add the Supabase URL and publishable key to <code>.env.local</code>.
                </span>
              </p>
            )}
          </div>
        </div>
        <p className="mt-6 text-sm text-ink-2">
          <Link href={back} className="inline-flex min-h-11 items-center font-medium text-accent hover:underline">
            Sign in with an email link instead
          </Link>
        </p>
        <p className="text-sm text-ink-2">
          Trouble signing in? Write to{" "}
          <a href={`mailto:${CONTACT.support}`} className="font-medium text-accent hover:underline">
            {CONTACT.support}
          </a>
          .
        </p>
      </div>
    </Container>
  );
}
