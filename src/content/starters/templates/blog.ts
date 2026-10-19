/**
 * Template: a small blog, built to the Studio standard (ADR 0030): a home
 * page and an essay set for comfortable reading, line drawings that draw
 * themselves, a reading-progress bar, and a light and dark theme. Sample
 * content; previews instantly and is complete without JavaScript.
 */
import type { StarterFile } from "../types";

// The cover drawing for the first essay: a plain box being shipped while a clever plan stays a sketch.
const COVER = `<svg class="drawing" viewBox="0 0 600 340" role="img" aria-label="A line drawing of a plain wooden box with an arrow carrying it out, while a complicated plan stays a dotted sketch">
          <path class="ink" pathLength="1" d="M150 150h150v120H150z" />
          <path class="ink" pathLength="1" d="M150 150l40-34h150l-40 34M300 270l40-34V116" />
          <path class="ink" pathLength="1" d="M150 200h150M150 235h150" />
          <path class="accent" pathLength="1" d="M330 300c80 10 150-20 210-90" />
          <path class="accent" pathLength="1" d="M520 206l22 2-6 22" />
          <g class="sketch">
            <circle cx="440" cy="80" r="26" />
            <circle cx="510" cy="60" r="16" />
            <circle cx="500" cy="122" r="20" />
            <path d="M466 80h28M440 106l50 10M510 76l-6 26" />
          </g>
        </svg>`;

