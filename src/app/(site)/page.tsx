import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ProductFilmSection } from "@/components/films/film-sections";
import { AnchorLayout } from "@/components/marketing/anchor-layout";
import { HomeFaq } from "@/components/marketing/faq";
import { Hero, SpacesSection } from "@/components/marketing/hero";
import { FinalCall, JobsSection, SafeguardsSection } from "@/components/marketing/home-sections";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { StatementSection } from "@/components/marketing/statement-section";
import { HOME_DESCRIPTION, HOME_TITLE, homeStructuredData, jsonLdText } from "@/core/seo/structured-data";
import { siteUrl } from "@/server/supabase/config";

/** Search and sharing lead with "vibe coding", what people search for (stage 186, src/core/seo/structured-data.ts). */
export const metadata: Metadata = {
  title: { absolute: `${HOME_TITLE} | Farbaek` },
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
 * The homepage opens onto Farbaek's four spaces (ADR 0214): say what Farbaek is, show each space, then show it's real.
 * The showroom and feature films live on /build, the proof film, the approval demo and the ProofPack on /proof.
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
        <ProductFilmSection />
      </Later>
      <Later>
        <StatementSection />
      </Later>
      <Later>
        <JobsSection />
      </Later>
      <Later>
        <SafeguardsSection />
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
