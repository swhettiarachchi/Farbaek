import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ProductFilmSection } from "@/components/films/film-sections";
import { AnchorLayout } from "@/components/marketing/anchor-layout";
import { HomeFaq } from "@/components/marketing/faq";
import { AlsoSection, Hero, IntelligenceSection, SpacesSection } from "@/components/marketing/hero";
import { FinalCall, SafeguardsSection } from "@/components/marketing/home-sections";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { HOME_DESCRIPTION, HOME_TITLE, homeStructuredData, jsonLdText } from "@/core/seo/structured-data";
import { siteUrl } from "@/server/supabase/config";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: "Farbaek", title: HOME_TITLE, description: HOME_DESCRIPTION },
  twitter: { card: "summary", title: HOME_TITLE, description: HOME_DESCRIPTION },
};

/**
 * Below the first screen, each section is laid out only as it nears the
 * screen (content-visibility), so a phone paints the hero sooner (ADR 0052).
 * AnchorLayout lays them all out before an in-page jump, so anchors land
 * exactly; find-in-page and the film's visibility checks work as before.
 */
function Later({ children }: { children: ReactNode }) {
  return <div className="home-later">{children}</div>;
}

/**
 * The homepage (ADR 0216): Farbaek AI first, with a message box to ask it something; then the four main spaces (Chat, Images,
 * Video, Build) in one window; how one assistant uses many models; the recorded build; the safeguards every space shares; the
 * specialist spaces; pricing and questions.
 */
export default function HomePage() {
  return (
    <>
      {/* Facts for search engines, from a fixed object; jsonLdText escapes "<" so it can't close the tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(homeStructuredData(siteUrl())) }} />
      <AnchorLayout />
      <Hero />
      <SpacesSection />
      <Later>
        <IntelligenceSection />
      </Later>
      <Later>
        <ProductFilmSection />
      </Later>
      <Later>
        <SafeguardsSection />
      </Later>
      <Later>
        <AlsoSection />
      </Later>
      <Later>
        <PricingTeaser />
      </Later>
      <Later>
        <HomeFaq />
      </Later>
      <Later>
        <FinalCall />
      </Later>
    </>
  );
}
