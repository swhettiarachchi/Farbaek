/**
 * Template: a travel and food journal, the premium direction for blogs,
 * journals, newsletters and writers (ADR 0163). Built on the Farbaek Studio
 * kit, light by default: a home page with a featured story, topics and a
 * search that really filter the stories, and an essay set for long reading
 * with a progress line, contents that follow along and real photos in
 * replaceable slots. The 3D moment is the tilting story photos. Sample
 * content; the newsletter form says plainly that it doesn't send yet.
 */
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string | number, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

type Topic = "rail" | "coast" | "hills" | "food";
const TOPIC_LABEL: Record<Topic, string> = { rail: "Rail", coast: "Coast", hills: "Hills", food: "Food" };

const STORIES: { topic: Topic; title: string; dek: string; minutes: number; date: string; photo: string | number; alt: string }[] = [
  { topic: "coast", title: "Three beaches the guidebooks skip", dek: "Quiet sand south of Tangalle, a pier for sunrise, and where to eat after.", minutes: 6, date: "12 October", photo: 521, alt: "A long white pier running out into a calm blue sea" },
  { topic: "hills", title: "Walking tea country after the rain", dek: "Two days on the estate paths above Haputale, with mist for company.", minutes: 9, date: "28 September", photo: 66, alt: "Layers of misty mountains fading into a pale sky" },
  { topic: "food", title: "Breakfast worth a detour", dek: "Hoppers, kiri bath and the best coffee between Colombo and Galle.", minutes: 5, date: "14 September", photo: "1414235077428-338989a2e8c0", alt: "A plated dish set down on a restaurant table" },
  { topic: "hills", title: "Kandy in a day, at walking pace", dek: "The lake at seven, the temple before the crowds, the market at noon.", minutes: 7, date: "30 August", photo: 381, alt: "A still lake surrounded by forested mountains" },
  { topic: "coast", title: "The east coast in surf season", dek: "Arugam Bay without a board: boats, lagoons and long lunches.", minutes: 8, date: "9 August", photo: 124, alt: "A small red boat on clear green water" },
];

const card = (s: (typeof STORIES)[number], i: number) => `            <article class="story" data-topic="${s.topic}" data-text="${(s.title + " " + s.dek).toLowerCase().replace(/[^a-z0-9 ]/g, "")}" data-fs-reveal>
              <a class="story__link" href="post.html">
                <div class="fs-frame" data-fs-tilt="4">${photo(s.photo, 1200, 900, `story-${i + 1}`, s.alt)}</div>
                <p class="story__meta"><span class="tag">${TOPIC_LABEL[s.topic]}</span><span>${s.minutes} min read</span></p>
                <h3 class="story__title">${s.title}</h3>
                <p class="story__dek">${s.dek}</p>
              </a>
            </article>`;

const head = (title: string, description: string) => `<!doctype html>
<html lang="en" data-fs-look="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&amp;family=Work+Sans:wght@400;500;600&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>`;

const nav = `    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="index.html"><span class="mark" aria-hidden="true"></span>Slow Roads</a>
      <ul class="fs-nav__links">
        <li><a href="index.html#stories">Stories</a></li>
        <li><a href="index.html#about">About</a></li>
      </ul>
      <a class="fs-btn" href="index.html#letter">Get the letter <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="index.html#stories">Stories</a>
      <a href="index.html#about">About</a>
      <a href="index.html#letter">Get the letter</a>
    </nav>`;

const footer = `    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Slow Roads</h2><p>Travel and food from Sri Lanka, at walking pace.</p></div>
          <div><h2>Read</h2><ul><li><a href="index.html#stories">All stories</a></li><li><a href="post.html">The slow train to Ella</a></li></ul></div>
          <div><h2>Write</h2><ul><li><a href="mailto:hello@slowroads.example">Send a tip</a></li><li><a href="index.html#letter">The letter</a></li></ul></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Slow Roads. A sample journal.</span><span>Written on the road</span></div>
        <div class="fs-wordmark" aria-hidden="true">Slow Roads</div>
      </div>
    </footer>

    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const INDEX = `${head("Slow Roads, travel and food from Sri Lanka", "Slow travel and good food across Sri Lanka: rail journeys, quiet beaches, tea country and the breakfasts worth a detour.")}
  <body>