const HEAD = (title: string, description: string, extra = "") => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="stylesheet" href="styles.css" />
    <script>try { var t = localStorage.getItem("field-notes-theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) {}</script>
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>${extra}
    <header class="masthead">
      <a class="wordmark" href="index.html">Field Notes</a>
      <nav class="nav" aria-label="Main">
        <a href="index.html">Essays</a>
        <a href="index.html#about">About</a>
        <button class="theme" type="button" id="theme" aria-label="Switch to the dark theme">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path class="moon" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /><g class="sun"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></g></svg>
        </button>
      </nav>
    </header>
`;

const FOOT = `    <footer class="foot">
      <p>Field Notes is a sample blog. The writer, essays and dates are sample content.</p>
      <a href="index.html">All essays</a>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`;

const INDEX = `${HEAD("Field Notes: small lessons from building things", "Short essays about building small things well, one a month. A sample blog.")}
    <main id="main" class="wrap">
      <section class="intro">
        <h1>Small lessons from building things.</h1>
        <p class="dek">Short essays, one a month, about making software and furniture that people actually use. Written by a sample writer.</p>
      </section>

      <article class="feature reveal">
        <a class="feature-link" href="post.html">
          <div class="feature-art">
        ${COVER}
          </div>
          <div class="feature-text">
            <p class="meta"><time datetime="2026-09-02">2 Sept 2026</time> · 6 min read</p>
            <h2>Ship the boring version first</h2>
            <p>The plain version teaches you more in a week than the clever one does in a month. Here is how to tell which one you're building.</p>
            <span class="read">Read the essay <span aria-hidden="true">&rarr;</span></span>
          </div>
        </a>
      </article>

      <section class="drafts reveal" aria-labelledby="drafts-title">
        <h2 id="drafts-title">On the desk</h2>
        <ol>
          <li><span class="meta">Draft, due in November</span><strong>Write the error message first</strong><span>If you can't explain what went wrong, you don't understand the feature yet.</span></li>
          <li><span class="meta">Draft, due in December</span><strong>One page, one job</strong><span>Every screen should answer one question for one person.</span></li>
        </ol>
      </section>

      <section class="subscribe reveal" id="subscribe" aria-labelledby="subscribe-title">
        <h2 id="subscribe-title">Get the next essay</h2>
        <p>One email a month, when an essay is ready. Nothing else.</p>
        <form class="signup" id="signup">
          <label class="sr-only" for="email">Email</label>
          <input id="email" type="email" autocomplete="email" placeholder="you@example.com" required />
          <button class="button" type="submit">Subscribe</button>
        </form>
        <p class="signup-msg" id="signup-msg" role="status">A sample form: it doesn't send anything yet.</p>
      </section>

      <section id="about" class="about reveal" aria-labelledby="about-title">
        <h2 id="about-title">About</h2>
        <p>I build software for a living and furniture on weekends. Both have taught me the same thing: the first version should be plain, sturdy and finished. These are notes from that work. (A sample bio.)</p>
      </section>
    </main>
${FOOT}`;

const POST = `${HEAD("Ship the boring version first | Field Notes", "Why the plain version of a feature teaches you more than the clever one, and how to tell which you're building. A sample essay.", `
    <div class="progress" aria-hidden="true"></div>`)}
    <main id="main" class="wrap">
      <article class="post">
        <header class="post-head">
          <a class="back" href="index.html"><span aria-hidden="true">&larr;</span> All essays</a>
          <p class="meta"><time datetime="2026-09-02">2 Sept 2026</time> · 6 min read · Sample essay</p>
          <h1>Ship the boring version first</h1>
          <p class="dek">The plain version teaches you more in a week than the clever one does in a month.</p>
        </header>
        <div class="post-art">
        ${COVER}
        </div>

        <div class="prose">
          <p class="lede">Every project I've regretted started with a clever plan. Every one I'm proud of started with a box: four sides, a lid, nothing that could go wrong. The box went out first. The clever parts came later, when I knew which ones mattered.</p>

          <p>The boring version is the smallest thing that does the job from start to finish. Not a prototype that only works on your machine, and not a demo with the hard parts faked. A real, plain, finished thing that someone can use on Monday.</p>

          <h2>What the boring version tells you</h2>
          <p>It tells you whether anyone wants the job done at all. That sounds obvious, but a clever version hides the answer. When people don't use it, you can't tell whether they didn't need it or didn't understand it. When they don't use the plain version, you know.</p>
          <p>It also tells you where the real difficulty is. In my experience it's almost never where the plan said it would be.<sup id="ref1"><a href="#fn1" aria-label="Footnote 1">1</a></sup> The plan worries about scale; the people using it worry about the second step of a form.</p>

          <blockquote class="pull">
            <p>A plan worries about scale. People worry about the second step of a form.</p>
          </blockquote>

          <h2>How to tell which one you're building</h2>
          <p>Ask three questions before you start:</p>
          <ol>
            <li><strong>Could someone use it next week?</strong> If the answer depends on something you haven't built yet, it isn't the boring version.</li>
            <li><strong>Can you explain it in one sentence without the word "and"?</strong> Two jobs means two versions.</li>
            <li><strong>Would you be embarrassed to show it?</strong> A little embarrassment is the right amount.</li>
          </ol>

          <figure class="figure">
            <svg viewBox="0 0 560 170" role="img" aria-label="Sample diagram: the boring version ships in week one and learns for five weeks; the clever version ships in week six">
              <g class="axis"><path d="M100 140h440" /><text x="100" y="162">Week 1</text><text x="300" y="162">Week 4</text><text x="500" y="162">Week 6</text></g>
              <text class="label" x="0" y="52">Boring</text>
              <path class="bar-a" pathLength="1" d="M100 46h60" />
              <path class="bar-learn" pathLength="1" d="M160 46h380" />
              <text class="note" x="168" y="30">Out in week 1, then five weeks of real use</text>
              <text class="label" x="0" y="112">Clever</text>
              <path class="bar-b" pathLength="1" d="M100 106h440" />
              <text class="note" x="380" y="90">Out in week 6</text>
            </svg>
            <figcaption>Same six weeks. Only one of them gets five weeks of answers. (A sample diagram.)</figcaption>
          </figure>

          <h2>Then make it less boring</h2>
          <p>Once the plain version is out, every improvement has a reason. You add the shortcut because people asked for it, not because it was in the plan. The clever version still arrives. It just arrives built on what you learned, instead of on what you guessed.</p>
          <p>Ship the box. Then carve the lid.</p>

          <aside class="footnotes" aria-label="Footnotes">
            <ol>
              <li id="fn1">Twice it was exactly where the plan said. Both times the plan was a copy of something I'd already shipped. <a href="#ref1" aria-label="Back to the text">&#8617;</a></li>
            </ol>
          </aside>
        </div>

        <footer class="post-end">
          <p>The next essay, "Write the error message first", arrives in November.</p>
          <a class="button" href="index.html#subscribe">Get it by email</a>
        </footer>
      </article>
    </main>
${FOOT}`;

const STYLES = `/* Field Notes. The design decisions behind these tokens are in DESIGN.md. */
:root {
  --paper: #fbfbf9;
  --ink: #1f2328;
  --muted: #59606a;
  --line: #e4e5e1;
  --accent: #b4361f;
  --tint: #f1f2ee;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --serif: Charter, "Bitstream Charter", "Sitka Text", "Iowan Old Style", Cambria, Georgia, serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(16px, 5vw, 48px);
  color-scheme: light;
}
:root[data-theme="dark"] { --paper: #141619; --ink: #ebe9e4; --muted: #a3a7ae; --line: #2a2d31; --accent: #f08a6b; --tint: #1c1f23; color-scheme: dark; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --paper: #141619; --ink: #ebe9e4; --muted: #a3a7ae; --line: #2a2d31; --accent: #f08a6b; --tint: #1c1f23; color-scheme: dark; }
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 18px/1.65 var(--serif); -webkit-font-smoothing: antialiased; transition: background-color 0.3s, color 0.3s; }
a { color: inherit; }
h1, h2, h3 { font-family: var(--sans); font-weight: 750; letter-spacing: -0.03em; line-height: 1.08; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; border-radius: 6px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip { position: absolute; left: 16px; top: -60px; z-index: 20; padding: 10px 16px; border-radius: 999px; background: var(--ink); color: var(--paper); font-family: var(--sans); }
.skip:focus { top: 12px; }
.wrap { max-width: 1040px; margin: 0 auto; padding: 0 var(--gutter); }
.meta { margin: 0; color: var(--muted); font: 13px var(--mono); }

.masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 1040px; margin: 0 auto; padding: 14px var(--gutter); font-family: var(--sans); }
.wordmark { min-height: 44px; display: inline-flex; align-items: center; font-weight: 800; font-size: 20px; letter-spacing: -0.04em; text-decoration: none; }
.nav { display: flex; align-items: center; gap: 2px; }
.nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 999px; font-size: 15px; text-decoration: none; }
.nav a:hover { background: var(--tint); }
.theme { display: none; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 50%; background: transparent; color: var(--ink); cursor: pointer; }
.js .theme { display: grid; }
.theme:hover { background: var(--tint); }
.theme svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.theme .moon { display: none; }
:root[data-theme="dark"] .theme .moon { display: block; }
:root[data-theme="dark"] .theme .sun { display: none; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .theme .moon { display: block; }
  :root:not([data-theme="light"]) .theme .sun { display: none; }
}

/* Home */
.intro { padding: clamp(40px, 8vw, 96px) 0 clamp(32px, 5vw, 56px); }
.intro h1 { max-width: 15ch; margin: 0; font-size: clamp(44px, 7vw, 88px); letter-spacing: -0.05em; line-height: 0.98; }
.dek { max-width: 46ch; margin: 18px 0 0; color: var(--muted); font-size: clamp(18px, 1.8vw, 21px); }
.feature-link { display: grid; gap: 24px; align-items: center; padding: clamp(16px, 2.4vw, 24px); border: 1px solid var(--line); border-radius: 28px; background: var(--tint); text-decoration: none; transition: border-color 0.3s, transform 0.3s var(--ease); }
.feature-link:hover { border-color: var(--accent); transform: translateY(-3px); }
@media (min-width: 860px) { .feature-link { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); } }
.feature-art { border-radius: 20px; background: var(--paper); }
.feature-text h2 { margin: 10px 0 10px; font-size: clamp(30px, 3.6vw, 44px); }
.feature-text p:not(.meta) { margin: 0; color: var(--muted); }
.read { display: inline-flex; gap: 6px; margin-top: 18px; font-family: var(--sans); font-weight: 650; color: var(--accent); }
.read span { transition: transform 0.2s var(--ease); }
.feature-link:hover .read span { transform: translateX(4px); }

