/**
 * The Farbaek Studio kit (ADR 0157): premium sections, looks and motion that
 * every site Farbaek builds composes from, hosted beside Farbaek Scenes under
 * a versioned path that never changes. The core kit is for every plan; Studio
 * kit Pro adds more for paid plans. The files are public like any stylesheet:
 * the plan decides what the agent is told to use, on the server.
 */
import { checkFeature } from "../billing/entitlements";
import type { EffectivePlan } from "../billing/trial";
import { MEDIA_ORIGIN } from "./library";

export const STUDIO_KIT_BASE = `${MEDIA_ORIGIN}/kit/studio/v1`;
export const STUDIO_KIT_CSS = `${STUDIO_KIT_BASE}/studio.css`;
export const STUDIO_KIT_JS = `${STUDIO_KIT_BASE}/studio.js`;
export const STUDIO_KIT_PRO_CSS = `${STUDIO_KIT_BASE}/studio-pro.css`;
export const STUDIO_KIT_PRO_JS = `${STUDIO_KIT_BASE}/studio-pro.js`;
/** Any version of the kit, as a site's HTML names it. */
export const STUDIO_KIT_PATTERN = /kit\/studio\/v\d+\/studio(?:-pro)?\.(?:css|js)/;

export const LOOKS = {
  signal: "crisp light page, electric blue accent",
  noir: "dark luxury, champagne accent, quieter type",
  atelier: "editorial cool stone, deep green and terracotta, small radii",
  aurora: "dark futuristic night, mint and blue light",
  bloom: "bold bright consumer, coral and sun, big rounded shapes",
} as const;
export const PRO_LOOKS = {
  obsidian: "near-black gallery, ivory and a flame accent",
  chrome: "cold silver luxury, graphite and steel blue",
  garden: "deep forest, amber and sage",
} as const;
export type Look = keyof typeof LOOKS | keyof typeof PRO_LOOKS;

/** Classes and attributes the core reference names; a test checks each exists in the kit. */
export const CORE_NAMES = [
  "fs-nav", "fs-nav__brand", "fs-nav__links", "fs-nav__toggle", "fs-menu", "fs-hero", "fs-hero--center", "fs-hero--split", "fs-hero__media", "fs-hero__content", "fs-hero__meta",
  "fs-glow", "fs-container", "fs-section", "fs-section--raised", "fs-section--ink", "fs-head", "fs-head--split", "fs-display", "fs-h2", "fs-h3", "fs-lead", "fs-sample",
  "fs-actions", "fs-btn", "fs-btn--ghost", "fs-btn__icon", "fs-link", "fs-frame", "fs-frame--wide", "fs-split", "fs-split--reverse", "fs-split__text", "fs-list",
  "fs-stats", "fs-stat", "fs-stat__num", "fs-stat__label", "fs-mosaic", "fs-card", "fs-card__meta", "fs-panel", "fs-quote", "fs-faq", "fs-cta", "fs-footer", "fs-footer__grid",
  "fs-footer__base", "fs-wordmark", "fs-skip", "data-fs-reveal", "data-fs-stagger", "data-fs-count", "data-fs-tilt",
] as const;
export const PRO_NAMES = [
  "fs-chapters", "fs-chapters__stage", "fs-chapter", "fs-chapter__num", "data-fs-show", "data-fs-step", "fs-carousel", "fs-carousel__track", "fs-carousel__controls", "fs-slide",
  "data-fs-prev", "data-fs-next", "data-fs-pause", "fs-marquee", "fs-marquee__track", "fs-hscroll--pinned", "fs-hscroll__sticky", "fs-hscroll__track", "fs-turntable",
  "fs-turntable__stage", "fs-turntable__range", "data-fs-magnetic", "data-fs-glow", "data-fs-depth",
] as const;

export type KitTier = "core" | "pro";

/** The colour theme the person chose for a build (ADR 0158): light unless they asked for dark. Never dark by default. */
export const SITE_THEMES = ["light", "dark"] as const;
export type SiteTheme = (typeof SITE_THEMES)[number];
export const LIGHT_LOOKS = ["signal", "atelier", "bloom", "chrome"] as const;
export const DARK_LOOKS = ["noir", "aurora", "obsidian", "garden"] as const;

/** The theme to offer first: dark only when the person asked for it in their own words. */
export function themeFromPrompt(text: string): SiteTheme {
  return /\b(dark|black|night|noir|moody|midnight)\b/i.test(text) && !/\b(light|white|bright)\b/i.test(text) ? "dark" : "light";
}

