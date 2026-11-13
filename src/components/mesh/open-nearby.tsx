"use client";

import { WifiHighIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { Card, CardTitle } from "@/components/app/primitives";
import { useAndroidAppBuild } from "@/components/billing/web-purchase-only";
import { buttonClasses } from "@/components/ui/button";
import { nearbyIntentLink, nearbyOffer } from "@/core/mesh/android";

const noSubscribe = () => () => undefined;
const readUserAgent = () => navigator.userAgent;

/**
 * A way into Farbaek for Android's own Nearby screen (ADR 0193), which sends
 * files to a computer on the same Wi-Fi with no internet. It sits at the top of
 * Move projects, because on an Android phone that's the likeliest job there.
 * - In the app from the build that has it: Open Nearby, falling back to this page.
 * - On any other Android phone, where the page can't tell (opened from a link,
 *   Android brought back an older tab, or an older app): the same button, which
 *   opens Nearby if the app has it and Google Play otherwise, to install or update.
 * - Nothing on a computer or an iPhone, or before the page has loaded.
 */
export function OpenNearby() {
  const build = useAndroidAppBuild();
  const userAgent = useSyncExternalStore(noSubscribe, readUserAgent, () => "");
  const offer = nearbyOffer(build, userAgent);
  if (offer === null) return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1 basis-60">
        <CardTitle icon={WifiHighIcon}>Send to a computer nearby</CardTitle>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          {offer === "app"
            ? "Farbaek for Android sends photos and files straight to your computer on the same Wi-Fi, even with no internet."
            : "Farbaek for Android sends photos and files straight to your computer on the same Wi-Fi, even with no internet. If the app needs installing or updating, this opens Google Play first."}
        </p>
      </div>
      <a href={nearbyIntentLink(window.location.origin, { fallback: offer === "app" ? "mesh" : "play" })} className={buttonClasses("primary", "md")}>
        <WifiHighIcon size={16} weight="bold" aria-hidden /> Open Nearby
      </a>
    </Card>
  );
}