/* The drawings draw themselves, once. */
.drawing { display: block; width: 100%; height: auto; }
.drawing path, .drawing circle { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.drawing .ink { stroke: var(--ink); stroke-width: 3; animation: draw 1.6s var(--ease) both; }
.drawing .ink:nth-child(2) { animation-delay: 0.3s; }
.drawing .ink:nth-child(3) { animation-delay: 0.6s; }
.drawing .accent { stroke: var(--accent); stroke-width: 4; animation: draw 1.2s var(--ease) 1s both; }
.drawing .accent:nth-of-type(5) { animation-delay: 1.9s; }
.drawing .sketch { stroke: var(--muted); stroke-width: 2; stroke-dasharray: 3 7; opacity: 0.8; }
.drawing .ink, .drawing .accent, .figure .bar-a, .figure .bar-learn, .figure .bar-b { stroke-dasharray: 1; }
@keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }

.drafts { margin-top: clamp(56px, 8vw, 96px); }
.drafts h2, .subscribe h2, .about h2 { margin: 0 0 18px; font-size: clamp(26px, 3vw, 34px); }
.drafts ol { display: grid; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
.drafts li { display: grid; gap: 2px; padding: 18px 0; border-bottom: 1px solid var(--line); }
.drafts strong { font-family: var(--sans); font-size: 21px; letter-spacing: -0.02em; }
.drafts li > span:last-child { color: var(--muted); }
.subscribe { margin-top: clamp(56px, 8vw, 96px); padding: clamp(24px, 4vw, 40px); border-radius: 28px; background: var(--ink); color: var(--paper); }
.subscribe p { max-width: 44ch; margin: 0; opacity: 0.85; }
.signup { display: flex; flex-wrap: wrap; gap: 10px; max-width: 520px; margin-top: 22px; }
.signup input { flex: 1 1 220px; min-height: 52px; padding: 0 16px; border: 0; border-radius: 12px; background: var(--paper); color: var(--ink); font: 16px var(--sans); }
.signup input:focus { outline: 3px solid var(--accent); outline-offset: 2px; }
.subscribe .signup-msg { margin-top: 12px; font: 14px var(--sans); }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 24px; border: 0; border-radius: 999px; background: var(--accent); color: #ffffff; font: 650 16px var(--sans); text-decoration: none; cursor: pointer; transition: transform 0.2s var(--ease), filter 0.2s; }
:root[data-theme="dark"] .button { color: #141619; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .button { color: #141619; } }
.button:hover { transform: translateY(-2px); filter: brightness(1.05); }
.button:active { transform: translateY(1px); }
.about { margin: clamp(56px, 8vw, 96px) 0; }
.about p { max-width: 60ch; margin: 0; }

/* The essay */
.progress { position: fixed; inset: 0 0 auto 0; z-index: 30; height: 3px; background: var(--accent); transform-origin: left; transform: scaleX(0); }
@supports (animation-timeline: scroll()) {
  .progress { animation: progress linear both; animation-timeline: scroll(root); }
}
@keyframes progress { to { transform: scaleX(1); } }
.post { max-width: 720px; margin: 0 auto; }
.post-head { padding: clamp(24px, 5vw, 56px) 0 28px; }
.back { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; margin-bottom: 18px; font: 15px var(--sans); text-decoration: none; }
.back:hover { color: var(--accent); }
.post-head h1 { margin: 10px 0 0; font-size: clamp(40px, 6vw, 68px); letter-spacing: -0.045em; }
.post-art { margin: 0 -2vw 36px; padding: 12px; border-radius: 28px; background: var(--tint); }
.prose { font-size: 20px; line-height: 1.75; }
.prose p, .prose ol { margin: 0 0 1.1em; }
.prose h2 { margin: 1.8em 0 0.6em; font-size: 28px; }
.prose ol { padding-left: 1.3em; }
.prose li { margin-bottom: 0.5em; }
.lede::first-letter { float: left; margin: 0.06em 0.1em 0 0; font: 800 4.1em/0.8 var(--sans); color: var(--accent); }
.pull { margin: 1.6em 0; padding: 0 0 0 24px; border-left: 4px solid var(--accent); }
.pull p { margin: 0; font: 650 clamp(24px, 3vw, 30px)/1.25 var(--sans); letter-spacing: -0.02em; }
sup a { color: var(--accent); font-family: var(--sans); font-weight: 700; text-decoration: none; padding: 0 2px; }
.figure { margin: 2em 0; padding: 20px; border: 1px solid var(--line); border-radius: 20px; }
.figure svg { display: block; width: 100%; height: auto; overflow: visible; }
.figure text { fill: var(--muted); font: 13px var(--sans); }
.figure .label { fill: var(--ink); font-weight: 700; font-size: 15px; }
.figure .note { font-size: 12px; }
.figure .axis path { stroke: var(--line); stroke-width: 2; }
.figure .bar-a { stroke: var(--accent); stroke-width: 18; stroke-linecap: round; animation: draw 0.8s var(--ease) both; }
.figure .bar-learn { stroke: var(--accent); stroke-width: 18; stroke-linecap: round; opacity: 0.35; animation: draw 1.4s var(--ease) 0.6s both; }
.figure .bar-b { stroke: var(--muted); stroke-width: 18; stroke-linecap: round; stroke-dasharray: 1; animation: draw 2.2s var(--ease) 0.3s both; }
.figure figcaption { margin-top: 12px; color: var(--muted); font: 14px var(--sans); }
.figure.wait path { animation-play-state: paused; }
.footnotes { margin-top: 2.4em; padding-top: 1em; border-top: 1px solid var(--line); color: var(--muted); font-size: 16px; }
.footnotes a { color: var(--accent); text-decoration: none; }
.post-end { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin: 48px 0 clamp(56px, 8vw, 96px); padding: 24px; border-radius: 20px; background: var(--tint); font-family: var(--sans); }
.post-end p { margin: 0; }

.foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; max-width: 1040px; margin: 0 auto; padding: 24px var(--gutter); border-top: 1px solid var(--line); color: var(--muted); font: 14px var(--sans); }
.foot p { margin: 0; }
.foot a { display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0; }

.js .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.7s var(--ease), transform 0.7s var(--ease); }
.js .reveal.in { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .reveal { opacity: 1; transform: none; }
  .progress { display: none; }
}
`;

const SCRIPT = `// Field Notes: the theme switch, the figure's drawing and scroll reveals.
// The pages are complete without this file.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  var canObserve = "IntersectionObserver" in window;

  // Light or dark. The choice is remembered when the browser allows it.
  var button = document.getElementById("theme");
  function current() { return root.dataset.theme || (prefersDark.matches ? "dark" : "light"); }
  function label() { if (button) button.setAttribute("aria-label", current() === "dark" ? "Switch to the light theme" : "Switch to the dark theme"); }
  label();
  if (button) {
    button.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("field-notes-theme", next); } catch (e) {}
      label();
    });
  }
  if (prefersDark.addEventListener) prefersDark.addEventListener("change", label);

  // Sections rise in once; the figure draws when it's reached.
  var reveals = document.querySelectorAll(".reveal");
  var figure = document.querySelector(".figure");
  if (canObserve && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          entry.target.classList.remove("wait");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
    if (figure) { figure.classList.add("wait"); io.observe(figure); }
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // The newsletter form is a sample: it says plainly that nothing was sent.
  var signup = document.getElementById("signup");
  var msg = document.getElementById("signup-msg");
  if (signup && msg) {
    signup.addEventListener("submit", function (e) {
      e.preventDefault();
      msg.textContent = "Thanks. This is a sample form, so nothing was sent yet.";
      signup.reset();
    });
  }
})();
`;

const DESIGN = `# Field Notes: design