${nav}

    <main id="main">
      <section class="fs-section feature" id="top" aria-labelledby="feature-title">
        <div class="fs-container">
          <p class="kicker" data-fs-reveal>A journal of slow travel and good food, from Sri Lanka</p>
          <a class="feature__card" href="post.html">
            <div class="fs-frame fs-frame--wide feature__frame" data-fs-reveal="mask">
              ${photo(204, 2000, 1125, "feature-photo", "A railway line curving through green hills", false)}
            </div>
            <div class="feature__text">
              <p class="story__meta"><span class="tag">Rail</span><span>2 min read</span></p>
              <h1 class="feature__title" id="feature-title" data-fs-reveal="words">The slow train to Ella, and why it's worth every minute</h1>
              <p class="fs-lead" data-fs-reveal>Seven hours, forty tunnels and a cup of tea from a flask at every hill. On taking the long way through the tea country.</p>
              <span class="fs-link">Read the story</span>
            </div>
          </a>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="stories" aria-labelledby="stories-title">
        <div class="fs-container">
          <div class="stories__head">
            <h2 class="fs-h2" id="stories-title" data-fs-reveal>Stories</h2>
            <div class="stories__tools">
              <div class="chips" role="group" aria-label="Filter by topic">
                <button type="button" aria-pressed="true" data-topic="all">Everything</button>
                <button type="button" aria-pressed="false" data-topic="rail">Rail</button>
                <button type="button" aria-pressed="false" data-topic="coast">Coast</button>
                <button type="button" aria-pressed="false" data-topic="hills">Hills</button>
                <button type="button" aria-pressed="false" data-topic="food">Food</button>
              </div>
              <label class="search">
                <span class="fs-sr">Search the stories</span>
                <input type="search" id="search" placeholder="Search the stories" autocomplete="off" />
              </label>
            </div>
          </div>
          <div class="stories" id="stories-list" data-fs-stagger>
${STORIES.map(card).join("\n")}
          </div>
          <p class="fs-small" id="stories-count" role="status">${STORIES.length + 1} stories, newest first</p>
          <p class="empty" id="stories-empty" hidden>No story matches that yet. <button type="button" class="fs-link" id="stories-reset">Show everything</button></p>
        </div>
      </section>

      <section class="fs-section" id="about" aria-labelledby="about-title">
        <div class="fs-container fs-split">
          <div class="fs-frame" data-fs-reveal="mask">
            ${photo(69, 1100, 1375, "about-photo", "Railway tracks running into the distance between trees")}
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" id="about-title" data-fs-reveal>Two people, one small car, no rush.</h2>
            <p class="fs-lead" data-fs-reveal>We write about the island the slow way: second-class carriages, guesthouse breakfasts and the beaches you reach on foot. Nobody pays to be in these pages.</p>
            <ul class="fs-list" data-fs-stagger>
              <li data-fs-reveal>Every place visited, every meal paid for</li>
              <li data-fs-reveal>Prices and timetables checked the month we publish</li>
              <li data-fs-reveal>Corrections at the end of each story, dated</li>
            </ul>
            <p class="fs-small">Sample journal. Replace it with your own story.</p>
          </div>
        </div>
      </section>

      <section class="fs-section" id="letter" aria-labelledby="letter-title">
        <div class="fs-container">
          <div class="fs-cta letter" data-fs-reveal="scale">
            <h2 class="fs-h2" id="letter-title">One letter a month.</h2>
            <p class="fs-lead">The new stories, one place we found that month, and a timetable change worth knowing. Never more, and you can leave in a click.</p>
            <form class="letter__form" id="letter-form" novalidate>
              <label class="fs-sr" for="letter-email">Email address</label>
              <input id="letter-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
              <button class="fs-btn" type="submit">Get the letter <span class="fs-btn__icon" aria-hidden="true"></span></button>
            </form>
            <p class="fs-small" id="letter-msg" role="status">A sample form. It doesn't send anything yet.</p>
          </div>
        </div>
      </section>
    </main>

${footer}`;

const toc = [
  ["platform", "Fort station, 6.40 am"],
  ["window", "The window seat question"],
  ["climb", "The climb past Nanu Oya"],
  ["ella", "Ella, and the walk down"],
  ["know", "Good to know"],
] as const;

const POST = `${head("The slow train to Ella, Slow Roads", "Seven hours, forty tunnels and a cup of tea from a flask at every hill: taking the long way through Sri Lanka's tea country.")}
  <body>
    <div class="progress" aria-hidden="true"><span id="progress"></span></div>
