/**
 * Template: a photographer's portfolio, the premium direction for
 * photographers, designers, artists and architects (ADR 0160): built on the
 * Farbaek Studio kit, light by default. The name set huge in a condensed
 * cut, a selected-work mosaic whose photos tilt toward the pointer, an index
 * you can filter where a preview floats beside the pointer and leans with
 * its movement, a viewer with arrows and keys, the way a shoot works in
 * order, and an email you can copy. Real architecture, object and fashion
 * photos in replaceable slots. Sample content; complete without JavaScript.
 */
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

type Field = "architecture" | "objects" | "fashion";
const FIELD_LABEL: Record<Field, string> = { architecture: "Architecture", objects: "Objects", fashion: "Fashion" };

interface Work {
  title: string;
  field: Field;
  client: string;
  year: number;
  photo: string;
  alt: string;
  story: string;
}

const WORK: Work[] = [
  { title: "White Curve", field: "architecture", client: "Kaveh Architects", year: 2026, photo: "1549357957-99ab8644c268", alt: "A white curved building facade against a clear blue sky", story: "A library extension shot over three mornings, waiting for the sun to come round the curve." },
  { title: "Lemon", field: "objects", client: "Sour Press juices", year: 2026, photo: "1572635148818-ef6fd45eb394", alt: "A single lemon on a bright yellow surface", story: "One fruit, one colour, one light. The launch campaign for a cold-pressed range." },
  { title: "Pool House", field: "architecture", client: "Lanka Living magazine", year: 2025, photo: "1660361338517-8c8fbb3ac264", alt: "A white modern house beside a long pool and a lawn", story: "A weekend house near Bentota, photographed for a twelve-page feature." },
  { title: "Shape Study", field: "objects", client: "Personal work", year: 2025, photo: "1604782206219-3b9576575203", alt: "Curved paper shapes in sand and black", story: "Paper, a knife and one window. A series about how little a shadow needs." },
  { title: "Red Room", field: "fashion", client: "Saffron Label", year: 2025, photo: "1662532577856-e8ee8b138a8b", alt: "A model in a red outfit sitting against a deep blue background", story: "The autumn lookbook, built in the studio from two colours of paint." },
  { title: "Slat House", field: "architecture", client: "Field Office architects", year: 2024, photo: "1564703048291-bcf7f001d83d", alt: "A two-storey house clad in timber slats under a pitched roof", story: "A family house in the hills, documented from site to the day they moved in." },
  { title: "Pink", field: "objects", client: "Mira cosmetics", year: 2024, photo: "1591360236480-4ed861025fa1", alt: "A pink and black lipstick lying on a pink surface", story: "A product set for a first collection, colour-matched to the packaging." },
  { title: "After Hours", field: "architecture", client: "Kaveh Architects", year: 2024, photo: "1721815693498-cc28507c0ba2", alt: "A modern multi-storey house with its windows lit", story: "The same house at blue hour, every light on, for the practice's book." },
  { title: "Shadow Play", field: "objects", client: "Personal work", year: 2023, photo: "1752520836249-2b8738e12664", alt: "The hard shadow of a cut-out shape on a stone wall", story: "Noon light on a garden wall in Galle, and a shape cut to meet it." },
];

// Selected work for the mosaic: its first card is the wide one.
const SELECTED = [0, 1, 2, 4, 3];

const mosaic = SELECTED.map((i, n) => {
  const w = WORK[i]!;
  return `            <button class="fs-card work" type="button" data-work="${i}" data-fs-reveal>
              <div class="fs-frame" data-fs-tilt="4">${photo(w.photo, n === 0 ? 1600 : 1000, n === 0 ? 1000 : 1250, `work-${i + 1}`, w.alt)}</div>
              <span class="work__title">${w.title}</span>
              <span class="fs-card__meta"><span>${FIELD_LABEL[w.field]}, ${w.client}</span><span>${w.year}</span></span>
            </button>`;
}).join("\n");

