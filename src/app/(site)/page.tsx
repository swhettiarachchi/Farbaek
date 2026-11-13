import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FeatureFilmsSection, ProductFilmSection, ProofFilmSection } from "@/components/films/film-sections";
import { AnchorLayout } from "@/components/marketing/anchor-layout";
import { DemoSection } from "@/components/marketing/demo-section";
import { EvidenceSection } from "@/components/marketing/evidence-section";
import { HomeFaq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { ModulesBento } from "@/components/marketing/modules-bento";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { StatementSection } from "@/components/marketing/statement-section";
import { StatusSection } from "@/components/marketing/status-section";
import { ShowcaseSection } from "@/components/showcase/showcase-section";
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
 * screen (content-visibility), so a phone paints the hero sooner: about
 * 350 ms on a mid-range phone profile (ADR 0052). AnchorLayout lays them
 * all out before an in-page jump, so anchors land exactly; find-in-page and
 * the films' visibility checks work as before.
 */
function Later({ children }: { children: ReactNode }) {
  return <div className="home-later">{children}</div>;
}

export default function HomePage() {
  return (
    <>
      {/* Facts for search engines, from a fixed object; jsonLdText escapes "<" so it can't close the tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(homeStructuredData(siteUrl())) }} />
      <AnchorLayout />
      <Hero />
      <ProductFilmSection />
      <Later>
        <StatementSection />
      </Later>
      <Later>
        <FeatureFilmsSection />
      </Later>
      <Later>
        <ShowcaseSection />
      </Later>
      <Later>
        <ProofFilmSection />
      </Later>
      <Later>
        <DemoSection />
      </Later>
      <Later>
        <ModulesBento />
      </Later>
      <Later>
        <EvidenceSection />
      </Later>
      <Later>
        <StatusSection />
      </Later>
      <Later>
        <PricingTeaser />
      </Later>
      <Later>
        <HomeFaq />
      </Later>
    </>
  );
}
