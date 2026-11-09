import { CheckCircleIcon, DeviceMobileIcon, LinkBreakIcon, ProhibitIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonClasses } from "@/components/ui/button";
import { CHALLENGE_PATTERN, STATE_PATTERN, callbackUrl, cleanDeviceName, isPhonePlatform } from "@/server/phone/tokens";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { switchAccountAction } from "./actions";

export const metadata: Metadata = { title: "Connect the Farbaek app", robots: { index: false, follow: false } };

const CAN = ["See your workspaces, projects, builds and checks", "Approve or discard a change after you confirm it on the phone", "Start a build, approve its plan and answer the agent's questions"];
const CANNOT = ["Change billing, members or workspace settings", "Read your keys or connections"];

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-[100dvh] w-full max-w-[480px] content-center gap-8 px-4 py-10">
      <div className="flex items-center gap-2">
        <BrandLogo height={40} preload />
        <span className="text-[1.125rem] font-semibold tracking-[-0.02em]">Farbaek</span>
      </div>
      <div className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
        <div className="rounded-md bg-surface p-6 shadow-e1">{children}</div>
      </div>
    </main>
  );
}

/**
 * Where the Farbaek app's sign-in sheet lands (ADR 0110). The person signs in
 * as usual, sees exactly what the phone will be able to do, and agrees; the
 * form posts to Farbaek's own API, which answers the app with a one-time code.
 */
export default async function ConnectPhonePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const challenge = typeof q.challenge === "string" ? q.challenge : "";
  const state = typeof q.state === "string" ? q.state : "";
  const platform = q.platform;
  const device = typeof q.device === "string" ? q.device : "";

  if (!CHALLENGE_PATTERN.test(challenge) || !STATE_PATTERN.test(state) || !isPhonePlatform(platform)) {
    return (
      <Frame>
        <LinkBreakIcon size={32} className="text-failed" aria-hidden />
        <h1 className="mt-4 text-xl font-medium tracking-[-0.02em]">This page opens from the Farbaek app</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">The link is missing what the app sends. Open Farbaek on your phone and tap Sign in again.</p>
      </Frame>
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <Frame>
        <h1 className="text-xl font-medium tracking-[-0.02em]">Sign-in isn&apos;t connected here</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">This server has no accounts, so phones can&apos;t connect to it.</p>
      </Frame>
    );
  }
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const back = `/auth/connect?${new URLSearchParams({ challenge, state, platform, ...(device ? { device } : {}) })}`;
  if (!claims?.sub) redirect(`/sign-in?next=${encodeURIComponent(back)}`);

  const email = typeof claims.email === "string" ? claims.email : "your account";
  const name = cleanDeviceName(device, platform);
  const what = platform === "ios" ? "iPhone" : "phone";

  return (
    <Frame>
      <DeviceMobileIcon size={32} className="text-ink-2" aria-hidden />
      <h1 className="mt-4 text-[1.6rem] font-medium leading-tight tracking-[-0.03em]">Connect {name} to Farbaek</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
        Signed in as <span className="font-medium text-ink">{email}</span>. The app signs in as you, with its own session.
      </p>

      <h2 className="mt-6 text-sm font-medium">The app can</h2>
      <ul className="mt-2 grid gap-2">
        {CAN.map((line) => (
          <li key={line} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-2">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
      <h2 className="mt-5 text-sm font-medium">It can&apos;t</h2>
      <ul className="mt-2 grid gap-2">
        {CANNOT.map((line) => (
          <li key={line} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-2">
            <ProhibitIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            {line}
          </li>
        ))}
      </ul>

      <form method="post" action="/api/v1/app/connect" className="mt-7 grid gap-3">
        <input type="hidden" name="challenge" value={challenge} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="platform" value={platform} />
        <input type="hidden" name="device" value={name} />
        <button type="submit" className={buttonClasses("primary", "md", "min-h-11 w-full")}>
          Connect this {what}
        </button>
        <a href={callbackUrl({ error: "cancelled", state })} className={buttonClasses("ghost", "md", "min-h-11 w-full")}>
          Cancel
        </a>
      </form>
      {/* The app's sign-in sheet shares this browser's sign-in, so a phone that signed out lands here as the last account. */}
      <form action={switchAccountAction} className="mt-3 grid">
        <input type="hidden" name="challenge" value={challenge} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="platform" value={platform} />
        <input type="hidden" name="device" value={device} />
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full text-sm font-medium text-accent hover:underline">
          {typeof claims.email === "string" ? `Not ${claims.email}? Use another account` : "Use another account"}
        </button>
      </form>
      <p className="mt-5 text-sm leading-relaxed text-ink-3">You can disconnect it any time in Settings, under Phones.</p>
    </Frame>
  );
}
