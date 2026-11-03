/**
 * What Studio's Theme panel offers for a site on the Farbaek Studio kit
 * (ADR 0159): the colour tokens a person may set, curated font pairings,
 * corner styles and text size presets. Only these values reach a site's
 * stylesheet; anything else is refused.
 */

/** The kit's colour tokens a person can set, with the words Studio shows. */
export const THEME_TOKENS = {
  accent: "Accent",
  "accent-2": "Second accent",
  "on-accent": "Text on the accent",
  ink: "Text",
  paper: "Background",
  "paper-2": "Raised sections",
} as const;
export type ThemeToken = keyof typeof THEME_TOKENS;

/** Font pairings from Google Fonts, chosen by feel. No Inter by default, no Fraunces or Instrument Serif. */
export const FONT_PAIRS = {
  modern: { label: "Modern", display: "Bricolage Grotesque", body: "Geist", families: "family=Bricolage+Grotesque:wght@500;600;700&family=Geist:wght@400;500;600", serif: false },
  editorial: { label: "Editorial", display: "Young Serif", body: "Instrument Sans", families: "family=Young+Serif&family=Instrument+Sans:wght@400;500;600", serif: true },
  luxury: { label: "Luxury", display: "Cormorant Garamond", body: "Manrope", families: "family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600", serif: true },
  technical: { label: "Technical", display: "Space Grotesk", body: "IBM Plex Sans", families: "family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600", serif: false },
  friendly: { label: "Friendly", display: "Outfit", body: "Nunito Sans", families: "family=Outfit:wght@500;600;700&family=Nunito+Sans:wght@400;600", serif: false },
  bold: { label: "Bold", display: "Unbounded", body: "Figtree", families: "family=Unbounded:wght@500;700&family=Figtree:wght@400;500;600", serif: false },
  classic: { label: "Classic", display: "Playfair Display", body: "Source Sans 3", families: "family=Playfair+Display:wght@500;700&family=Source+Sans+3:wght@400;600", serif: true },
  minimal: { label: "Minimal", display: "Geist", body: "Geist", families: "family=Geist:wght@400;500;600;700", serif: false },
} as const;
export type FontPairId = keyof typeof FONT_PAIRS;

export const fontsHref = (id: FontPairId) => `https://fonts.googleapis.com/css2?${FONT_PAIRS[id].families}&display=swap`;
export const fontStack = (family: string, serif: boolean) => `"${family}", ${serif ? "Georgia, serif" : "ui-sans-serif, system-ui, sans-serif"}`;

/** Corner styles, as the kit's two radius tokens. */
export const CORNERS = {
  sharp: { label: "Sharp", radius: "4px", large: "8px" },
  soft: { label: "Soft", radius: "16px", large: "28px" },
  round: { label: "Round", radius: "28px", large: "44px" },
} as const;
export type CornerId = keyof typeof CORNERS;

/** Text sizes that scale with the screen, the way the kit sets its own type. Studio writes these instead of a fixed px. */
export const TEXT_SIZES = {
  small: { label: "Small", value: "clamp(14px, 0.2vw + 13px, 16px)" },
  body: { label: "Body", value: "clamp(16px, 0.35vw + 15px, 18px)" },
  large: { label: "Large", value: "clamp(20px, 1vw + 16px, 26px)" },
  heading: { label: "Heading", value: "clamp(32px, 4.8vw, 68px)" },
  display: { label: "Display", value: "clamp(44px, 8.4vw, 124px)" },
} as const;
export type TextSizeId = keyof typeof TEXT_SIZES;
export const TEXT_SIZE_VALUES: readonly string[] = Object.values(TEXT_SIZES).map((s) => s.value);

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** The WCAG contrast ratio between two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Each look's background, text and accent, for Studio's look cards. Matches the kit's own values (public/kit/studio/v1). */
export const LOOK_SWATCHES: Record<string, { label: string; paper: string; ink: string; accent: string; dark: boolean; pro: boolean }> = {
  signal: { label: "Signal", paper: "#fbfbfc", ink: "#0f1115", accent: "#1f4bff", dark: false, pro: false },
  atelier: { label: "Atelier", paper: "#f2f3f0", ink: "#15171a", accent: "#2f5d50", dark: false, pro: false },
  bloom: { label: "Bloom", paper: "#ffffff", ink: "#1a1220", accent: "#ff4b2b", dark: false, pro: false },
  chrome: { label: "Chrome", paper: "#e8eaed", ink: "#0d0f12", accent: "#20242b", dark: false, pro: true },
  noir: { label: "Noir", paper: "#0b0b0d", ink: "#f3f0ea", accent: "#e6cc9e", dark: true, pro: false },
  aurora: { label: "Aurora", paper: "#060912", ink: "#eef2fb", accent: "#5cf2cf", dark: true, pro: false },
  obsidian: { label: "Obsidian", paper: "#070708", ink: "#f1efe9", accent: "#ff5a36", dark: true, pro: true },
  garden: { label: "Garden", paper: "#0e1913", ink: "#eef3ea", accent: "#f2b84b", dark: true, pro: true },
};