${nav}

    <main id="main">
      <article class="post">
        <header class="post__head fs-container">
          <p class="story__meta" data-fs-reveal><a class="tag" href="index.html#stories">Rail</a><span id="read-time">2 min read</span><span>3 November</span></p>
          <h1 class="post__title" data-fs-reveal="words">The slow train to Ella, and why it's worth every minute</h1>
          <p class="fs-lead" data-fs-reveal>Seven hours, forty tunnels and a cup of tea from a flask at every hill. On taking the long way through the tea country.</p>
        </header>
        <figure class="post__hero fs-container">
          <div class="fs-frame fs-frame--wide" data-fs-reveal="mask">
            ${photo(204, 2000, 1125, "post-hero", "A railway line curving through green hills", false)}
          </div>
          <figcaption class="fs-caption">Above Haputale, where the line starts to curl back on itself.</figcaption>
        </figure>

        <div class="post__layout fs-container">
          <nav class="toc" aria-label="In this story">
            <p class="toc__title">In this story</p>
            <ol>
${toc.map(([id, label]) => `              <li><a href="#${id}">${label}</a></li>`).join("\n")}
            </ol>
          </nav>

          <div class="prose" id="prose">
            <h2 id="platform">Fort station, 6.40 am</h2>
            <p>The Podi Menike leaves Colombo Fort while the city is still deciding whether to wake up. By the time the ticket queue has turned into a crowd, you'll have found the reserved carriage, half-full of people with flasks and the quiet confidence of having done this before.</p>
            <p>There are faster ways to the hills. A car does it in five hours, and the express train in eight. This one takes ten if you count the stops where nothing seems to happen. That's the point.</p>

            <h2 id="window">The window seat question</h2>
            <p>Sit on the left going up. The right side has its moments, but the left gets the valleys, the waterfalls and the long views over the tea. If the window seat is taken, the doorway is better anyway: hold the rail, keep your feet inside, and the whole hillside goes past at walking pace.</p>
            <figure class="prose__figure" data-fs-reveal>
              <div class="fs-frame fs-frame--wide" data-fs-tilt="3">${photo(278, 1600, 900, "post-photo-1", "A road winding up through green hills")}</div>
              <figcaption class="fs-caption">The road below the line. You'll see it, and you won't miss it.</figcaption>
            </figure>
            <blockquote class="pull">Nobody hurries on this train. The tea seller doesn't, the guard doesn't, and after an hour, neither do you.</blockquote>

            <h2 id="climb">The climb past Nanu Oya</h2>
            <p>After Nanu Oya the line stops pretending to be in a hurry. It climbs in long loops, through tunnels short enough to hold your breath in, past estates where the tea pickers look up for a second and go back to work.</p>
            <p>Bring a jumper. Pattipola, the highest station on the line, is cold enough in the morning that the platform vendors sell steaming corn instead of ice cream.</p>

            <h2 id="ella">Ella, and the walk down</h2>
            <p>Ella's station is small, green and full of people taking the same photograph. Walk past them. The road down to the town takes twenty minutes, and the guesthouse with the blue gate halfway down does a rice and curry lunch that justifies the whole day.</p>
            <figure class="prose__figure" data-fs-reveal>
              <div class="fs-frame fs-frame--wide" data-fs-tilt="3">${photo(519, 1600, 900, "post-photo-2", "A road leading toward mountains under a cloudy sky")}</div>
              <figcaption class="fs-caption">The road out of Ella toward Little Adam's Peak.</figcaption>
            </figure>

            <aside class="know" id="know" aria-labelledby="know-title">
              <h2 id="know-title">Good to know</h2>
              <dl>
                <div><dt>Train</dt><dd>Podi Menike, from Colombo Fort at 6.40 am</dd></div>
                <div><dt>Ticket</dt><dd>Reserved second class, booked up to 30 days ahead</dd></div>
                <div><dt>Time</dt><dd>About ten hours to Ella</dd></div>
                <div><dt>Sit</dt><dd>On the left going up, the right coming down</dd></div>
              </dl>
              <p class="fs-small">Sample details. Check the timetable before you travel.</p>
            </aside>

            <div class="author">
              <span class="author__face" aria-hidden="true">SR</span>
              <div>
                <p class="author__name">Written by the Slow Roads two</p>
                <p class="fs-small">We travel by train whenever we can, and write about it a month later, when the good parts have settled.</p>
              </div>
            </div>

            <div class="post__end">
              <button class="fs-btn fs-btn--ghost" type="button" id="share">Copy the link to this story <span class="fs-btn__icon" aria-hidden="true"></span></button>
              <a class="fs-link" href="index.html#stories">More stories</a>
            </div>
            <p class="fs-small" id="share-msg" role="status"></p>
          </div>
        </div>
      </article>
    </main>

