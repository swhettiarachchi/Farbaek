"use client";

/**
 * Plans bought through Google Play inside Farbaek for Android (ADR 0154),
 * the way Farbaek for iPhone buys through the App Store (ADR 0112).
 *
 * Google's billing reaches the page through the Digital Goods API and the
 * Payment Request API, and only in the app installed from Google Play. These
 * are the pieces Billing's plan picker (`play-plans.tsx`), the pricing page
 * and the app's layout share. When Google Play isn't there, or the server
 * isn't selling through it, the app keeps ADR 0150's calm plan list. Nothing
 * here ever names another way to pay.
 */
import { GooglePlayLogoIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { claimGooglePlayPurchaseAction, type PlayActionResult } from "@/app/app/billing/actions";
import { useInAndroidApp } from "@/components/billing/web-purchase-only";
import { buttonClasses } from "@/components/ui/button";
import { formatUsd } from "@/core/billing/money";
import { GOOGLE_PLAY_BILLING_METHOD, GOOGLE_PLAY_PRODUCTS, googlePlayManageUrl } from "@/core/billing/google-play";

interface ItemDetails {
  itemId: string;
  price: { currency: string; value: string };
}
export interface PurchaseDetails {
  itemId: string;
  purchaseToken: string;
}
interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
}
type PlayWindow = Window & { getDigitalGoodsService?: (method: string) => Promise<DigitalGoodsService | null> };

/** Google Play's prices, formatted in the currency it charges this person (`currency`, such as "LKR"). */
type Play = { ok: true; service: DigitalGoodsService; prices: Map<string, string>; currency: string | null } | { ok: false };

let play: Promise<Play> | null = null;

/** Google's billing in this tab, asked once per page: absent in ordinary browsers and in an app not installed from Google Play. */
function loadPlay(): Promise<Play> {
  play ??= (async (): Promise<Play> => {
    const w = window as PlayWindow;
    if (typeof w.getDigitalGoodsService !== "function" || typeof window.PaymentRequest !== "function") return { ok: false };
    try {
      const service = await w.getDigitalGoodsService(GOOGLE_PLAY_BILLING_METHOD);
      if (!service) return { ok: false };
      const details = await service.getDetails(GOOGLE_PLAY_PRODUCTS.map((p) => p.productId));
      const prices = new Map<string, string>();
      let currency: string | null = null;
      for (const d of details) {
        const value = Number(d.price.value);
        if (Number.isFinite(value)) currency ??= d.price.currency.toUpperCase();
        // Whole amounts without decimals (LKR 3,200, not LKR 3,200.00); others as the currency writes them.
        const whole = Number.isInteger(value) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {};
        if (Number.isFinite(value)) prices.set(d.itemId, new Intl.NumberFormat(undefined, { style: "currency", currency: d.price.currency, ...whole }).format(value));
      }
      return { ok: true, service, prices, currency };
    } catch {
      return { ok: false };
    }
  })();
  return play;
}