const rows = WORK.map(
  (w, i) => `            <li class="row" data-field="${w.field}">
              <button type="button" data-work="${i}" data-peek="${photoUrl(w.photo, 640, 480)}">
                <img class="row__thumb" src="${photoUrl(w.photo, 160, 120)}" alt="" width="80" height="60" loading="lazy" />
                <span class="row__year">${w.year}</span>
                <span class="row__title">${w.title}</span>
                <span class="row__client">${w.client}</span>
                <span class="row__field">${FIELD_LABEL[w.field]}</span>
              </button>
            </li>`,
).join("\n");

// The viewer reads each project from here, so the page needs no data file.
const WORK_JSON = JSON.stringify(
  WORK.map((w) => ({ title: w.title, meta: `${FIELD_LABEL[w.field]}, ${w.client}, ${w.year}`, story: w.story, src: photoUrl(w.photo, 1800, 1200), alt: w.alt })),
).replace(/</g, "\\u003c");

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Oru Studio, photography of buildings and objects</title>
    <meta name="description" content="Oru Studio photographs architecture, objects and the odd fashion story, from Colombo. Selected work, an index of projects and how a shoot works." />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..700&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top">Oru Studio</a>
      <ul class="fs-nav__links">
        <li><a href="#work">Work</a></li>
        <li><a href="#index">Index</a></li>
        <li><a href="#about">About</a></li>
      </ul>
      <a class="fs-btn fs-btn--ink" href="#contact">Start a project <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#work">Work</a>
      <a href="#index">Index</a>
      <a href="#about">About</a>
      <a href="#contact">Start a project</a>
    </nav>

    <main id="main">
      <section class="hero" id="top">
        <div class="fs-container">
          <h1 class="name" data-fs-reveal="words">Oru Studio</h1>
          <div class="hero__row">
            <p class="fs-lead" data-fs-reveal>Photographs of buildings, the objects in them and the odd fashion story. From Colombo, and wherever the light is good.</p>
            <p class="hero__status" data-fs-reveal><span class="dot" aria-hidden="true"></span>Booking shoots from February</p>
          </div>
          <figure class="hero__latest">
            <div class="fs-frame fs-frame--wide" data-fs-reveal="mask">
              ${photo(WORK[0]!.photo, 2000, 1125, "hero-photo", WORK[0]!.alt, false)}
            </div>
            <figcaption class="fs-caption">Latest: ${WORK[0]!.title}, for ${WORK[0]!.client}, ${WORK[0]!.year}.</figcaption>
          </figure>
        </div>
      </section>

      <section class="fs-section" id="work" aria-labelledby="work-title">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" id="work-title" data-fs-reveal>Selected work</h2>
            <p class="fs-lead" data-fs-reveal>Five projects from the last two years. Open one to see it large.</p>
          </div>
          <div class="fs-mosaic" data-fs-stagger>
${mosaic}
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="index" aria-labelledby="index-title">
        <div class="fs-container">
          <div class="index__head">
            <h2 class="fs-h2" id="index-title" data-fs-reveal>Index</h2>
            <div class="chips" role="group" aria-label="Filter the index">
              <button type="button" aria-pressed="true" data-filter="all">Everything</button>
              <button type="button" aria-pressed="false" data-filter="architecture">Architecture</button>
              <button type="button" aria-pressed="false" data-filter="objects">Objects</button>
              <button type="button" aria-pressed="false" data-filter="fashion">Fashion</button>
            </div>
          </div>
          <ul class="rows" id="rows">
