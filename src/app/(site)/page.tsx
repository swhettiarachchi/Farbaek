import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ProductFilmSection } from "@/components/films/film-sections";
import { AnchorLayout } from "@/components/marketing/anchor-layout";
import { HomeFaq } from "@/components/marketing/faq";
import { AlsoSection, Hero, IntelligenceSection, TourSection } from "@/components/marketing/hero";
import { FinalCall, PricingBand, RailSection, SafeguardsSection } from "@/components/marketing/home-sections";
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
 * The homepage (ADR 0216; measured against ChatGPT, Antigravity and Claude in docs/research/homepage-references-2026-11.md):
 * Farbaek AI with a message box, then Farbaek AI itself in a window; the tour of the four main spaces; one assistant over many
 * models; the rail of jobs; the recorded build; the safeguards; the specialist spaces in a line; pricing as a band; questions;
 * and the last word, a message box again.
 */
export default function HomePage() {
  return (
    <>
      {/* Facts for search engines, from a fixed object; jsonLdText escapes "<" so it can't close the tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(homeStructuredData(siteUrl())) }} />
      <AnchorLayout />
      <Hero />
      <TourSection />
      <Later>
        <IntelligenceSection />
      </Later>
      <Later>
        <RailSection />
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
        <PricingBand />
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
