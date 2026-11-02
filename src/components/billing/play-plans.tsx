"use client";

/**
 * Billing's plans inside Farbaek for Android when Google Play sells them
 * (ADR 0154): Google Play's own prices in the person's currency, one plan
 * picked at a time, and Google Play's terms right above the one button that
 * buys it. A workspace Google Play already bills switches plans here, and
 * Google replaces the subscription instead of adding a second one.
 *
 * Until the server sells through Google Play, or when this copy of the app
 * can't reach Google Play's billing, it shows the calm list ADR 0150 has.
 */
import { CheckCircleIcon, GooglePlayLogoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { openGooglePlayIntentAction } from "@/app/app/billing/actions";
import { CurrencyToggle, ManageInGooglePlay, claim, localCurrency, playPrices, usePlay, usePriceCurrency, type PurchaseDetails } from "@/components/billing/play-billing";
import { buttonClasses } from "@/components/ui/button";
import { GOOGLE_PLAY_BILLING_METHOD, GOOGLE_PLAY_PRODUCTS } from "@/core/billing/google-play";

/** A plan Google Play sells, as Billing describes it. */
export interface PlayPlanOption {
  planId: string;
  productId: string;
  name: string;
  sessions: string;
  limits: string;
  recommended: boolean;
}

interface PickerProps {
  options: readonly PlayPlanOption[];
  /** The workspace's plan, when it's one of these; a trial's plan can still be bought. */
  current: { planId: string; trial: boolean } | null;
  /** Google Play bills this workspace already, so a pick replaces that plan. */
  googleBilled: boolean;
  /** Google Play's plan is set to end: it's restored in Google Play before switching. */
  cancelling: boolean;
  canManage: boolean;
  /** Shown when this copy of the app can't reach Google Play's billing. */
  unavailable: ReactNode;
}

export function PlayPlans({ ready, fallback, ...picker }: PickerProps & { ready: boolean; fallback: ReactNode }) {
  return ready ? <Picker {...picker} /> : fallback;
}

type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

function Picker({ options, current, googleBilled, cancelling, canManage, unavailable }: PickerProps) {
  const p = usePlay();
  const show = usePriceCurrency();
  const router = useRouter();
  const mode = googleBilled ? "change" : "choose";
  // A first plan starts on the one the pricing page recommends; a switch starts on nothing.
  const [picked, setPicked] = useState<string | null>(() => (mode === "choose" ? (options.find((o) => o.recommended && !(o.planId === current?.planId && !current.trial))?.planId ?? null) : null));
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  if (p === null) return <PickerLoading rows={options.length} />;
  const priced = p.ok ? options.filter((o) => p.prices.has(o.productId)) : [];
  if (!p.ok || priced.length === 0) return unavailable;

  const locked = (o: PlayPlanOption) => o.planId === current?.planId && !current.trial;
  const chosen = priced.find((o) => o.planId === picked && !locked(o)) ?? null;
  const price = chosen ? playPrices(p, chosen.productId, show) : null;
  const local = localCurrency(p);
  const currentName = options.find((o) => o.planId === current?.planId)?.name ?? "your plan";
  const busy = status.kind === "busy";

  async function buy() {
    if (!p?.ok || !chosen) return;
    setStatus({ kind: "busy", label: "Opening Google Play…" });
    const intent = await openGooglePlayIntentAction(chosen.productId);
    if (!intent.ok) return setStatus({ kind: "error", text: intent.message });
    const data: Record<string, string> = { sku: chosen.productId };
    if (mode === "change") {
      const held = (await p.service.listPurchases().catch(() => [] as PurchaseDetails[])).find((x) => GOOGLE_PLAY_PRODUCTS.some((g) => g.productId === x.itemId));
      if (!held) return setStatus({ kind: "error", text: "Google Play didn't find this workspace's plan on this phone. Use the Google account that bought it." });
      data.purchaseToken = held.purchaseToken;
      data.replacementMode = "withTimeProration";
    }
    let token: string;
    try {
      const request = new PaymentRequest([{ supportedMethods: GOOGLE_PLAY_BILLING_METHOD, data }], { total: { label: "Total", amount: { currency: "USD", value: "0" } } });
      const response = await request.show();
      token = String((response.details as { purchaseToken?: unknown }).purchaseToken ?? "");
      // Close Google's sheet straight away; Farbaek checks the purchase next.
      await response.complete("success");
    } catch {
      return setStatus({ kind: "idle" });
    }
    if (!token) return setStatus({ kind: "error", text: "Google Play didn't finish the purchase. Nothing was added." });
    setStatus({ kind: "busy", label: "Checking the purchase with Google…" });
    const r = await claim(token);
    if (!r.ok) return setStatus({ kind: "error", text: r.message });
    setStatus({ kind: "done", text: r.pending ? "Google Play is waiting for the payment. The plan starts once it's paid." : `${chosen.name} is on. Its limits apply now.` });
    setPicked(null);
    router.refresh();
  }

  return (
    <div className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
      <div className="rounded-md bg-surface p-4 shadow-e1 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">{mode === "change" ? "Switch your plan" : "Choose a plan"}</p>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2">
            <GooglePlayLogoIcon size={14} weight="fill" aria-hidden /> Google Play
          </span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">Monthly plans, billed through Google Play.</p>
        {local ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-2">Show prices in</p>
            <CurrencyToggle currency={local} />
          </div>
        ) : null}

        <fieldset className="mt-4 grid gap-2" disabled={busy}>
          <legend className="sr-only">Plan</legend>
          {priced.map((o, i) => {
            const isCurrent = o.planId === current?.planId;
            const selected = chosen?.planId === o.planId;
            return (
              <label
                key={o.planId}
                style={{ animationDelay: `${i * 40}ms` }}
                className={`flex min-h-16 items-center gap-3.5 rounded-md border px-4 py-3.5 transition-[border-color,background-color,box-shadow] duration-200 ease-standard motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both] has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                  locked(o) ? "cursor-default border-dashed border-line-strong/50 bg-canvas-2" : selected ? "cursor-pointer border-accent bg-accent/[0.04] shadow-[0_0_0_1px_var(--color-accent)]" : "cursor-pointer border-line bg-surface hover:border-line-strong/60"
                }`}
              >
                <input
                  type="radio"
                  name="play-plan"
                  value={o.planId}
                  checked={selected}
                  disabled={locked(o)}
                  onChange={() => {
                    setPicked(o.planId);
                    setStatus({ kind: "idle" });
                  }}
                  className="sr-only"
                />
                <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${selected ? "border-accent" : locked(o) ? "border-dashed border-line-strong/60" : "border-line-strong/60"}`}>
                  <span className={`size-2.5 rounded-full bg-accent transition-transform duration-200 ease-standard ${selected ? "scale-100" : "scale-0"}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{o.name}</span>
                      {isCurrent ? (
                        <span className="rounded-full bg-accent/[0.08] px-2.5 py-0.5 text-xs font-medium text-accent">{current?.trial ? "Trial" : "Current"}</span>
                      ) : o.recommended ? (
                        <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-on-accent">Recommended</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right tabular">
                      <span className="text-lg font-medium tracking-[-0.02em]">{playPrices(p, o.productId, show)?.shown}</span> <span className="text-xs text-ink-3">a month</span>
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-ink-2">{o.sessions}</span>
                  <span className="block text-xs text-ink-3 tabular">{o.limits}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">Studio and larger plans aren&apos;t sold in the Android app.</p>
      </div>

      {/* The tray under the plans: what the pick costs, Google Play's terms, and the one button that buys it. */}
      <div className="grid gap-3 px-3 pb-3 pt-4 sm:px-4" aria-live="polite">
        {status.kind === "done" ? (
          <p role="status" className="flex items-start gap-2 text-sm leading-relaxed text-ink">
            <CheckCircleIcon size={20} weight="fill" className="mt-px shrink-0 text-verified" aria-hidden /> {status.text}
          </p>
        ) : !canManage ? (
          <Reason>Owners and admins choose plans</Reason>
        ) : cancelling ? (
          <>
            <p className="text-sm leading-relaxed text-ink-2">{currentName} is set to end. Restore it in Google Play first, then switch here.</p>
            <ManageInGooglePlay productId={GOOGLE_PLAY_PRODUCTS.find((g) => g.planId === current?.planId)?.productId ?? null} />
          </>
        ) : !chosen || !price ? (
          <p className="text-sm leading-relaxed text-ink-3">{mode === "change" ? "Pick the plan to switch to." : "Pick a plan above."}</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">{chosen.name}</p>
              <p className="tabular">
                <span className="text-lg font-medium tracking-[-0.02em]">{price.shown}</span> <span className="text-xs text-ink-3">a month</span>
              </p>
            </div>
            {price.charged !== price.shown ? (
              <p className="text-sm leading-relaxed text-ink">Google Play charges {price.charged} a month, in your own currency.</p>
            ) : local ? (
              <p className="text-sm leading-relaxed text-ink-3">The US price is {price.usd} a month.</p>
            ) : null}
            <p className="text-sm leading-relaxed text-ink-2">
              {mode === "change"
                ? `It switches straight away, and Google Play counts the time left on ${currentName} toward it. Then it renews every month until you cancel in Google Play.`
                : "It's charged to your Google account, then again every month until you cancel. Cancel in Google Play at least a day before it renews."}
            </p>
            <button type="button" onClick={buy} disabled={busy} className={buttonClasses("primary", "md", "w-full")}>
              <GooglePlayLogoIcon size={18} weight="fill" aria-hidden /> {busy ? status.label : mode === "change" ? `Switch to ${chosen.name}` : `Subscribe to ${chosen.name}`}
            </button>
            <p className="text-xs leading-relaxed text-ink-3">
              By subscribing you accept the{" "}
              <Link href="/terms#google-play" className="underline">
                Terms
              </Link>{" "}
              and the{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </p>
          </>
        )}
        {status.kind === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm leading-relaxed text-failed">
            <WarningCircleIcon size={18} className="mt-px shrink-0" aria-hidden /> {status.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Reason({ children }: { children: string }) {
  return <span className="block rounded-full border border-dashed border-line-strong/50 px-3 py-2 text-center text-xs text-ink-3">{children}</span>;
}

/** While Google Play is asked for its prices: the picker's own shape, so nothing jumps when they arrive. */
function PickerLoading({ rows }: { rows: number }) {
  return (
    <div aria-busy="true" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
      <div className="rounded-md bg-surface p-4 shadow-e1 sm:p-5">
        <p role="status" className="text-sm text-ink-3">
          Getting Google Play&apos;s prices…
        </p>
        <div className="mt-4 grid gap-2" aria-hidden>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="h-16 rounded-md bg-surface-sunken motion-safe:animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The pricing page's notice inside the Android app. That page is the same
 * for everyone, so it asks Google Play itself: when Google Play has the
 * plans' prices, it leads to Billing, where they're chosen; otherwise it's
 * the calm notice it wraps.
 */
export function PlayPricingNotice({ children }: { children: ReactNode }) {
  const p = usePlay();
  const show = usePriceCurrency();
  if (!p?.ok || !GOOGLE_PLAY_PRODUCTS.some((g) => p.prices.has(g.productId))) return children;
  const local = localCurrency(p);
  return (
    <div className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
      <div className="flex gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
          <GooglePlayLogoIcon size={20} weight="fill" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-medium">Plans are billed through Google Play</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {local
              ? show === "local"
                ? `The prices below are Google Play's, in ${local}.`
                : `The prices below are Google Play's US prices. Google Play charges you in ${local}.`
              : "The prices below are Google Play's."}{" "}
            Studio and larger plans aren&apos;t sold in the Android app.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {local ? <CurrencyToggle currency={local} /> : null}
        <Link href="/app/billing" className={buttonClasses("primary", "sm", local ? "" : "w-full sm:w-auto")}>
          Choose in Billing
        </Link>
      </div>
    </div>
  );
}
