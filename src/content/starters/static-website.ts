/**
 * Starter: a static website. Plain HTML, CSS and JavaScript, no build step
 * and no dependencies, so it previews instantly. It's built to the Studio
 * standard's bones (ADR 0030): a blank DESIGN.md to write first, named
 * tokens, a skip link, visible focus, a keyboard-friendly menu, entrances
 * that wait for the script and stop under reduced motion. The look is
 * deliberately neutral, and text in brackets is meant to be replaced.
 */
import type { StarterFile } from "./types";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>[Your site name]</title>
    <meta name="description" content="[One sentence about what you do and who it's for.]" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <div class="sentinel" aria-hidden="true"></div>
    <header class="site-header">
      <a class="brand" href="#top">[Your site name]</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav id="site-nav" class="site-nav" aria-label="Main">
        <a href="#work">Work</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>

    <main id="main">
      <section class="hero" id="top">
        <div class="hero-copy">
          <h1>[A clear line about what you offer]</h1>
          <p class="lead">[One sentence, under 20 words, for the people you want to reach.]</p>
          <a class="button" href="#contact">Get in touch <span class="button-icon" aria-hidden="true">&rarr;</span></a>
        </div>
        <!-- The signature: a stand-in. Replace it with this site's own element (see DESIGN.md). -->
        <div class="signature" aria-hidden="true">
          <div class="sheet sheet-back"></div>
          <div class="sheet sheet-mid"></div>
          <div class="sheet sheet-front">
            <span class="sheet-line"></span>
            <span class="sheet-line short"></span>
            <span class="sheet-dot"></span>
          </div>
        </div>
      </section>

      <section id="work" class="section reveal" aria-labelledby="work-title">
        <h2 id="work-title">Work</h2>
        <ol class="work-list">
          <li>
            <h3>[Project or service]</h3>
            <p>[What it is and the result it delivered.]</p>
            <span class="work-meta">[Year]</span>
          </li>
          <li>
            <h3>[Project or service]</h3>
            <p>[What it is and the result it delivered.]</p>
            <span class="work-meta">[Year]</span>
          </li>
        </ol>
      </section>

      <section id="about" class="section about reveal" aria-labelledby="about-title">
        <h2 id="about-title">About</h2>
        <p>[Who you are, where you work and how you like to work with people.]</p>
      </section>

      <section id="contact" class="section contact reveal" aria-labelledby="contact-title">
        <h2 id="contact-title">Contact</h2>
        <p>[One line on what to write about, and how soon you reply.]</p>
        <a class="contact-link" href="mailto:hello@example.com">[Your email address]</a>
      </section>
    </main>

    <footer class="site-footer">
      <p>&copy; <span id="year"></span> [Your site name]</p>
    </footer>

    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `/*
  The design tokens. DESIGN.md names each one: change the plan first, then
  these values. One accent, one theme, one corner-radius system.
*/
:root {
  --paper: #f6f7f9;
  --surface: #ffffff;
  --ink: #12151b;
  --muted: #555c69;
  --line: #dfe3e9;
  --accent: #2348c9;
  --on-accent: #ffffff;

  --display: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --body: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --step-hero: clamp(2.4rem, 6.4vw, 4.4rem);
  --step-h2: clamp(1.6rem, 3.4vw, 2.3rem);

  --r-input: 12px;
  --r-card: 20px;
  --r-panel: 28px;

  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --fast: 160ms;
  --slow: 600ms;
  --gutter: clamp(16px, 5vw, 48px);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body);
  font-size: 17px;
  line-height: 1.6;
}

a {
  color: var(--accent);
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.skip {
  position: absolute;
  left: 16px;
  top: -60px;
  z-index: 20;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--paper);
  text-decoration: none;
}

.skip:focus {
  top: 16px;
}

.sentinel {
  height: 1px;
}

/* Header: sticky, and it gains an edge once the page moves (script.js). */
.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px var(--gutter);
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid transparent;
  transition: border-color var(--fast) ease, box-shadow var(--fast) ease;
}

.site-header.scrolled {
  border-bottom-color: var(--line);
  box-shadow: 0 8px 24px -20px color-mix(in srgb, var(--ink) 40%, transparent);
}

.brand {
  color: var(--ink);
  font-family: var(--display);
  font-weight: 650;
  letter-spacing: -0.01em;
  text-decoration: none;
}

.site-nav {
  display: flex;
  gap: 8px;
}

.site-nav a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  color: var(--muted);
  text-decoration: none;
}

.site-nav a:hover {
  color: var(--ink);
  background: var(--surface);
}

.menu-toggle {
  display: none;
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}

main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 var(--gutter);
}

/* Hero: the promise on the left, the signature on the right. */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(32px, 6vw, 72px);
  min-height: min(78dvh, 720px);
  padding: clamp(48px, 9vw, 96px) 0;
}

.hero h1 {
  max-width: 16ch;
  margin: 0;
  font-family: var(--display);
  font-size: var(--step-hero);
  font-weight: 600;
  line-height: 1.04;
  letter-spacing: -0.035em;
}

.lead {
  max-width: 44ch;
  margin: 20px 0 32px;
  color: var(--muted);
  font-size: 1.15rem;
}

.button {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 8px 0 24px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
  text-decoration: none;
}

.button-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--on-accent) 16%, transparent);
}

/* The stand-in signature: three sheets in perspective. */
.signature {
  position: relative;
  aspect-ratio: 1 / 0.9;
  perspective: 1200px;
}

.sheet {
  position: absolute;
  inset: 14% 10%;
  border: 1px solid var(--line);
  border-radius: var(--r-panel);
  background: var(--surface);
  box-shadow: 0 40px 70px -40px color-mix(in srgb, var(--ink) 35%, transparent);
  transform: rotateX(14deg) rotateZ(-7deg);
}

.sheet-back {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  transform: rotateX(14deg) rotateZ(-7deg) translate3d(-9%, -12%, -90px);
}

.sheet-mid {
  transform: rotateX(14deg) rotateZ(-7deg) translate3d(-4.5%, -6%, -45px);
}

.sheet-front {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12%;
}

.sheet-line {
  width: 72%;
  height: 10px;
  border-radius: 999px;
  background: var(--line);
}

.sheet-line.short {
  width: 46%;
}

.sheet-dot {
  width: 56px;
  height: 56px;
  margin-top: auto;
  border-radius: 50%;
  background: var(--accent);
}

/* Sections */
.section {
  padding: clamp(48px, 8vw, 88px) 0;
  border-top: 1px solid var(--line);
}

.section h2 {
  margin: 0 0 24px;
  font-family: var(--display);
  font-size: var(--step-h2);
  font-weight: 600;
  letter-spacing: -0.025em;
}

.work-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}

.work-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
  align-items: baseline;
  gap: 8px 24px;
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}

.work-list h3 {
  margin: 0;
  font-size: 1.1rem;
}

.work-list p,
.about p,
.contact p {
  margin: 0;
  color: var(--muted);
}

.work-meta {
  color: var(--muted);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

.about {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 24px;
}

.about h2 {
  margin: 0;
}

.about p {
  max-width: 60ch;
  font-size: 1.1rem;
}

.contact-link {
  display: inline-block;
  margin-top: 20px;
  font-family: var(--display);
  font-size: clamp(1.4rem, 4vw, 2.2rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  text-underline-offset: 6px;
}

.site-footer {
  padding: 32px var(--gutter);
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.9rem;
}

.site-footer p {
  max-width: 1080px;
  margin: 0 auto;
}

@media (max-width: 720px) {
  .menu-toggle {
    display: inline-flex;
    align-items: center;
  }

  .site-nav {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    gap: 0;
    padding: 8px var(--gutter) 16px;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
  }

  .site-nav.is-open {
    display: flex;
  }

  .hero,
  .about {
    grid-template-columns: 1fr;
  }

  .hero {
    min-height: 0;
  }

  .signature {
    max-width: 420px;
  }

  .work-list li {
    grid-template-columns: 1fr;
  }
}

/* Motion: only when the person hasn't asked for less. The still page is complete. */
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }

  .js .reveal {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity var(--slow) var(--ease), transform var(--slow) var(--ease);
  }

  .js .reveal.in {
    opacity: 1;
    transform: none;
  }

  .sheet-front {
    animation: drift 9s ease-in-out infinite;
  }

  .hero.off .sheet-front {
    animation-play-state: paused;
  }

  .button,
  .site-nav a {
    transition: transform var(--fast) var(--ease), background-color var(--fast) ease, color var(--fast) ease;
  }

  .button:hover {
    transform: translateY(-1px);
  }

  .button:hover .button-icon {
    transform: translateX(2px);
  }

  .button-icon {
    transition: transform var(--fast) var(--ease);
  }

  .button:active {
    transform: translateY(0) scale(0.98);
  }
}

@keyframes drift {
  0%,
  100% {
    transform: rotateX(14deg) rotateZ(-7deg) translate3d(0, 0, 0);
  }
  50% {
    transform: rotateX(10deg) rotateZ(-5deg) translate3d(0, -10px, 20px);
  }
}
`;