${rows}
          </ul>
          <p class="fs-small" id="rows-count" role="status">${WORK.length} projects</p>
        </div>
        <div class="peek" id="peek" aria-hidden="true"><img src="${photoUrl(WORK[0]!.photo, 640, 480)}" alt="" width="320" height="240" loading="lazy" /></div>
      </section>

      <section class="fs-section" id="about" aria-labelledby="about-title">
        <div class="fs-container fs-split">
          <div class="fs-frame" data-fs-reveal="mask">
            ${photo("1768471125958-78556538fadc", 1100, 1375, "studio-photo", "A woman working at a desk in a bright studio full of plants")}
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" id="about-title" data-fs-reveal>A small studio that waits for the light.</h2>
            <p class="fs-lead" data-fs-reveal>Oru is one photographer, one assistant and a lot of early mornings. We work with architects, magazines and brands who'd rather have twelve right pictures than two hundred.</p>
            <div class="fs-stats" data-fs-stagger>
              <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>11</span><span class="fs-stat__label">years photographing buildings</span></div>
              <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>60</span><span class="fs-stat__label">houses, libraries and hotels</span></div>
            </div>
            <p class="fs-small">Sample figures and clients. Replace them with yours.</p>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" aria-labelledby="how-title">
        <div class="fs-container">
          <div class="fs-head">
            <h2 class="fs-h2" id="how-title" data-fs-reveal>How a shoot works</h2>
          </div>
          <ol class="steps" data-fs-stagger>
            <li data-fs-reveal><h3 class="fs-h3">A brief and a walk</h3><p>We talk about what the pictures are for, then walk the place at the hours that matter.</p></li>
            <li data-fs-reveal><h3 class="fs-h3">The shoot</h3><p>One or two days, often starting before sunrise. You're welcome to come, never required to.</p></li>
            <li data-fs-reveal><h3 class="fs-h3">The set</h3><p>A graded set within ten days, sized for print and the web, with the rights you need written down.</p></li>
          </ol>
        </div>
      </section>

      <section class="fs-section" id="contact" aria-labelledby="contact-title">
        <div class="fs-container">
          <div class="fs-cta contact" data-fs-reveal="scale">
            <h2 class="fs-h2" id="contact-title">Have a building, or a thing, that deserves a proper picture?</h2>
            <p class="fs-lead">Tell us where it is and what it's for. We answer within two days.</p>
            <div class="fs-actions">
              <a class="fs-btn" href="mailto:studio@oru.example">studio@oru.example <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <button class="fs-link copy" type="button" id="copy-email" data-email="studio@oru.example">Copy the email</button>
            </div>
            <p class="fs-small" id="copy-msg" role="status">A sample address.</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Studio</h2><p>14 Alfred House Gardens<br />Colombo 3</p></div>
          <div><h2>See</h2><ul><li><a href="#work">Selected work</a></li><li><a href="#index">Index</a></li><li><a href="#about">About</a></li></ul></div>
          <div><h2>Talk</h2><ul><li><a href="mailto:studio@oru.example">Email the studio</a></li><li><a href="tel:+94110000000">Call</a></li></ul></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Oru Studio. A sample portfolio.</span><span>Photographs are stand-ins</span></div>
        <div class="fs-wordmark" aria-hidden="true">Oru Studio</div>
      </div>
    </footer>

    <dialog class="viewer" id="viewer" aria-labelledby="viewer-title">
      <div class="viewer__inner">
        <div class="viewer__media"><img id="viewer-img" src="${photoUrl(WORK[0]!.photo, 1800, 1200)}" alt="${WORK[0]!.alt}" width="1800" height="1200" loading="lazy" /></div>
        <div class="viewer__text">
          <p class="fs-small" id="viewer-meta"></p>
          <h2 class="fs-h3" id="viewer-title">Project</h2>
          <p id="viewer-story"></p>
          <p class="fs-small"><span id="viewer-count"></span></p>
        </div>
        <div class="viewer__nav">
          <button type="button" class="round" id="viewer-prev" aria-label="Previous project"><span class="chev chev--left" aria-hidden="true"></span></button>
          <button type="button" class="round" id="viewer-next" aria-label="Next project"><span class="chev" aria-hidden="true"></span></button>
          <button type="button" class="round" id="viewer-close" aria-label="Close the viewer"><span class="x" aria-hidden="true"></span></button>
        </div>
      </div>
    </dialog>

    <script type="application/json" id="work-data">${WORK_JSON}</script>
    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/* Oru Studio: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #0e7a55;
  --accent-2: #c9d63a;
  --on-accent: #ffffff;
  --ink: #0d0d0d;
  --ink-2: #5a5a57;
  --paper: #eeeeeb;
  --paper-2: #f7f7f5;
  --line: rgb(13 13 13 / 0.12);
  --font-display: "Archivo", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Archivo", ui-sans-serif, system-ui, sans-serif;
  --radius: 6px;
  --radius-lg: 10px;
  --fs-display-weight: 600;
  --fs-display-track: -0.01em;
}

[hidden] { display: none !important; }
/* One family in two widths: condensed for display, normal for reading. */
h1, h2, h3, .fs-wordmark, .fs-stat__num, .work__title, .row__title { font-stretch: 72%; }
.fs-h2 { text-transform: uppercase; line-height: 0.95; }
.fs-nav__brand { font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.01em; }

