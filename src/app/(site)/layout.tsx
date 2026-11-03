import { AnalyticsConsent } from "@/components/analytics/analytics-consent";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
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
