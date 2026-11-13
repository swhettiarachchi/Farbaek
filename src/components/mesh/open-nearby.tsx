"use client";

import { WifiHighIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { useAndroidAppBuild } from "@/components/billing/web-purchase-only";
import { buttonClasses } from "@/components/ui/button";
import { nearbyIntentLink, nearbyOffer } from "@/core/mesh/android";

const noSubscribe = () => () => undefined;
const readUserAgent = () => navigator.userAgent;

/**
 * A way into Farbaek for Android's own Nearby screen (ADR 0193), which sends
 * files to a computer on the same Wi-Fi with no internet.
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
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-surface-raised/70 px-4 py-3">
      <p className="min-w-0 flex-1 basis-60 text-sm leading-relaxed text-ink-2">
        {offer === "app" ? (
          <>
            <span className="font-medium text-ink">On the same Wi-Fi as your computer?</span> The app can send files straight to it, even with no internet.
          </>
        ) : (
          <>
            <span className="font-medium text-ink">Have Farbaek for Android?</span> Its Nearby screen sends files straight to your computer on the same Wi-Fi, even with no internet. If the
            app needs installing or updating, this opens Google Play.
          </>
        )}
      </p>
      <a href={nearbyIntentLink(window.location.origin, { fallback: offer === "app" ? "mesh" : "play" })} className={buttonClasses("secondary", "sm")}>
        <WifiHighIcon size={16} weight="bold" aria-hidden /> Open Nearby
      </a>
    </div>
  );
}