/* The hero: the name, as wide as the page. */
.hero { padding: 132px 0 clamp(48px, 7vw, 96px); }
.name { font-size: clamp(56px, 19vw, 300px); line-height: 0.82; text-transform: uppercase; letter-spacing: -0.02em; margin-left: -0.04em; }
.hero__row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 20px 40px; margin: clamp(24px, 4vw, 48px) 0; }
.hero__status { display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px; border: 1px solid var(--line); border-radius: 999px; font-size: 15px; }
.dot { width: 9px; height: 9px; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 22%, transparent); }
.hero__latest { margin: 0; }

/* Selected work: the mosaic's cards are buttons that open the viewer. */
.work { padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.work__title { font: var(--fs-display-weight) clamp(26px, 2.6vw, 38px)/1 var(--font-display); text-transform: uppercase; }
.work:focus-visible { outline: 2px solid var(--accent); outline-offset: 6px; }

/* The index: rows you can filter, with a preview that follows the pointer. */
.index__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 20px; margin-bottom: 32px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips button { min-height: 44px; padding: 0 18px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink-2); font: 500 15px/1 var(--font-body); cursor: pointer; transition: background-color 160ms, color 160ms, border-color 160ms; }
.chips button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper-2); }
.rows { list-style: none; margin: 0 0 20px; padding: 0; border-top: 1px solid var(--line); }
.row button { width: 100%; display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 4px 16px; min-height: 64px; padding: 14px 0; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--ink); font: 400 16px/1.3 var(--font-body); text-align: left; cursor: pointer; transition: padding-left 300ms var(--fs-ease), color 200ms; }
.row__thumb { display: none; }
.row__year { color: var(--ink-2); font-variant-numeric: tabular-nums; }
.row__title { font: 600 clamp(24px, 3vw, 44px)/1 var(--font-display); text-transform: uppercase; }
.row__client, .row__field { grid-column: 2; color: var(--ink-2); font-size: 15px; }
@media (min-width: 900px) {
  .row button { grid-template-columns: 80px 1.4fr 1fr 140px; }
  .row__client, .row__field { grid-column: auto; }
  .row__field { text-align: right; }
  .row button:hover { padding-left: 16px; }
  .rows:hover .row button:not(:hover) { color: var(--ink-2); }
}
/* On touch screens there's no pointer to follow, so each row shows its picture. */
@media (hover: none) {
  .row button { grid-template-columns: 80px 1fr; }
  .row__thumb { display: block; grid-row: span 4; width: 80px; height: 60px; object-fit: cover; border-radius: 4px; }
  .row__year, .row__title, .row__client, .row__field { grid-column: 2; }
}
.peek { position: fixed; z-index: 30; left: 0; top: 0; width: 320px; aspect-ratio: 4 / 3; border-radius: var(--radius-lg); overflow: hidden; pointer-events: none; visibility: hidden; box-shadow: 0 30px 60px -24px rgb(13 13 13 / 0.5); transform: translate3d(var(--x, 0), var(--y, 0), 0) rotateY(var(--ry, 0deg)) rotateZ(var(--rz, 0deg)) scale(0.6); transition: transform 500ms var(--fs-ease), visibility 0s 300ms; }
.peek img { width: 100%; height: 100%; object-fit: cover; }
.peek.is-on { visibility: visible; transform: translate3d(var(--x, 0), var(--y, 0), 0) perspective(800px) rotateY(var(--ry, 0deg)) rotateZ(var(--rz, 0deg)) scale(1); transition: transform 500ms var(--fs-ease); }
@media (hover: none) { .peek { display: none; } }