${footer}`;

const STYLES = `/* Slow Roads: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #1d5f8c;
  --accent-2: #e0a84a;
  --on-accent: #ffffff;
  --ink: #1b1d1a;
  --ink-2: #575b55;
  --paper: #f3f4f1;
  --paper-2: #ffffff;
  --line: rgb(27 29 26 / 0.12);
  --font-display: "Newsreader", Georgia, serif;
  --font-body: "Work Sans", ui-sans-serif, system-ui, sans-serif;
  --radius: 14px;
  --radius-lg: 24px;
  --fs-display-weight: 500;
  --fs-display-track: -0.02em;
}

[hidden] { display: none !important; }
.mark { width: 22px; height: 12px; border-radius: 999px 999px 0 0; background: var(--accent); box-shadow: inset 0 -3px 0 var(--accent-2); }
.kicker { margin-bottom: 20px; font-size: 15px; color: var(--ink-2); }
.tag { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; background: color-mix(in oklab, var(--accent) 12%, transparent); color: var(--accent); font-size: 13px; font-weight: 600; text-decoration: none; }
/* A topic link stays a small pill but gets a 44px target. */
a.tag { position: relative; }
a.tag::after { content: ""; position: absolute; inset: -9px -6px; }
.story__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; font-size: 14px; color: var(--ink-2); }

/* Home: the featured story, then the rest with topics and a search. */
.feature { padding-top: 120px; }
.feature__card { display: grid; gap: clamp(24px, 4vw, 56px); color: inherit; text-decoration: none; }
@media (min-width: 1000px) { .feature__card { grid-template-columns: 1.4fr 1fr; align-items: end; } }
.feature__text { display: grid; gap: 18px; align-content: end; }
.feature__title { font-size: clamp(38px, 4.6vw, 68px); line-height: 1.04; }
.feature__card:hover .fs-link { background-size: 0% 1px; background-position: 100% calc(100% - 10px); }
.stories__head { display: grid; gap: 20px; margin-bottom: 36px; }
@media (min-width: 900px) { .stories__head { grid-template-columns: auto 1fr; align-items: end; } }
.stories__tools { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 12px; }
.chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.chips button { flex: none; min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink-2); font: 500 15px/1 var(--font-body); cursor: pointer; transition: background-color 160ms, color 160ms; }
.chips button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper-2); }
.search input { width: min(100%, 260px); min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink); font: 400 16px/1 var(--font-body); }
.stories { display: grid; gap: 40px 28px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); margin-bottom: 28px; }
.story__link { display: grid; gap: 12px; color: inherit; text-decoration: none; }
.story__title { font: 500 clamp(24px, 2.2vw, 30px)/1.15 var(--font-display); letter-spacing: -0.015em; transition: color 160ms; }
.story__link:hover .story__title { color: var(--accent); }
.story__dek { color: var(--ink-2); }
.empty { padding: 24px 0; color: var(--ink-2); }
.letter .fs-h2 { max-width: 16ch; }
.letter__form { display: flex; flex-wrap: wrap; gap: 10px; width: min(100%, 560px); }
.letter__form input { flex: 1 1 220px; min-height: 52px; padding: 0 18px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in oklab, var(--paper) 90%, transparent); color: var(--ink); font: 400 16px/1 var(--font-body); }
.letter__form input[aria-invalid="true"] { border-color: var(--accent-2); }