/** Google Play's billing for a component: null while it's being asked. */
export function usePlay(): Play | null {
  const [state, setState] = useState<Play | null>(null);
  useEffect(() => {
    let alive = true;
    loadPlay().then((p) => {
      if (alive) setState(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// Prices show in US dollars unless the person picks their own currency; the choice is kept on this phone.
const CURRENCY_KEY = "farbaek-price-currency";
export type PriceCurrency = "usd" | "local";
let chosenCurrency: PriceCurrency | null = null;
const currencyListeners = new Set<() => void>();

function readCurrency(): PriceCurrency {
  if (chosenCurrency) return chosenCurrency;
  try {
    return window.localStorage.getItem(CURRENCY_KEY) === "local" ? "local" : "usd";
  } catch {
    return "usd";
  }
}

function subscribeCurrency(listener: () => void) {
  currencyListeners.add(listener);
  return () => {
    currencyListeners.delete(listener);
  };
}

function setPriceCurrency(c: PriceCurrency) {
  chosenCurrency = c;
  try {
    if (c === "local") window.localStorage.setItem(CURRENCY_KEY, c);
    else window.localStorage.removeItem(CURRENCY_KEY);
  } catch {
    // Storage is off: the choice lasts until the page closes.
  }
  for (const l of currencyListeners) l();
}

/** US dollars ("usd", the default) or Google Play's own currency for this person ("local"). */
export function usePriceCurrency(): PriceCurrency {
  return useSyncExternalStore(subscribeCurrency, readCurrency, () => "usd");
}

/** Whether Google Play charges this person in a currency other than US dollars, so the switch is worth showing. */
export function localCurrency(p: Play | null): string | null {
  return p?.ok && p.currency && p.currency !== "USD" ? p.currency : null;
}

/**
 * A plan's prices: `shown` in the chosen currency, `charged` as Google Play
 * charges it, and `usd`, the plan's US price in Google Play.
 */
export function playPrices(p: Play | null, productId: string, show: PriceCurrency): { shown: string; charged: string; usd: string } | null {
  const product = GOOGLE_PLAY_PRODUCTS.find((g) => g.productId === productId);
  const charged = p?.ok ? p.prices.get(productId) : undefined;
  if (!product || !charged) return null;
  const usd = localCurrency(p) ? formatUsd(product.usdCents) : charged;
  return { shown: show === "local" ? charged : usd, charged, usd };
}

/** "Prices in" US dollars or the person's own currency: a pill switch, shown only when Google Play charges in another currency. */
export function CurrencyToggle({ currency }: { currency: string }) {
  const show = usePriceCurrency();
  const options = [
    { id: "usd", label: "USD" },
    { id: "local", label: currency },
  ] as const;
  return (
    <div className="inline-flex shrink-0 rounded-full border border-line bg-surface p-1" role="group" aria-label="Show prices in">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={show === o.id}
          onClick={() => setPriceCurrency(o.id)}
          className={`min-h-11 min-w-16 rounded-full px-4 text-sm tabular transition-colors duration-150 ${show === o.id ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A purchase whose claim didn't finish (offline, server busy) is kept on this phone and tried again.
const PENDING_KEY = "farbaek-play-pending";

function readPending(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writePending(tokens: string[]) {
  try {
    if (tokens.length) window.localStorage.setItem(PENDING_KEY, JSON.stringify(tokens.slice(-5)));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage is off: the hourly check and the next app start still find it through Google.
  }
}

/** Codes worth trying again later; any other answer is final for that purchase. */
const RETRY = new Set(["GOOGLE_UNAVAILABLE", "NOT_OPEN"]);

/** Sends a purchase to the server, keeping it on this phone until the answer is final. */
export async function claim(token: string): Promise<PlayActionResult> {
  writePending([...readPending().filter((t) => t !== token), token]);
  const r = await claimGooglePlayPurchaseAction(token);
  if (r.ok || !RETRY.has(r.code)) writePending(readPending().filter((t) => t !== token));
  return r;
}

/** Google Play's own page for this subscription: managing and cancelling happen there, as with the App Store's Subscriptions. */
export function ManageInGooglePlay({ productId }: { productId: string | null }) {
  return (
    <a href={googlePlayManageUrl(productId)} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm")}>
      <GooglePlayLogoIcon size={16} aria-hidden /> Manage in Google Play
    </a>
  );
}

/**
 * In the app's layout: when Farbaek for Android opens, purchases whose claim
 * didn't finish, and the person's current Google Play purchases, are sent to
 * the server again, so a renewal, a cancel or a resubscribe in the Play Store
 * shows straight away. At most once every 5 minutes per tab.
 */
export function PlayPurchaseRecovery({ enabled }: { enabled: boolean }) {
  const inApp = useInAndroidApp();
  const router = useRouter();
  useEffect(() => {
    if (!enabled || !inApp) return;
    const KEY = "farbaek-play-checked";
    try {
      const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < 5 * 60_000) return;
      window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Without session storage it still runs, once per page load.
    }
    let alive = true;
    void (async () => {
      const p = await loadPlay();
      if (!p.ok || !alive) return;
      const held = (await p.service.listPurchases().catch(() => [] as PurchaseDetails[])).filter((x) => GOOGLE_PLAY_PRODUCTS.some((g) => g.productId === x.itemId)).map((x) => x.purchaseToken);
      const tokens = [...new Set([...readPending(), ...held])];
      let changed = false;
      for (const t of tokens) {
        if (!alive) return;
        const r = await claim(t);
        if (r.ok) changed = true;
      }
      if (changed && alive) router.refresh();
    })();
    return () => {
      alive = false;
    };
  }, [enabled, inApp, router]);
  return null;
}

/**
 * A plan's price on the pricing page. Inside the Android app, when Google
 * Play sells it, it's Google Play's price: in US dollars, or in the
 * person's own currency when they chose it. Anywhere else it's the web price.
 */
export function PlayPrice({
  ready,
  productId,
  children,
  amountClass,
  perClass = "ml-1 text-sm font-normal text-ink-3",
}: {
  ready: boolean;
  productId: string | null;
  children: React.ReactNode;
  amountClass?: string;
  perClass?: string;
}) {
  const inApp = useInAndroidApp();
  const p = usePlay();
  const show = usePriceCurrency();
  // Hidden by CSS inside the Android app, from the first paint (ADR 0171).
  const web = (
    <span data-web-purchase className="contents">
      {children}
    </span>
  );
  if (!inApp || !ready || !productId) return web;
  if (p === null) return <span className={amountClass ?? "text-ink-3"}>…</span>;
  const price = playPrices(p, productId, show);
  if (!price) return web;
  return (
    <>
      <span className={amountClass}>{price.shown}</span>
      <span className={perClass}>a month</span>
    </>
  );
}
