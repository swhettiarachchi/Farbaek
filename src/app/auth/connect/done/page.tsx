import { ArrowSquareOutIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonClasses } from "@/components/ui/button";
import { CODE_PATTERN, STATE_PATTERN, callbackUrl } from "@/server/phone/tokens";

export const metadata: Metadata = { title: "Back to the Farbaek app", robots: { index: false, follow: false }, referrer: "no-referrer" };

const ERRORS: Record<string, string> = {
  invalid_request: "The app's request wasn't complete. Close this and tap Sign in again.",
  too_many: "Several sign-ins are already waiting. Wait two minutes, then tap Sign in again.",
};

/**
 * The hand-back to the app (ADR 0110). The browser sheet that opened the
 * sign-in watches for farbaek:// and closes on it; the button is there for
 * the moment it doesn't. The code works once, for two minutes, and only with
 * the verifier the app kept.
 */
export default async function ConnectDonePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const state = typeof q.state === "string" && STATE_PATTERN.test(q.state) ? q.state : null;
  const code = typeof q.code === "string" && CODE_PATTERN.test(q.code) ? q.code : null;
  const error = typeof q.error === "string" && Object.hasOwn(ERRORS, q.error) ? q.error : null;
  const target = state && (code || error) ? callbackUrl(code ? { code, state } : { error: error!, state }) : null;

  return (
    <main className="mx-auto grid min-h-[100dvh] w-full max-w-[480px] content-center gap-8 px-4 py-10">
      {target ? <meta httpEquiv="refresh" content={`0;url=${target}`} /> : null}
      <div className="flex items-center gap-2">
        <BrandLogo height={40} preload />
        <span className="text-[18px] font-semibold tracking-[-0.02em]">Farbaek</span>
      </div>
      <div className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
        <div className="rounded-md bg-surface p-6 shadow-e1" role="status">
          {code ? <CheckCircleIcon size={28} weight="fill" className="text-verified" aria-hidden /> : <WarningCircleIcon size={28} className="text-failed" aria-hidden />}
          <h1 className="mt-4 text-xl font-medium tracking-[-0.02em]">{code ? "Connected. Back to the app" : "The phone wasn't connected"}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            {code ? "The Farbaek app finishes signing in on its own. If it didn't open, tap the button." : error ? ERRORS[error] : "This page opens from the Farbaek app. Open it on your phone and tap Sign in."}
          </p>
          {target ? (
            <a href={target} className={buttonClasses("primary", "md", "mt-6 min-h-11 w-full")}>
              Open the Farbaek app
              <ArrowSquareOutIcon size={16} weight="bold" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}
