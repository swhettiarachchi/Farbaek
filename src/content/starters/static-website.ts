/**
 * Starter: a static website. Plain HTML, CSS and JavaScript, no build step
 * and no dependencies, so it previews instantly. Since ADR 0157 it starts
 * premium: it's built on the Farbaek Studio kit (sections, a look, motion)
 * with a Farbaek Scenes 3D hero, a library video and real stand-in photos in
 * slots the person can replace. A build makes it the brand's own: it writes
 * DESIGN.md, picks the look, tunes the tokens, and replaces every word in
 * [square brackets] and every placeholder slot.
 */
import { KIT_URL, MEDIA_BASE } from "@/core/media/library";
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "./types";

const photo = (id: number, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

const card = (id: number, slot: string, title: string, meta: string) => `          <a class="fs-card" href="#contact" data-fs-reveal>
            <div class="fs-frame" data-fs-tilt>${photo(id, 1200, 900, slot, `[A photo of ${title.toLowerCase()}]`)}</div>
            <h3 class="fs-h3">[${title}]</h3>
            <div class="fs-card__meta"><span>[${meta}]</span><span aria-hidden="true">View</span></div>
          </a>`;

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>[Your site name]</title>
    <meta name="description" content="[One sentence about what you do and who it's for.]" />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..700&amp;family=Geist:wght@400;500;600&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top">[Your site name]</a>
      <ul class="fs-nav__links">
        <li><a href="#story">Story</a></li>
        <li><a href="#work">Work</a></li>
        <li><a href="#questions">Questions</a></li>
      </ul>
      <a class="fs-btn" href="#contact">Get in touch <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#story">Story</a>
      <a href="#work">Work</a>
      <a href="#questions">Questions</a>
      <a href="#contact">Get in touch</a>
    </nav>

    <main id="main">
      <section class="fs-hero" id="top">
        <div class="fs-hero__media">
          <!-- The 3D signature: a Farbaek Scenes box. Pick the scene and colours that fit the brand (DESIGN.md). -->
          <div data-farbaek-scene="aurora" data-tone="light" data-farbaek-media="hero-scene" aria-hidden="true">
            <img data-farbaek-poster src="${MEDIA_BASE}/aurora-pearl/still-16x9.webp" alt="" />
          </div>
        </div>
        <div class="fs-container">
          <div class="fs-hero__content">
            <h1 class="fs-display" data-fs-reveal="words">[A clear line about what you offer]</h1>
            <p class="fs-lead" data-fs-reveal>[One sentence, under 20 words, for the people you want to reach.]</p>
            <div class="fs-actions" data-fs-reveal>
              <a class="fs-btn" href="#contact">[Your main action] <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <a class="fs-link" href="#story">See how it works</a>
            </div>
            <div class="fs-hero__meta" data-fs-reveal>
              <p><strong>[A real fact]</strong>[what it means for them]</p>
              <p><strong>[A real fact]</strong>[what it means for them]</p>
              <p><strong>[A real fact]</strong>[what it means for them]</p>
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section" id="story">
        <div class="fs-container fs-split">
          <div class="fs-frame" data-fs-reveal="mask">
            <video autoplay muted loop playsinline preload="metadata" poster="${MEDIA_BASE}/glass-pearl/still-4x5.webp" aria-hidden="true" data-farbaek-media="story-video" data-farbaek-placeholder>
              <source src="${MEDIA_BASE}/glass-pearl/loop.mp4" type="video/mp4" />
            </video>
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" data-fs-reveal>[What makes you different, in one line]</h2>
            <p class="fs-lead" data-fs-reveal>[Two plain sentences about how you work and why it matters to the people you serve.]</p>
            <ul class="fs-list" data-fs-stagger>
              <li data-fs-reveal>[A concrete detail people care about]</li>
              <li data-fs-reveal>[A concrete detail people care about]</li>
              <li data-fs-reveal>[A concrete detail people care about]</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" aria-label="In numbers">
        <div class="fs-container">
          <div class="fs-stats" data-fs-stagger>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>[Your figure]</span><span class="fs-stat__label">[What the number counts]</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>[Your figure]</span><span class="fs-stat__label">[What the number counts]</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>[Your figure]</span><span class="fs-stat__label">[What the number counts]</span></div>
          </div>
        </div>
      </section>

      <section class="fs-section" id="work">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" data-fs-reveal>[What you make, sell or do]</h2>
            <p class="fs-lead" data-fs-reveal>[One sentence that frames the work below.]</p>
          </div>
          <div class="fs-mosaic" data-fs-stagger>
${card(1, "work-1", "Your signature piece", "Detail")}
${card(42, "work-2", "Second piece", "Detail")}
${card(78, "work-3", "Third piece", "Detail")}
${card(24, "work-4", "Fourth piece", "Detail")}
${card(61, "work-5", "Fifth piece", "Detail")}
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised">
        <div class="fs-container">
          <figure class="fs-quote" data-fs-reveal>
            <blockquote>[What a real customer said, in their words.]</blockquote>
            <figcaption>
              ${photo(64, 96, 96, "quote-portrait", "[A portrait of the person quoted]")}
              <span>[Name], [their role or town]</span>
              <span class="fs-sample">Sample quote</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section class="fs-section" id="questions">
        <div class="fs-container fs-split fs-split--wide">
          <div class="fs-head">
            <h2 class="fs-h2" data-fs-reveal>Questions, answered</h2>
          </div>
          <div class="fs-faq" data-fs-reveal>
            <details><summary>[A question people really ask]</summary><p>[A short, direct answer.]</p></details>
            <details><summary>[A question people really ask]</summary><p>[A short, direct answer.]</p></details>
            <details><summary>[A question people really ask]</summary><p>[A short, direct answer.]</p></details>
          </div>
        </div>
      </section>

      <section class="fs-section" id="contact">
        <div class="fs-container">
          <div class="fs-cta" data-fs-reveal="scale">
            <h2 class="fs-h2">[An invitation to take the next step]</h2>
            <p class="fs-lead">[Where, when and how to reach you.]</p>
            <div class="fs-actions">
              <a class="fs-btn" href="mailto:[your email]">[Your main action] <span class="fs-btn__icon" aria-hidden="true"></span></a>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Visit</h2><p>[Street, town]</p></div>
          <div><h2>Explore</h2><ul><li><a href="#story">Story</a></li><li><a href="#work">Work</a></li><li><a href="#questions">Questions</a></li></ul></div>
          <div><h2>Contact</h2><ul><li><a href="#contact">Get in touch</a></li></ul></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span data-year></span> [Your site name]</span><span>[A short closing line]</span></div>
        <div class="fs-wordmark" aria-hidden="true">[Your site name]</div>
      </div>
    </footer>

    <script type="module" src="${KIT_URL}"></script>
    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/*
  This site's own look, on top of the Farbaek Studio kit (studio.css), which
  this file overrides. DESIGN.md names each token: change the plan first,
  then these values. One accent, one theme, one corner-radius system.
*/
:root {
  /* The brand. The look on <html data-fs-look> sets a complete starting set. */
  --accent: #1f4bff;
  --accent-2: #00a3c4;
  --on-accent: #ffffff;
  --font-display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Geist", ui-sans-serif, system-ui, sans-serif;
}

/* A brand touch: words in <em> inside a headline take the accent. */
.fs-display em,
.fs-h2 em {
  font-style: normal;
  color: var(--accent);
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/* The kit stops its own motion under reduced motion; anything added here does too. */
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto;
  }
}
`;

const SCRIPT = `// Small things this site adds to the Studio kit. The page is complete without this file.
(function () {
  var year = new Date().getFullYear();
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(year);
  });
})();
`;

const DESIGN = `# Design plan (write this first)