/* How a shoot works: three steps, numbered because the order matters. */
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 32px; counter-reset: step; }
@media (min-width: 900px) { .steps { grid-template-columns: repeat(3, 1fr); } }
.steps li { display: grid; gap: 12px; padding-top: 20px; border-top: 2px solid var(--ink); counter-increment: step; }
.steps li::before { content: counter(step, decimal-leading-zero); font: 600 15px/1 var(--font-body); color: var(--accent); }
.steps p { color: var(--ink-2); max-width: 36ch; }

.contact .fs-h2 { max-width: 18ch; }
.copy { min-height: 44px; border: 0; background: none; padding: 0; color: inherit; cursor: pointer; font: inherit; font-weight: 500; }

/* The viewer. */
.viewer { width: min(100% - 24px, 1280px); max-height: calc(100dvh - 24px); padding: 0; border: 0; border-radius: var(--radius-lg); background: var(--paper-2); color: var(--ink); }
.viewer::backdrop { background: rgb(13 13 13 / 0.72); }
.viewer[open] { animation: rise 420ms var(--fs-ease); }
@keyframes rise { from { transform: translateY(24px) scale(0.98); } }
.viewer__inner { display: grid; }
@media (min-width: 900px) { .viewer__inner { grid-template-columns: 1fr 320px; } }
.viewer__media { background: var(--paper); }
.viewer__media img { width: 100%; height: auto; max-height: 72dvh; object-fit: contain; }
.viewer__text { display: grid; gap: 10px; align-content: start; padding: 24px; }
.viewer__text .fs-h3 { text-transform: uppercase; font-size: clamp(28px, 3vw, 40px); }
.viewer__nav { display: flex; gap: 8px; padding: 0 24px 24px; }
@media (min-width: 900px) { .viewer__nav { grid-column: 2; align-self: end; } }
.round { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink); cursor: pointer; transition: border-color 160ms; }
.round:hover { border-color: var(--ink); }
.chev { width: 9px; height: 9px; border: solid currentColor; border-width: 1.8px 1.8px 0 0; transform: translateX(-2px) rotate(45deg); }
.chev--left { transform: translateX(2px) rotate(-135deg); }
.x { position: relative; width: 14px; height: 14px; }
.x::before, .x::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 1.6px; background: currentColor; rotate: 45deg; }
.x::after { rotate: -45deg; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .peek, .peek.is-on, .row button { transition: none; }
  .viewer[open] { animation: none; }
}
`;

const SCRIPT = `// Oru Studio: the index filter, the floating preview, the project viewer and copying the email.
// The page is complete without this file; the Studio kit does the reveals and the tilt.
(function () {
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var work = [];
  try { work = JSON.parse(document.getElementById("work-data").textContent); } catch (e) { work = []; }

  // The index filter.
  var chips = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  var rows = Array.prototype.slice.call(document.querySelectorAll(".row"));
  var count = document.getElementById("rows-count");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var f = chip.dataset.filter, shown = 0;
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      rows.forEach(function (r) { r.hidden = !(f === "all" || r.dataset.field === f); if (!r.hidden) shown++; });
      if (count) count.textContent = shown + (shown === 1 ? " project" : " projects");
    });
  });

  // The preview beside the pointer: it trails a little and leans with the movement.
  var peek = document.getElementById("peek");
  var list = document.getElementById("rows");
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (peek && list && fine) {
    var img = peek.querySelector("img");
    var x = 0, y = 0, lastX = 0, frame = 0;
    var place = function () {
      frame = 0;
      var lean = still ? 0 : Math.max(-14, Math.min(14, (x - lastX) * 0.6));
      lastX = x;
      peek.style.setProperty("--x", (x + 28) + "px");
      peek.style.setProperty("--y", (y - 120) + "px");
      peek.style.setProperty("--ry", lean + "deg");
      peek.style.setProperty("--rz", (lean / 4) + "deg");
    };
    list.addEventListener("pointermove", function (e) {
      x = e.clientX; y = e.clientY;
      if (!frame) frame = requestAnimationFrame(place);
    });
    list.querySelectorAll("button[data-peek]").forEach(function (b) {
      b.addEventListener("pointerenter", function () {
        if (img.getAttribute("src") !== b.dataset.peek) img.setAttribute("src", b.dataset.peek);
        peek.classList.add("is-on");
      });
    });
    list.addEventListener("pointerleave", function () { peek.classList.remove("is-on"); });
  }

  // The viewer: a dialog with the project large, arrows, keys and Escape.
  var dialog = document.getElementById("viewer");
  var at = 0;
  function show(i) {
    if (!work.length) return;
    at = (i + work.length) % work.length;
    var w = work[at];
    var vimg = document.getElementById("viewer-img");
    vimg.src = w.src;
    vimg.alt = w.alt;
    document.getElementById("viewer-title").textContent = w.title;
    document.getElementById("viewer-meta").textContent = w.meta;
    document.getElementById("viewer-story").textContent = w.story;
    document.getElementById("viewer-count").textContent = (at + 1) + " of " + work.length;
  }
  if (dialog && typeof dialog.showModal === "function") {
    document.querySelectorAll("button[data-work]").forEach(function (b) {
      b.addEventListener("click", function () {
        show(Number(b.dataset.work));
        if (peek) peek.classList.remove("is-on");
        dialog.showModal();
      });
    });
    document.getElementById("viewer-prev").addEventListener("click", function () { show(at - 1); });
    document.getElementById("viewer-next").addEventListener("click", function () { show(at + 1); });
    document.getElementById("viewer-close").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") show(at + 1);
      if (e.key === "ArrowLeft") show(at - 1);
    });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
  }

  // Copy the email, and say what happened.
  var copy = document.getElementById("copy-email");
  var msg = document.getElementById("copy-msg");
  if (copy && msg) {
    copy.addEventListener("click", function () {
      var email = copy.dataset.email;
      var done = function () { msg.textContent = "Copied. It's a sample address, so replace it with yours."; };
      var fail = function () { msg.textContent = "Couldn't copy here. The address is " + email + "."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(email).then(done, fail);
      else fail();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Oru Studio: design

Design read: a photographer's portfolio for a small studio in Colombo that shoots architecture and objects, for architects, editors and brand managers deciding who to hire; quiet, exact and confident, the work doing the talking. Built on the Farbaek Studio kit, light.

## Look

The kit's signal look, re-cut: a cool stone paper, small 6px corners like a print's edge, one family in two widths.

## Palette

- \`--paper\` #eeeeeb, cool stone, and \`--paper-2\` #f7f7f5 for raised sections and the viewer.
- \`--ink\` #0d0d0d and \`--ink-2\` #5a5a57.
- \`--accent\` #0e7a55, a deep green, for the booking dot, step numbers, focus and the contact band.
- \`--accent-2\` #c9d63a, chartreuse, only in the contact band's light.

## Type

Archivo throughout: condensed (72% width) and uppercase for the name, headlines, titles and numbers; normal width for reading.

## Layout

The name across the whole page, a line about the studio and its booking status, the latest project wide; a selected-work mosaic; an index of every project with filters; the studio and two figures; three steps in order; a contact band; a dense footer with the wordmark; a viewer for any project.

## Signature

The index: hover a project and its picture floats beside the pointer, trailing it and leaning with the movement in 3D. On touch screens each row carries its own picture instead.

## Motion

The name rises word by word, the latest project unmasks, the mosaic rises in turn and its photos tilt toward the pointer, index rows slide aside on hover, the viewer rises in. All of it stops under reduced motion.

## Media

Every photo is a real architecture, object or fashion photo marked as a placeholder. Replace each with the studio's own in Studio.

## Avoid

A serif "because it's creative", grids of identical squares, invented awards or client logos, and text over the photos.
`;

const README = `# Oru Studio portfolio (template)

A static site on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Change the projects in \`index.html\`: the mosaic, the index rows and the viewer's data (the \`work-data\` block) list the same projects.
2. Change the name, the booking line, the figures, the steps and the email.
3. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
4. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).

The clients, figures and address are samples.
`;

export const PORTFOLIO_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];
