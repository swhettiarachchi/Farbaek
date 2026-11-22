import { AnalyticsConsent } from "@/components/analytics/analytics-consent";
import { AndroidEarlyMark } from "@/components/billing/android-early-mark";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteThemeMark } from "@/components/theme/site-theme-mark";
import { SiteThemeScript } from "@/components/theme/site-theme-script";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* The visitor's look (ADR 0232): the mark, then the script that corrects it before the first paint. Keep them together and first. */}
      <SiteThemeMark />
      <SiteThemeScript />
      <AndroidEarlyMark />
      <SiteHeader />
      <main id="main" className="overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
      {/* Google Analytics on the public pages only, after the visitor allows it (ADR 0155). */}
      <AnalyticsConsent />
    </>
  );
}
