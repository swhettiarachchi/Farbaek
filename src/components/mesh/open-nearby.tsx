"use client";

import { WifiHighIcon } from "@phosphor-icons/react";
import { useAndroidAppBuild } from "@/components/billing/web-purchase-only";
import { buttonClasses } from "@/components/ui/button";
import { ANDROID_NEARBY_FROM_BUILD, nearbyIntentLink } from "@/core/mesh/android";

/**
 * In Farbaek for Android from the build that has it (ADR 0193): a way into
 * the app's own Nearby screen, which sends files to a computer on the same
 * Wi-Fi with no internet. Nothing here in a browser, or in an older build.
 */
export function OpenNearby() {
  const build = useAndroidAppBuild();
  if (build === null || build < ANDROID_NEARBY_FROM_BUILD) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-surface-raised/70 px-4 py-3">
      <p className="min-w-0 flex-1 basis-60 text-sm leading-relaxed text-ink-2">
        <span className="font-medium text-ink">On the same Wi-Fi as your computer?</span> The app can send files straight to it, even with no internet.
      </p>
      <a href={nearbyIntentLink(window.location.origin)} className={buttonClasses("secondary", "sm")}>
        <WifiHighIcon size={16} weight="bold" aria-hidden /> Open Nearby
      </a>
    </div>
  );
}
