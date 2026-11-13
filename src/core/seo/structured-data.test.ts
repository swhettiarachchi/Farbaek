import { describe, expect, it } from "vitest";
import { HOME_DESCRIPTION, HOME_TITLE, homeStructuredData, jsonLdText } from "./structured-data";

describe("the homepage's search listing", () => {
  it("leads with vibe coding and fits a search result", () => {
    expect(HOME_TITLE.toLowerCase().startsWith("vibe coding")).toBe(true);
    // The title tag adds " | Farbaek"; Google shows about 60 characters.
    expect(`${HOME_TITLE} | Farbaek`.length).toBeLessThanOrEqual(60);
    expect(HOME_DESCRIPTION.toLowerCase()).toContain("vibe coding");
    expect(HOME_DESCRIPTION.length).toBeGreaterThanOrEqual(120);
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("is plain copy: no em dashes, no claims the product rules forbid", () => {
    for (const text of [HOME_TITLE, HOME_DESCRIPTION]) {
      expect(text).not.toMatch(/—/);
      expect(text.toLowerCase()).not.toMatch(/\b(first|guaranteed|complete protection|certified|compliant)\b/);
    }
  });
});

describe("the homepage's structured data", () => {
  const data = homeStructuredData("https://www.farbaek.com/");
  const text = JSON.stringify(data);
  const graph = (data["@graph"] as Array<Record<string, unknown>>).map((node) => node["@type"]);

  it("says who Farbaek is and what it is", () => {
    expect(graph).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
    expect(text.toLowerCase()).toContain("vibe coding");
  });

  it("uses absolute addresses on the given origin, without a doubled slash", () => {
    const urls = text.match(/https?:\/\/[^"]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls.filter((u) => !u.startsWith("https://schema.org"))) {
      expect(url.startsWith("https://www.farbaek.com/")).toBe(true);
      expect(url.slice("https://".length)).not.toContain("//");
    }
  });

  it("states no ratings or reviews, and only the Free plan's real price", () => {
    expect(text).not.toMatch(/"(aggregateRating|review|reviews|ratingValue)"|"@type":"(Review|AggregateRating)"/);
    const app = (data["@graph"] as Array<Record<string, unknown>>)[2]!;
    expect(app.offers).toEqual({ "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" });
  });

  it("can never close its script tag", () => {
    const hostile = jsonLdText({ name: "</script><script>alert(1)</script>" });
    expect(hostile).not.toContain("</script>");
    expect(JSON.parse(hostile)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