/** The person's theme as the agent reads it. Each theme's text is a constant, so prompt caching holds. */
export function themeForPrompt(theme: SiteTheme): string {
  return theme === "dark"
    ? `### Colour theme: dark (the person chose it)\nBuild a dark site: a dark look (${DARK_LOOKS.join(", ")}, the last two with Studio kit Pro), light text on dark surfaces, scenes and media chosen for a dark page. If the project's current look is light, switch it to dark and keep its accent hue.`
    : `### Colour theme: light (the person chose it)\nBuild a light site: a light look (${LIGHT_LOOKS.join(", ")}, the last with Studio kit Pro), dark text on light surfaces, with dark bands only where a section needs contrast. Use light colourways for scenes and library media (pearl, data-tone="light"). If the project's current look is dark, switch it to light and keep its accent hue, so a person who chose light never gets a dark site.`;
}

/** Whether a static site's pages already build on the kit; sites from before ADR 0157 don't. */
export function usesStudioKit(files: readonly { path: string; content: string }[]): boolean {
  return files.some((f) => /\.html?$/i.test(f.path) && STUDIO_KIT_PATTERN.test(f.content));
}

/** The one-click follow-up that brings a site built before the kit up to it. The person still approves the plan. */
export const UPGRADE_DESIGN = {
  note: "This site was built before the Studio kit.",
  label: "Upgrade its design",
  text: "Upgrade this site's design to the Farbaek Studio standard: rebuild its look on the Studio kit with a 3D hero moment, choreographed motion, and photos and video in slots I can replace. Keep all its words, pages, links and working features.",
} as const;

/** Paid plans (and the trial) build with Studio kit Pro; Free with the core kit. */
export function kitTierFor(plan: EffectivePlan | null): KitTier {
  return checkFeature(plan, "studio_kit_pro").allowed ? "pro" : "core";
}

const list = (looks: Record<string, string>) =>
  Object.entries(looks)
    .map(([k, v]) => `${k} (${v})`)
    .join("; ");

const CORE = `### Build on the Farbaek Studio kit
The kit gives every site premium sections, looks and choreographed motion, already fast, accessible and right on phones. Compose pages from it, then make them this brand's own with its tokens, type, copy, media and one or two custom touches. Don't hand-write a section the kit already does well.
In <head>: <script>document.documentElement.classList.add("fs-js")</script>, <link rel="stylesheet" href="${STUDIO_KIT_CSS}">, then the site's own stylesheet (it wins over the kit). Before </body>: <script type="module" src="${STUDIO_KIT_JS}"></script> (plus the Scenes script when a scene is used).
Looks, on <html data-fs-look="...">: ${list(LOOKS)}. Pick the one closest to the brand, then tune on :root: --accent, --accent-2, --on-accent, --ink, --ink-2, --paper, --paper-2, --line, --font-display, --font-body, --radius, --radius-lg. Load a real display and body pairing from Google Fonts and set the two font variables.
Sections (classes):
- Nav: <header class="fs-nav"><a class="fs-nav__brand">Name</a><ul class="fs-nav__links"><li><a>…</a></li></ul><a class="fs-btn">…</a><button class="fs-nav__toggle" aria-label="Open the menu"></button></header><nav class="fs-menu" aria-label="Menu"><a>…</a></nav>. Add <a class="fs-skip" href="#main">Skip to content</a> first.
- Hero: <section class="fs-hero"> (or fs-hero--center, or fs-hero--split for copy beside a framed image) with <div class="fs-hero__media"> holding a Scenes box, a library video or a photo, then <div class="fs-container"><div class="fs-hero__content"> an <h1 class="fs-display" data-fs-reveal="words">, a <p class="fs-lead" data-fs-reveal>, <div class="fs-actions" data-fs-reveal> and optionally <div class="fs-hero__meta"> with three short facts (<strong> plus a line). <div class="fs-glow"> adds soft light.
- Sections: <section class="fs-section"> (fs-section--raised or fs-section--ink to change surface) with <div class="fs-container">. Section heads: <div class="fs-head"> or fs-head--split (title left, lead right), with <h2 class="fs-h2">.
- Split feature: <div class="fs-split"> (fs-split--reverse) with <div class="fs-frame" data-fs-reveal="mask"><img></div> and <div class="fs-split__text"> (an fs-h2, an fs-lead, an <ul class="fs-list">, fs-actions).
- Media frame: <div class="fs-frame"> (fs-frame--wide, --square, --tall, or style="--fs-ratio:5/4") with an img, video or Scenes box inside.
- Stats: <div class="fs-stats" data-fs-stagger> of <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>1,250+</span><span class="fs-stat__label">…</span></div>.
- Mosaic of cards with varied sizes: <div class="fs-mosaic" data-fs-stagger> of <a class="fs-card" data-fs-reveal><div class="fs-frame"><img></div><h3 class="fs-h3">…</h3><div class="fs-card__meta">…</div></a>. Text cards: <div class="fs-panel">.
- Quote: <figure class="fs-quote"><blockquote>…</blockquote><figcaption>name, role <span class="fs-sample">Sample quote</span></figcaption></figure>.
- FAQ: <div class="fs-faq"><details><summary>Question</summary><p>Answer</p></details></div>.
- Closing call: <div class="fs-cta" data-fs-reveal="scale"> with an fs-h2, fs-lead and fs-actions (a Scenes box inside it works as a backdrop).
- Footer: <footer class="fs-footer"><div class="fs-container"><div class="fs-footer__grid"> columns of <h2> plus <ul> links </div><div class="fs-footer__base"> small print </div><div class="fs-wordmark" aria-hidden="true">Name</div></div></footer>.
- Buttons: <a class="fs-btn" href="…">Book a table <span class="fs-btn__icon" aria-hidden="true"></span></a>; fs-btn--ghost and fs-btn--ink variants; <a class="fs-link"> for quiet links.
Motion attributes: data-fs-reveal ("" rises, "scale", "mask" for images, "words" for headlines); data-fs-stagger on a parent staggers its children; data-fs-count counts a number up when seen; data-fs-tilt on a card or framed image leans it toward the pointer in 3D (a CSS 3D moment). The kit handles reduced motion, the phone menu and pausing videos off-screen; don't re-implement them.
Vary the page: no section layout twice in a row, one signature 3D moment (rule 5), and media in every major section.`;