const SCRIPT = `// Small enhancements. The page is complete without this file.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // The menu on small screens: the button opens it; a link or Escape closes it.
  var toggle = document.querySelector(".menu-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    var setMenu = function (open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (event) {
      if (event.target instanceof HTMLAnchorElement) setMenu(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  // Sections rise in once as they scroll into view.
  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  if (!canObserve) return;

  // The header gains an edge once the page moves.
  var header = document.querySelector(".site-header");
  var sentinel = document.querySelector(".sentinel");
  if (header && sentinel) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle("scrolled", !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  // The signature rests while it's off screen.
  var hero = document.querySelector(".hero");
  if (hero) {
    new IntersectionObserver(function (entries) {
      hero.classList.toggle("off", !entries[0].isIntersecting);
    }).observe(hero);
  }
})();
`;

const DESIGN = `# Design plan (write this first)

This plan isn't written yet. Before changing the page, replace each section below with decisions for this site: who it's for, how it should feel, and the one thing people will remember. Then build to the plan, and keep it current when the design changes.

The page already does what every site needs: a skip link, visible focus, a menu that works by keyboard, sections that rise in once, a signature that rests off screen, and a complete still page under reduced motion. Keep those; change the look.

Design read: [one line: the kind of site, its audience and the feeling it should have]

## Palette (CSS variables at the top of styles.css)

Four to six named colours with one accent. The starter's neutral set is \`--paper\`, \`--surface\`, \`--ink\`, \`--muted\`, \`--line\` and \`--accent\`. Rename them for the brand and check that text meets WCAG AA contrast.

## Type

A characterful display face used with restraint (\`--display\`) and a readable body face (\`--body\`). Not Inter by default, and no Fraunces or Instrument Serif. The starter uses the system sans for both.

## Layout

[How the page is put together, section by section.] The starter has a split hero, a list of work, a two-column about and a contact block. Vary the layout families, and avoid three equal feature cards.

## Signature

[The one element this site will be remembered by, and why it fits.] The three sheets in the hero are a stand-in: replace them.

## Motion

[What moves, why and for how long.] The starter: sections rise in once (600 ms, eased), the signature drifts slowly and rests off screen, buttons lift on hover and press down. All of it stops under prefers-reduced-motion.

## Shape

Pills for buttons, 12px for inputs, 20px for cards and 28px for large panels (\`--r-input\`, \`--r-card\`, \`--r-panel\`). Keep one system.

## Avoid

[What this design deliberately doesn't do.]
`;

const README = `# [Your site name]

A static website: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Edit

1. Write \`DESIGN.md\` first: the palette, type, layout, signature and motion for this site.
2. Put the plan's colours and fonts in the variables at the top of \`styles.css\`.
3. Replace the text in [square brackets] in \`index.html\`, and the stand-in signature in the hero.

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