/* The essay: a reading column, contents that follow along, and a progress line. */
/* The reading line follows the page's scroll in CSS, with no script; browsers without scroll timelines simply don't show it. */
.progress { display: none; position: fixed; z-index: 60; left: 0; right: 0; top: 0; height: 3px; }
.progress span { display: block; height: 100%; width: 100%; background: var(--accent); transform-origin: 0 50%; transform: scaleX(0); }
@supports (animation-timeline: scroll()) {
  .progress { display: block; }
  .progress span { animation: read linear both; animation-timeline: scroll(root); }
}
@keyframes read { to { transform: scaleX(1); } }
.post__head { display: grid; gap: 20px; max-width: 860px; padding-top: 128px; }
.post__title { font-size: clamp(40px, 5.4vw, 76px); line-height: 1.03; }
.post__hero { margin-top: clamp(32px, 5vw, 56px); margin-bottom: clamp(32px, 5vw, 64px); }
.post__layout { display: grid; gap: 40px; padding-bottom: clamp(64px, 9vw, 120px); }
@media (min-width: 1000px) { .post__layout { grid-template-columns: 220px minmax(0, 680px); justify-content: center; gap: 72px; } }
.toc { align-self: start; padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper-2); }
@media (min-width: 1000px) { .toc { position: sticky; top: 100px; padding: 0; border: 0; background: none; } }
.toc__title { font-size: 13px; font-weight: 600; color: var(--ink-2); margin-bottom: 8px; }
.toc ol { list-style: none; margin: 0; padding: 0; display: grid; }
.toc a { display: flex; align-items: center; min-height: 44px; padding-left: 14px; border-left: 2px solid var(--line); color: var(--ink-2); text-decoration: none; font-size: 15px; transition: color 160ms, border-color 160ms; }
.toc a[aria-current="true"] { color: var(--ink); border-left-color: var(--accent); font-weight: 500; }
.prose { font: 400 clamp(19px, 0.4vw + 17px, 21px)/1.7 var(--font-display); }
.prose > * + * { margin-top: 1.1em; }
.prose h2 { margin-top: 2em; font-size: clamp(28px, 2.6vw, 36px); line-height: 1.15; }
.prose p:first-of-type::first-letter { float: left; margin: 0.06em 0.1em 0 0; font-size: 3.4em; line-height: 0.8; color: var(--accent); }
.prose__figure { margin: 2em 0; }
.pull { margin: 1.6em 0; padding: 0 0 0 24px; border-left: 3px solid var(--accent-2); font: italic 400 clamp(24px, 2.4vw, 32px)/1.3 var(--font-display); color: var(--ink); }
.know { margin-top: 2.4em; padding: 24px; border-radius: var(--radius-lg); background: var(--paper-2); border: 1px solid var(--line); font-family: var(--font-body); font-size: 16px; }
.know h2 { margin: 0 0 12px; font-size: 26px; }
.know dl { margin: 0 0 12px; display: grid; }
.know dl div { display: grid; grid-template-columns: 90px 1fr; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
.know dt { color: var(--ink-2); }
.know dd { margin: 0; }
.author { display: flex; align-items: center; gap: 16px; margin-top: 2.4em; padding-top: 24px; border-top: 1px solid var(--line); font-family: var(--font-body); }
.author__face { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; flex: none; background: var(--accent); color: var(--on-accent); font: 500 22px/1 var(--font-display); }
.author__name { font-weight: 600; }
.post__end { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: 2em; font-family: var(--font-body); font-size: 16px; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .toc a, .chips button, .story__title { transition: none; }
}
`;

const SCRIPT = `// Slow Roads: topics and search on the home page; the reading line, contents and sharing on a story.
// The pages are complete without this file; the Studio kit does the reveals and the tilt.
(function () {
  // Topics and search, on the stories already on the page.
  var list = document.getElementById("stories-list");
  if (list) {
    var stories = Array.prototype.slice.call(list.querySelectorAll(".story"));
    var chips = Array.prototype.slice.call(document.querySelectorAll("[data-topic]")).filter(function (c) { return c.tagName === "BUTTON"; });
    var search = document.getElementById("search");
    var count = document.getElementById("stories-count");
    var empty = document.getElementById("stories-empty");
    var topic = "all";
    var apply = function () {
      var q = (search.value || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      var shown = 0;
      stories.forEach(function (s) {
        var ok = (topic === "all" || s.dataset.topic === topic) && (!q || s.dataset.text.indexOf(q) !== -1);
        s.hidden = !ok;
        if (ok) shown++;
      });
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.topic === topic)); });
      count.textContent = shown + (shown === 1 ? " story" : " stories") + (topic === "all" && !q ? " below the featured one" : "");
      empty.hidden = shown > 0;
    };
    chips.forEach(function (c) { c.addEventListener("click", function () { topic = c.dataset.topic; apply(); }); });
    search.addEventListener("input", apply);
    document.getElementById("stories-reset").addEventListener("click", function () { topic = "all"; search.value = ""; apply(); });
  }

  // The newsletter: check the address, then say honestly that nothing was sent.
  var letter = document.getElementById("letter-form");
  if (letter) {
    letter.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("letter-email");
      var msg = document.getElementById("letter-msg");
      var ok = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.value.trim());
      email.setAttribute("aria-invalid", String(!ok));
      msg.textContent = ok ? "Thanks. This is a sample form, so nothing was sent yet." : "Enter an email address like name@example.com.";
      if (!ok) email.focus();
    });
  }

  // A story: reading time from its words, the contents following along, and copying the link. The reading line is CSS.
  var prose = document.getElementById("prose");
  if (prose) {
    var words = prose.textContent.trim().split(/\\s+/).length;
    var rt = document.getElementById("read-time");
    if (rt) rt.textContent = Math.max(1, Math.round(words / 220)) + " min read";
    var links = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
    if ("IntersectionObserver" in window && links.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (a) { a.setAttribute("aria-current", String(a.getAttribute("href") === "#" + e.target.id)); });
        });
      }, { rootMargin: "-20% 0px -70% 0px" });
      links.forEach(function (a) { var h = document.getElementById(a.getAttribute("href").slice(1)); if (h) io.observe(h); });
    }

    var share = document.getElementById("share");
    var shareMsg = document.getElementById("share-msg");
    share.addEventListener("click", function () {
      var url = location.href.split("#")[0];
      var done = function () { shareMsg.textContent = "Copied the link to this story."; };
      var fail = function () { shareMsg.textContent = "Couldn't copy here. The link is " + url; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fail);
      else fail();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Slow Roads: design

Design read: a travel and food journal about Sri Lanka by two writers, for readers who plan slowly and read to the end; calm, literate and trustworthy, the photos and the words doing the work. Built on the Farbaek Studio kit, light.

## Look

The kit's signal look, re-cut for reading: a soft grey-green paper, white raised sections, 14px corners, a reading serif for stories and a plain sans for everything you use.

## Palette

- \`--paper\` #f3f4f1 and \`--paper-2\` #ffffff.
- \`--ink\` #1b1d1a and \`--ink-2\` #575b55.
- \`--accent\` #1d5f8c, a lagoon blue, for topics, links, the reading line and the first letter of a story.
- \`--accent-2\` #e0a84a, a lamp-light amber, only for the pull quote's rule and the letter's light.

## Type

Newsreader for headlines and story text, at 19 to 21px with a 1.7 line height; Work Sans for navigation, topics, forms and the facts box. One drop capital per story.

## Layout

Home: the featured story wide with its photo, then the stories in a grid with topics and a search, the two of us, and one letter a month. Story: a big title and lead, the photo wide, a reading column of about 680px with the contents beside it on desktop and above it on phones, photos with captions, a pull quote, a box of practical facts, the writers and the way back.

## Signature

Reading made visible: a thin line along the top that fills as you read, and contents that follow you through the story, alongside photos that tilt a little under the pointer.

## Motion

Titles rise word by word, photos unmask and tilt, stories rise in turn, the reading line fills. All of it stops under reduced motion; the reading line still tracks, because it's information.

## Media

Real travel and food photos marked as placeholders: the featured story, five stories, the writers and the story's photos. Replace them with your own in Studio.

## Avoid

Listicle clickbait, fake bylines, invented awards, "sponsored" posing as editorial, and a newsletter form that pretends to subscribe.
`;

const README = `# Slow Roads journal (template)

A static site on the Farbaek Studio kit: \`index.html\` (the home page), \`post.html\` (a story), \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Change the stories on the home page: each card's \`data-topic\` drives the topics, and its title and summary drive the search.
2. Write each story as its own page from \`post.html\`; the reading time and contents work out themselves from its headings.
3. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
4. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).

The stories, facts and timetable are samples. The newsletter form doesn't send until it's connected.
`;

export const BLOG_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "post.html", content: POST },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];
