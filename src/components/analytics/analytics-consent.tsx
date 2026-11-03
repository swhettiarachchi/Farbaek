"use client";

/**
 * Google Analytics on Farbaek's public pages, only after the visitor allows
 * it (ADR 0155). Until then nothing from Google loads. "Don't allow" is as
 * easy as "Allow", and Cookie choices in the footer brings the question back.
 * Inside Farbaek for Android it never shows and never loads.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import { useInAndroidApp } from "@/components/billing/web-purchase-only";
import { buttonClasses } from "@/components/ui/button";
import { GA_MEASUREMENT_ID } from "@/config/analytics";
import { CONSENT_KEY, isAnalyticsCookie, isPrivatePath, mayLoad, readChoice, shouldAsk, storeChoice, validMeasurementId, type AnalyticsChoice } from "@/core/analytics/consent";

// The choice lives in this browser's storage; this keeps the banner and the footer button in step.
const listeners = new Set<() => void>();
let reopened = false;
let inMemory: string | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return inMemory;
  }
}

const snapshot = () => `${reopened ? "1" : "0"}${readRaw() ?? ""}`;
const serverSnapshot = () => "0";

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function useChoice(): { choice: AnalyticsChoice | null; reopened: boolean } {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { choice: readChoice(snap.slice(1) || null, new Date()), reopened: snap.startsWith("1") };
}

/** Stops Google Analytics on this page and removes its cookies. */
function stopAnalytics(id: string) {
  (window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = true;
  const host = window.location.hostname;
  const labels = host.split(".");
  // The cookies sit on the widest domain the site may use (".farbaek.com"), or on the host itself.
  const domains = ["", ...labels.slice(0, -1).map((_, i) => `; domain=.${labels.slice(i).join(".")}`)];
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0]?.trim() ?? "").filter(isAnalyticsCookie)) {
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
  }
}

function choose(choice: AnalyticsChoice) {
  const raw = storeChoice(choice, new Date());
  try {
    window.localStorage.setItem(CONSENT_KEY, raw);
  } catch {
    // Storage is off: the choice lasts until the page closes.
    inMemory = raw;
  }
  reopened = false;
  if (validMeasurementId(GA_MEASUREMENT_ID)) {
    if (choice === "declined") stopAnalytics(GA_MEASUREMENT_ID);
    else (window as unknown as Record<string, boolean>)[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
  }
  emit();
}

/** In the site's layout: the question when there's no choice yet, and Google's tag once it's allowed. */
export function AnalyticsConsent() {
  const inApp = useInAndroidApp();
  const { choice, reopened: open } = useChoice();
  const id = GA_MEASUREMENT_ID;
  const ask = shouldAsk(id, choice, inApp) || (open && validMeasurementId(id) && !inApp);
  return (
    <>
      {mayLoad(id, choice, inApp) && id ? <GoogleTag id={id} /> : null}
      {ask ? <ChoiceCard current={choice} /> : null}
    </>
  );
}

type DataLayerWindow = Window & { dataLayer?: unknown[] };

/** Google's command queue: gtag.js reads each call's arguments object, not an array. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  const w = window as DataLayerWindow;
  w.dataLayer = w.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

function GoogleTag({ id }: { id: string }) {
  const pathname = usePathname();

  // One page view per public page, sent by Farbaek: the path only, never a query string, and never a private path such as an invite link.
  useEffect(() => {
    const hidden = isPrivatePath(pathname);
    (window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = hidden;
    if (hidden) return;
    const timer = window.setTimeout(() => gtag("event", "page_view", { page_location: `${window.location.origin}${pathname}`, page_title: document.title }), 0);
    return () => window.clearTimeout(timer);
  }, [id, pathname]);

  // Leaving the public site (for the signed-in app) turns the tag off for the rest of that page's life.
  useEffect(() => () => void ((window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = true), [id]);

  // Advertising features stay off, and Google sends no page views of its own (they would carry the full address).
  const init = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});gtag('js',new Date());gtag('config','${id}',{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});`;
  return (
    <>
      <Script id="ga-init" strategy="afterInteractive">
        {init}
      </Script>
      <Script id="ga-tag" src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
    </>
  );
}

function ChoiceCard({ current }: { current: AnalyticsChoice | null }) {
  return (
    <section
      aria-labelledby="cookie-choices-title"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-md border border-line bg-surface p-4 shadow-e3 motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both] sm:inset-x-auto sm:left-6 sm:bottom-6 sm:mx-0 sm:p-5"
    >
      <h2 id="cookie-choices-title" className="font-medium">
        Can we count your visit?
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        Google Analytics would show us which pages help people. It sets cookies, and nothing is collected unless you allow it.
      </p>
      {current ? <p className="mt-2 text-sm text-ink-3">Right now: {current === "allowed" ? "allowed" : "not allowed"}.</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => choose("declined")} className={buttonClasses("secondary", "sm", "w-full")}>
          Don&apos;t allow
        </button>
        <button type="button" onClick={() => choose("allowed")} className={buttonClasses("secondary", "sm", "w-full")}>
          Allow
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Change it any time under Cookie choices at the bottom of the page. More in our{" "}
        <Link href="/privacy#cookies" className="underline hover:text-ink">
          Privacy Policy
        </Link>
        .
      </p>
    </section>
  );
}

/** The footer's way back to the question, shown only where analytics is set up. */
export function CookieChoicesButton() {
  const inApp = useInAndroidApp();
  if (!validMeasurementId(GA_MEASUREMENT_ID) || inApp) return null;
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          reopened = true;
          emit();
        }}
        className="inline-flex min-h-11 items-center text-ink-3 hover:text-ink"
      >
        Cookie choices
      </button>
    </li>
  );
}