This plan isn't written yet. Before changing the page, replace each section below with decisions for this site: who it's for, how it should feel, and the one thing people will remember. Then build to the plan, and keep it current when the design changes.

The page is built on the Farbaek Studio kit: premium sections, motion that rises in as you scroll, a phone menu, and a complete still page under reduced motion. Keep the kit and the section quality; make everything else this brand's own.

Design read: [one line: the kind of site, its audience and the feeling it should have]

## Look

The kit's looks set a complete palette and type feel on \`<html data-fs-look>\`: signal, atelier and bloom are light; noir and aurora are dark. The starter uses signal, light. Use the colour theme the person chose on the plan card (light unless they chose dark), then the look closest to the brand.

## Palette (CSS variables at the top of styles.css)

Tune \`--accent\` and \`--accent-2\` for the brand (and \`--ink\`, \`--paper\` if needed). One accent leads. Check that text meets WCAG AA contrast.

## Type

A characterful display face used with restraint (\`--font-display\`) and a readable body face (\`--font-body\`), loaded from Google Fonts. The starter uses Bricolage Grotesque and Geist. Not Inter by default, and no Fraunces or Instrument Serif.

## Layout

[How the page is put together, section by section.] The starter has a full-screen hero, a split story with a video, numbers, a mosaic of work, a quote, questions and a closing call. Vary it for this brand: drop what doesn't fit, add what does.

## Signature

[The one element this site will be remembered by, and why it fits.] The starter's is a Farbaek Scenes aurora behind the hero: choose the scene (aurora, glass, particles, horizon, orb, gallery) and colours for this brand, or design another 3D moment.

## Motion

[What moves, why and for how long.] The starter: the headline rises word by word, sections and cards rise in once, framed images unmask, numbers count up, work cards tilt toward the pointer. All of it stops under prefers-reduced-motion.

## Media

Every photo and video is a stand-in marked \`data-farbaek-placeholder\`. Use the person's own images first, then the Farbaek library and photos chosen by subject; replace each in Studio.

## Avoid

[What this design deliberately doesn't do.]
`;

const README = `# [Your site name]

A static website on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Edit

1. Write \`DESIGN.md\` first: the look, palette, type, layout, signature and motion for this site.
2. Put the plan's colours and fonts in the variables at the top of \`styles.css\`.
3. Replace the text in [square brackets] in \`index.html\`, and each photo or video marked as a placeholder (Studio's Replace does it in a click).

## Preview

In Farbaek, open the project and choose **Preview**. It opens right away, with no sandbox.

On your own computer, open \`index.html\` in a browser.
`;

export const STATIC_WEBSITE_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];