Design read: a personal essay blog by someone who builds software and furniture, for readers who like short, practical writing. Quiet and editorial, made for reading.

## Palette (CSS variables in styles.css, with a dark theme)

- \`--paper\` #fbfbf9 (dark #141619): the page
- \`--ink\` #1f2328 (dark #ebe9e4): text and drawings
- \`--accent\` #b4361f (dark #f08a6b): the one accent, a brick red, for links, the drop cap and the drawings' arrows
- \`--tint\` #f1f2ee (dark #1c1f23): soft panels
- \`--muted\` #59606a (dark #a3a7ae) and \`--line\` #e4e5e1 (dark #2a2d31): secondary text and rules

## Type

- Reading: a serif text face (Charter, Sitka Text, Iowan Old Style), 20px at 1.75 in essays, because long reading is the point of the site.
- Headings and interface: the system sans at weight 750 with tight tracking.
- Dates and reading time: the system monospace at 13px.

## Layout

A large headline, one featured essay with its drawing, the drafts on the desk (named but not linked until they exist), a dark subscribe panel and a short About. Essays run at about 65 characters a line, with a drop cap, a pull quote, a figure and footnotes.

## Signature

Line drawings that draw themselves, in ink with a brick-red arrow: the essay's idea as a sketch. And a thin reading-progress line along the top of an essay.

## Motion

Drawings draw once on load; the figure draws when it's reached. The progress line follows the scroll through CSS scroll-driven animation where the browser supports it. Sections rise in once. Everything stops under prefers-reduced-motion, and the pages are complete without JavaScript.

## Shape

Pills for buttons, 12px inputs, 20px figures and art, 28px panels.

## When this becomes someone else's blog

Update this file first. Draw a new sketch for each essay (simple paths with pathLength="1" draw themselves), keep the reading size, and keep one accent.
`;

const README = `# Field Notes blog (template)

A small blog built to the Farbaek Studio standard: a home page with a featured essay and its drawing, drafts in progress, a newsletter form and an About, plus an essay page with a drop cap, a pull quote, a figure, footnotes and a reading-progress line. Light and dark themes.

- \`DESIGN.md\`: the design decisions. Change it first when the blog becomes yours.
- \`script.js\`: the theme switch, the figure's drawing, the sample form and scroll reveals. The pages work without it.

The writer, essays, dates and bio are sample content. Ask the agent to make it yours, for example: "Make this my cooking blog called Kitchen Table, with three recipe posts".

The newsletter form doesn't send anything yet. Connecting it to an email list is a separate change.
`;

export const BLOG_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "post.html", content: POST },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];
