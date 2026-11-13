/**
 * How the homepage reads in search results and to search engines (stage 186).
 *
 * "Vibe coding" leads, because it's what people search for when they want to
 * describe an app and have AI build it; "verified" says what's different about
 * Farbaek. The structured data (JSON-LD) states facts only: who Farbaek is,
 * what it is, and the Free plan's price from the plan catalog. No ratings,
 * reviews or prices that aren't real.
 */
import { getPlan } from "@/core/billing/catalog";

/** The homepage's title; the title tag adds " | Farbaek". */
export const HOME_TITLE = "Vibe coding for verified apps and websites";

/** The homepage's search and sharing description, about 150 characters. */
export const HOME_DESCRIPTION =
  "Vibe coding with proof: describe an app or website, and Farbaek's AI agent builds it, runs the real checks and waits for your approval before it ships.";

export function homeStructuredData(origin: string): Record<string, unknown> {
  const site = origin.replace(/\/+$/, "");
  const organization = `${site}/#organization`;
  const free = getPlan("free");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organization,
        name: "Farbaek",
        url: `${site}/`,
        logo: `${site}/brand/farbaek-logo.png`,
        email: "support@farbaek.com",
      },
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        name: "Farbaek",
        url: `${site}/`,
        publisher: { "@id": organization },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${site}/#app`,
        name: "Farbaek",
        url: `${site}/`,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        description: HOME_DESCRIPTION,
        keywords: "vibe coding, AI app builder, AI website builder, verified software",
        publisher: { "@id": organization },
        offers: { "@type": "Offer", name: free.name, price: "0", priceCurrency: "USD" },
      },
    ],
  };
}

/** For a script of type application/ld+json: "<" is escaped, so the text can never close the tag. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