const PRO = `### Studio kit Pro (this workspace's plan includes it)
Also load <link rel="stylesheet" href="${STUDIO_KIT_PRO_CSS}"> after studio.css and <script type="module" src="${STUDIO_KIT_PRO_JS}"></script> after studio.js. Use one or two Pro moments a page where they serve the story:
- More looks: ${list(PRO_LOOKS)}.
- Story chapters: <div class="fs-chapters"><div class="fs-chapters__stage"><img data-fs-show="1">…<img data-fs-show="3"></div><div><div class="fs-chapter" data-fs-step="1"><span class="fs-chapter__num">01</span><h3 class="fs-h3">…</h3><p>…</p></div>…</div></div>: the sticky stage changes as each chapter is read (numbers only because the order matters).
- Peeking carousel: <div class="fs-carousel"><div class="fs-carousel__track"><figure class="fs-slide"><img><figcaption>…</figcaption></figure>…</div><div class="fs-carousel__controls"><button data-fs-prev aria-label="Previous slide"></button><button data-fs-pause aria-label="Pause the slides"></button><button data-fs-next aria-label="Next slide"></button></div></div>.
- Marquee of words or logos: <div class="fs-marquee"><div class="fs-marquee__track"><span>…</span>…</div></div>.
- Horizontal gallery pinned to scroll: <section class="fs-hscroll--pinned"><div class="fs-hscroll__sticky"><div class="fs-hscroll__track"> panels </div></div></section>.
- Closer look that turns the product: <div class="fs-turntable"><div class="fs-turntable__stage"><img>…</div><input type="range" class="fs-turntable__range" aria-label="Turn the product"></div> (several angle photos, or one that turns in 3D).
- data-fs-reveal="rise" for headlines that rise word by word; data-fs-magnetic on a main button; data-fs-glow on cards for a pointer spotlight; data-fs-depth="0.2" on layered images for parallax depth. Multi-page sites get smooth page transitions automatically.`;

const PRO_ON_FREE =
  "Studio kit Pro (story chapters, carousels, marquees, a turning product viewer, magnetic motion, three more looks) is for paid plans and isn't part of this build: use only the core kit, and don't load studio-pro files.";

/** The kit reference for the agent's prompt, by plan tier. Each tier's text is a constant, so prompt caching holds. */
export function kitForPrompt(tier: KitTier): string {
  return tier === "pro" ? `${CORE}\n${PRO}` : `${CORE}\n${PRO_ON_FREE}`;
}
