import { ChatTextIcon, CheckCircleIcon, ClipboardTextIcon, HammerIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CONTACT } from "@/config/contact";
import { oauthAvailable } from "@/server/auth/oauth-wiring";
import { turnstileSiteKey } from "@/server/auth/captcha";
import { readSupabaseConfig, safeNextPath, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { KeptPrompt } from "./kept-prompt";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/** What happens after signing in: the real order of a first build. */
const NEXT_STEPS: { icon: Icon; title: string; body: string }[] = [
  { icon: ChatTextIcon, title: "Describe it", body: "One sentence is enough: what it is and who it's for." },
  { icon: ClipboardTextIcon, title: "Approve the plan", body: "Farbaek drafts what it will build and how it will check it. Nothing starts until you approve." },
  { icon: HammerIcon, title: "The agent builds it", body: "In the cloud, on Farbaek's AI, designed to the Studio standard. You can message it while it works." },
  { icon: SealCheckIcon, title: "Review, apply, publish", body: "See every change before it lands, then put a static site live at its own address." },
];

/** Why the last try didn't sign in, from /auth/callback, /auth/google and /auth/apple. */
const NOTICES: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one.",
  google: "Google didn't finish signing you in. Try again, or use your email.",
  google_off: "Signing in with Google isn't available right now. Use your email instead.",
  apple: "Apple didn't finish signing you in. Try again, or use your email.",
  apple_off: "Sign in with Apple isn't available right now. Use your email instead.",
  limited: "Too many sign-in attempts from this network. Wait a few minutes and try again.",
};

/** The page's first line: the ways in it offers, in the order the buttons show. */
function intro(google: boolean, apple: boolean): string {
  const names = [google ? "Google" : null, apple ? "Apple" : null].filter(Boolean).join(" or ");
  return names ? `No password: continue with ${names}, or we email you a one-time link.` : "No password. We email you a one-time link.";
}

/** While the Farbaek app signs in (ADR 0110): the origins its sign-in links may come from. */
function phoneSignIn(next: string) {
  if (!next.startsWith("/auth/connect")) return null;
  const config = readSupabaseConfig();
  return { siteOrigin: new URL(siteUrl()).origin, authOrigin: config ? new URL(config.url).origin : null };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: rawNext } = await searchParams;
  // Where to go after signing in, such as an invitation. Only paths on this site.
  const next = safeNextPath(rawNext);
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect(next);
  }
  const [google, apple] = supabase ? await Promise.all([oauthAvailable("google"), oauthAvailable("apple")]) : [false, false];

  return (
    <Container className="grid min-h-[calc(100dvh-4rem)] items-center gap-12 py-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16 lg:py-16">
      <div className="w-full max-w-[440px] justify-self-center lg:justify-self-start">
        <h1 className="text-[2.4rem] font-medium leading-[1.05] tracking-[-0.035em]">Sign in to Farbaek</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
          {intro(google, apple)} New workspaces start with a 14-day Pro trial, with no card.
        </p>
        <div className="mt-8 rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
          <div className="rounded-md bg-surface p-5 shadow-e1 sm:p-6">
            <KeptPrompt />
            {supabase ? (
              <SignInForm notice={error && Object.hasOwn(NOTICES, error) ? NOTICES[error]! : null} providers={{ google, apple }} next={next} captchaSiteKey={turnstileSiteKey()} phone={phoneSignIn(next)} />
            ) : (
              <p className="rounded-sm border border-dashed border-line-strong/60 p-5 text-sm text-ink-2">
                Sign-in isn&apos;t connected in this environment. Add the Supabase URL and publishable key to <code>.env.local</code>.
              </p>
            )}
          </div>
        </div>
        <p className="mt-6 text-sm text-ink-2">
          Trouble signing in? Write to{" "}
          <a href={`mailto:${CONTACT.support}`} className="font-medium text-accent hover:underline">
            {CONTACT.support}
          </a>
          .
        </p>
        {supabase ? (
          // App store review accounts (ADR 0151): the only accounts with a password.
          <p className="text-sm text-ink-2">
            App review account?{" "}
            <Link href={`/sign-in/password?${new URLSearchParams({ next })}`} className="inline-flex min-h-11 items-center font-medium text-accent hover:underline">
              Sign in with a password
            </Link>
          </p>
        ) : null}
      </div>

      <section aria-labelledby="next-title" className="aurora hidden lg:block">
        <div className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
          <div className="rounded-md bg-surface p-8 shadow-e2">
            <h2 id="next-title" className="text-[1.35rem] font-medium tracking-[-0.02em]">
              What happens next
            </h2>
            <ol className="relative mt-7 grid gap-6">
              <span aria-hidden className="absolute bottom-5 left-5 top-5 w-px origin-top bg-gradient-to-b from-accent to-line motion-safe:animate-[signin-line_1.2s_cubic-bezier(0.32,0.72,0,1)_both]" />
              {NEXT_STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="relative flex gap-4 motion-safe:animate-[usage-in_600ms_cubic-bezier(0.32,0.72,0,1)_both]"
                  style={{ animationDelay: `${200 + i * 120}ms` }}
                >
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent shadow-e1 ring-1 ring-line">
                    <s.icon size={19} aria-hidden />
                  </span>
                  <span>
                    <span className="block font-medium">{s.title}</span>
                    <span className="mt-1 block max-w-[42ch] text-sm leading-relaxed text-ink-2">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex items-center gap-2 border-t border-line pt-5 text-sm text-ink-2">
              <CheckCircleIcon size={16} weight="bold" className="text-verified" aria-hidden /> No API key to bring: the AI is part of every plan.
            </p>
          </div>
        </div>
      </section>
    </Container>
  );
}
