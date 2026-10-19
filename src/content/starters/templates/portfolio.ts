/**
 * Template: a designer's portfolio, built to the Studio standard (ADR 0030).
 * A name that builds itself letter by letter, case-study covers drawn as
 * art-directed SVG (no stock photos, no fetching), cards that tilt toward
 * the pointer, and an email you can copy. Sample content; previews
 * instantly and is complete without JavaScript.
 */
import type { StarterFile } from "../types";

const NAME = "Jordan Lee";
const letters = [...NAME]
  .map((ch, i) => (ch === " " ? `<span class="space"> </span>` : `<span class="ch" style="--i: ${i}">${ch}</span>`))
  .join("");

// Case-study covers: drawn, not photographed, so they're sharp at any size and need nothing fetched.
const COVERS = {
  kanto: `<svg viewBox="0 0 400 300" role="img" aria-label="Sample cover: a budgeting app screen with spending rings">
          <rect width="400" height="300" fill="#2b3dff" />
          <circle cx="330" cy="40" r="120" fill="#4656ff" />
          <rect x="140" y="34" width="124" height="250" rx="22" fill="#ffffff" />
          <rect x="156" y="56" width="52" height="8" rx="4" fill="#0e0f12" />
          <circle cx="202" cy="124" r="38" fill="none" stroke="#e3e6ff" stroke-width="12" />
          <circle class="ring" cx="202" cy="124" r="38" fill="none" stroke="#2b3dff" stroke-width="12" stroke-linecap="round" stroke-dasharray="239" stroke-dashoffset="70" transform="rotate(-90 202 124)" />
          <rect x="156" y="182" width="92" height="12" rx="6" fill="#e3e6ff" />
          <rect x="156" y="182" width="58" height="12" rx="6" fill="#0e0f12" />
          <rect x="156" y="204" width="92" height="12" rx="6" fill="#e3e6ff" />
          <rect x="156" y="204" width="76" height="12" rx="6" fill="#2b3dff" />
          <rect x="156" y="226" width="92" height="12" rx="6" fill="#e3e6ff" />
          <rect x="156" y="226" width="34" height="12" rx="6" fill="#0e0f12" />
        </svg>`,
  relay: `<svg viewBox="0 0 400 300" role="img" aria-label="Sample cover: a dispatch console with courier routes on a map">
          <rect width="400" height="300" fill="#0e0f12" />
          <g stroke="#23252c" stroke-width="1">
            <path d="M0 60H400M0 120H400M0 180H400M0 240H400M60 0V300M140 0V300M220 0V300M300 0V300" />
          </g>
          <path class="route" d="M40 250C90 230 80 160 140 150S230 190 260 120S330 60 370 50" fill="none" stroke="#2b3dff" stroke-width="5" stroke-linecap="round" stroke-dasharray="12 10" />
          <circle cx="40" cy="250" r="9" fill="#ffffff" />
          <circle cx="140" cy="150" r="7" fill="#2b3dff" />
          <circle cx="260" cy="120" r="7" fill="#2b3dff" />
          <circle cx="370" cy="50" r="12" fill="#ffffff" />
          <rect x="226" y="196" width="150" height="80" rx="14" fill="#1a1c22" stroke="#2c2f37" />
          <rect x="242" y="214" width="70" height="8" rx="4" fill="#ffffff" />
          <rect x="242" y="232" width="118" height="6" rx="3" fill="#3a3d46" />
          <rect x="242" y="248" width="90" height="6" rx="3" fill="#3a3d46" />
        </svg>`,
  notes: `<svg viewBox="0 0 400 300" role="img" aria-label="Sample cover: research notes tagged and grouped">
          <rect width="400" height="300" fill="#e6e8ee" />
          <g transform="rotate(-8 140 150)">
            <rect x="70" y="80" width="150" height="150" rx="16" fill="#ffffff" />
            <rect x="88" y="100" width="90" height="10" rx="5" fill="#0e0f12" />
            <rect x="88" y="122" width="114" height="6" rx="3" fill="#c9ccd5" />
            <rect x="88" y="136" width="100" height="6" rx="3" fill="#c9ccd5" />
            <rect x="88" y="196" width="54" height="18" rx="9" fill="#e3e6ff" />
          </g>
          <g transform="rotate(6 270 140)">
            <rect x="196" y="60" width="150" height="150" rx="16" fill="#ffffff" />
            <rect x="214" y="80" width="70" height="10" rx="5" fill="#0e0f12" />
            <rect x="214" y="102" width="114" height="6" rx="3" fill="#c9ccd5" />
            <rect x="214" y="116" width="84" height="6" rx="3" fill="#c9ccd5" />
            <rect x="214" y="176" width="64" height="18" rx="9" fill="#2b3dff" />
          </g>
          <circle cx="320" cy="240" r="26" fill="#0e0f12" />
          <path d="M309 240l8 8 14-16" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>`,
  ridge: `<svg viewBox="0 0 400 300" role="img" aria-label="Sample cover: parts of a design system, buttons, a switch and type">
          <rect width="400" height="300" fill="#e3e6ff" />
          <text x="36" y="150" font-family="system-ui, sans-serif" font-size="112" font-weight="900" letter-spacing="-6" fill="#0e0f12">Aa</text>
          <rect x="36" y="190" width="132" height="40" rx="20" fill="#2b3dff" />
          <rect x="60" y="206" width="84" height="8" rx="4" fill="#ffffff" />
          <rect x="180" y="190" width="112" height="40" rx="20" fill="none" stroke="#0e0f12" stroke-width="2" />
          <rect x="204" y="206" width="64" height="8" rx="4" fill="#0e0f12" />
          <rect x="250" y="70" width="72" height="40" rx="20" fill="#2b3dff" />
          <circle cx="302" cy="90" r="14" fill="#ffffff" />
          <g fill="#0e0f12"><rect x="250" y="130" width="22" height="22" rx="6" /><rect x="280" y="130" width="22" height="22" rx="6" fill="#2b3dff" /><rect x="310" y="130" width="22" height="22" rx="6" fill="#ffffff" /><rect x="340" y="130" width="22" height="22" rx="6" fill="#9aa2ff" /></g>
        </svg>`,
};

const PROJECTS = [
  { key: "kanto", title: "Kanto", what: "Shared budgets for people who live together", outcome: "Made splitting bills a two-tap job, so housemates stopped keeping spreadsheets.", year: "2026", role: "Lead designer", size: "wide" },
  { key: "relay", title: "Relay", what: "A dispatch console for courier teams", outcome: "One screen for every route, so dispatchers spot a late van before the customer does.", year: "2025", role: "Product designer", size: "narrow" },
  { key: "notes", title: "Field Notes", what: "A home for a team's research", outcome: "Interviews, tagged and searchable, so the same question never gets asked twice.", year: "2024", role: "Designer and researcher", size: "narrow" },
  { key: "ridge", title: "Ridge", what: "The design system for a regional bank", outcome: "Forty components and the rules for using them, shared by six product teams.", year: "2023", role: "Design systems lead", size: "wide" },
] as const;

const cards = PROJECTS.map(
  (p) => `      <article class="work ${p.size} reveal">
        <a class="work-link" href="#contact" aria-label="${p.title}: ${p.what}. Ask about this case study">
          <div class="cover">
        ${COVERS[p.key]}
          </div>
          <div class="work-text">
            <h3>${p.title} <span>${p.what}</span></h3>
            <p>${p.outcome}</p>
            <p class="meta mono"><span>${p.year}</span><span>${p.role}</span><span>Sample project</span></p>
          </div>
        </a>
      </article>`,
).join("\n");

const SKILLS = ["Product design", "Design systems", "Prototyping", "User research", "Interaction and motion", "Workshops"];
const marquee = [...SKILLS, ...SKILLS].map((s, i) => `<li${i >= SKILLS.length ? ' aria-hidden="true"' : ""}>${s}</li>`).join("");

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jordan Lee, product designer</title>
    <meta name="description" content="Jordan Lee designs calm tools for complicated work: budgeting, logistics and research. A sample portfolio." />
    <meta name="theme-color" content="#f4f5f7" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="bar">
      <a class="mono-mark" href="#top" aria-label="Jordan Lee, back to top">JL</a>
      <nav class="nav" aria-label="Main">
        <a href="#work">Work</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
      </nav>
      <p class="status"><span class="pulse" aria-hidden="true"></span>Open to work from June</p>
    </header>

    <main id="main">
      <section class="hero" id="top">
        <h1 class="name" aria-label="${NAME}"><span aria-hidden="true">${letters}</span></h1>
        <div class="intro">
          <p class="statement">Product designer making complicated tools feel calm.</p>
          <ul class="facts mono">
            <li><span>Now</span> Design lead at a sample studio</li>
            <li><span>Before</span> Six years in fintech and logistics</li>
            <li><span>Based</span> Colombo, working worldwide</li>
          </ul>
        </div>
        <a class="scroll-cue" href="#work">See selected work <span aria-hidden="true">&darr;</span></a>
      </section>

      <div class="band" aria-label="What I do">
        <ul class="marquee mono">${marquee}</ul>
      </div>

      <section class="works" id="work" aria-labelledby="work-title">
        <div class="works-head">
          <h2 id="work-title" class="reveal">Selected work</h2>
          <p class="mono reveal">2023 to 2026. Sample projects.</p>
        </div>
        <div class="grid">
${cards}
        </div>
      </section>

      <section class="about" id="about" aria-labelledby="about-title">
        <h2 id="about-title" class="reveal">About</h2>
        <div class="about-body reveal">
          <p class="lede">I design tools for people whose work is already hard enough: dispatchers, accountants, researchers. My job is to take the mess out of the screen, not out of the work.</p>
          <p>I start with the people who'll use it, prototype early, and stay through launch so the details survive. I like design systems, honest empty states and buttons that say what they do.</p>
        </div>
        <ol class="timeline mono reveal">
          <li><span>2024 to now</span> Design lead, sample studio</li>
          <li><span>2021 to 2024</span> Senior product designer, sample logistics company</li>
          <li><span>2019 to 2021</span> Product designer, sample bank</li>
        </ol>
      </section>

      <section class="contact" id="contact" aria-labelledby="contact-title">
        <h2 id="contact-title" class="reveal">Have something complicated? Let's make it calm.</h2>
        <div class="contact-row reveal">
          <a class="email" href="mailto:hello@jordanlee.example">hello@jordanlee.example</a>
          <button class="copy" type="button" id="copy" data-email="hello@jordanlee.example">Copy email</button>
        </div>
        <p class="copy-msg" id="copy-msg" role="status">A sample address. Replace it with yours.</p>
      </section>
    </main>

    <footer class="foot mono">
      <p>&copy; <span id="year">2026</span> Jordan Lee. A sample portfolio.</p>
      <a href="#top">Back to top</a>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `/* Jordan Lee. The design decisions behind these tokens are in DESIGN.md. */
:root {
  --bg: #f4f5f7;
  --ink: #0e0f12;
  --cobalt: #2b3dff;
  --cobalt-soft: #e3e6ff;
  --muted: #5b606b;
  --line: #dadde3;
  --display: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(16px, 4vw, 56px);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 var(--display); -webkit-font-smoothing: antialiased; overflow-x: hidden; }
a { color: inherit; }
.mono { font-family: var(--mono); font-size: 13px; letter-spacing: 0; }
:focus-visible { outline: 3px solid var(--cobalt); outline-offset: 3px; border-radius: 6px; }
.skip { position: absolute; left: 16px; top: -60px; z-index: 20; padding: 10px 16px; border-radius: 999px; background: var(--ink); color: #fff; }
.skip:focus { top: 12px; }
h2 { margin: 0; font-size: clamp(36px, 6vw, 80px); font-weight: 900; line-height: 0.95; letter-spacing: -0.05em; }

.bar { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 10px var(--gutter); background: rgba(244, 245, 247, 0.85); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.mono-mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--ink); color: #fff; font-weight: 900; font-size: 15px; letter-spacing: -0.04em; text-decoration: none; transition: background-color 0.2s; }
.mono-mark:hover { background: var(--cobalt); }
.nav { display: flex; justify-content: center; gap: 2px; }
.nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 999px; font-size: 15px; text-decoration: none; }
.nav a:hover { background: rgba(14, 15, 18, 0.06); }
.status { display: none; align-items: center; gap: 8px; margin: 0; font-size: 14px; color: var(--muted); }
.pulse { width: 9px; height: 9px; border-radius: 50%; background: var(--cobalt); box-shadow: 0 0 0 0 rgba(43, 61, 255, 0.5); animation: pulse 2.2s var(--ease) infinite; }
@keyframes pulse { 70%, 100% { box-shadow: 0 0 0 10px rgba(43, 61, 255, 0); } }
@media (min-width: 720px) { .status { display: inline-flex; } .bar { grid-template-columns: 1fr auto 1fr; } .status { justify-self: end; } }

/* Hero: the name builds itself. */
.hero { display: grid; align-content: end; gap: clamp(28px, 4vw, 48px); min-height: calc(100dvh - 64px); padding: clamp(24px, 5vw, 64px) var(--gutter) clamp(28px, 4vw, 48px); }
.name { margin: 0; font-size: clamp(76px, 17.5vw, 290px); font-weight: 900; line-height: 0.82; letter-spacing: -0.065em; }
.name > span { display: block; }
.ch { display: inline-block; animation: rise 1s var(--ease) both; animation-delay: calc(var(--i) * 55ms); }
.ch:nth-child(8) { color: var(--cobalt); }
.space { display: inline-block; width: 0.22em; }
@keyframes rise { from { opacity: 0; transform: translateY(0.5em) rotate(4deg); } }
.intro { display: grid; gap: 24px; }
@media (min-width: 900px) { .intro { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: end; } }
.statement { max-width: 22ch; margin: 0; font-size: clamp(26px, 3.2vw, 40px); font-weight: 600; line-height: 1.12; letter-spacing: -0.03em; animation: fade 0.9s var(--ease) 0.6s both; }
.facts { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; animation: fade 0.9s var(--ease) 0.75s both; }
.facts li { display: grid; grid-template-columns: 64px 1fr; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line); }
.facts span { color: var(--muted); }
@keyframes fade { from { opacity: 0; transform: translateY(10px); } }
.scroll-cue { justify-self: start; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-weight: 600; text-underline-offset: 5px; }
.scroll-cue span { display: inline-block; animation: nudge 2s var(--ease) infinite; }
@keyframes nudge { 50% { transform: translateY(4px); } }

/* A moving band of what I do. */
.band { overflow: hidden; padding: 18px 0; background: var(--ink); color: #fff; }
.marquee { display: flex; gap: 48px; width: max-content; margin: 0; padding: 0; list-style: none; font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; animation: slide 36s linear infinite; }
.marquee li { display: inline-flex; align-items: center; gap: 48px; white-space: nowrap; }
.marquee li::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--cobalt); }
@keyframes slide { to { transform: translateX(-50%); } }
.band.off .marquee, .hero.off .pulse { animation-play-state: paused; }

/* Work */
.works { padding: clamp(64px, 9vw, 120px) var(--gutter); }
.works-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; }
.works-head p { margin: 0; color: var(--muted); }
.grid { display: grid; gap: clamp(28px, 4vw, 48px) 24px; margin-top: 48px; }
@media (min-width: 900px) {
  .grid { grid-template-columns: repeat(12, minmax(0, 1fr)); }
  .work.wide { grid-column: span 7; }
  .work.narrow { grid-column: span 5; }
  .work:nth-child(2) { margin-top: 96px; }
  .work:nth-child(3) { margin-top: -16px; }
}
.work { --rx: 0deg; --ry: 0deg; perspective: 1200px; }
.work-link { display: grid; gap: 18px; text-decoration: none; }
.cover { overflow: hidden; border-radius: 20px; aspect-ratio: 4 / 3; background: var(--cobalt-soft); box-shadow: 0 30px 60px -40px rgba(14, 15, 18, 0.5); transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform 0.5s var(--ease), box-shadow 0.4s var(--ease); }
.cover svg { display: block; width: 100%; height: 100%; transition: transform 0.7s var(--ease); }
.work-link:hover .cover { box-shadow: 0 50px 80px -40px rgba(14, 15, 18, 0.55); }
.work-link:hover .cover svg { transform: scale(1.04); }
.ring { animation: ring 2.4s var(--ease) both 0.4s; }
@keyframes ring { from { stroke-dashoffset: 239; } }
.route { animation: dash 3s linear infinite; }
@keyframes dash { to { stroke-dashoffset: -44; } }
.work-text h3 { margin: 0; font-size: clamp(22px, 2.2vw, 30px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; }
.work-text h3 span { display: block; color: var(--muted); font-weight: 500; font-size: 0.7em; letter-spacing: -0.01em; }
.work-text p { max-width: 48ch; margin: 8px 0 0; color: var(--muted); }
.meta { display: flex; flex-wrap: wrap; gap: 6px 16px; }
.meta span + span::before { content: "/"; margin-right: 16px; color: var(--line); }
.work-link:hover h3 { color: var(--cobalt); }

/* About */
.about { display: grid; gap: 32px; padding: clamp(64px, 9vw, 120px) var(--gutter); border-top: 1px solid var(--line); }
@media (min-width: 900px) { .about { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); } .timeline { grid-column: 2; } }
.lede { max-width: 30ch; margin: 0 0 18px; font-size: clamp(22px, 2.4vw, 30px); font-weight: 600; line-height: 1.25; letter-spacing: -0.02em; }
.about-body p:not(.lede) { max-width: 58ch; margin: 0; color: var(--muted); }
.timeline { display: grid; margin: 0; padding: 0; list-style: none; }
.timeline li { display: grid; grid-template-columns: minmax(110px, 0.4fr) 1fr; gap: 16px; padding: 14px 0; border-top: 1px solid var(--line); font-size: 14px; }
.timeline span { color: var(--muted); }

/* Contact */
.contact { padding: clamp(72px, 10vw, 140px) var(--gutter); background: var(--cobalt); color: #fff; }
.contact h2 { max-width: 16ch; }
.contact-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; margin-top: 40px; }
.email { display: inline-flex; align-items: center; min-height: 44px; font-size: clamp(22px, 3.6vw, 44px); font-weight: 700; letter-spacing: -0.03em; text-underline-offset: 8px; text-decoration-thickness: 2px; overflow-wrap: anywhere; }
.copy { min-height: 48px; padding: 0 22px; border: 1.5px solid #fff; border-radius: 999px; background: transparent; color: #fff; font: 600 15px var(--display); cursor: pointer; transition: background-color 0.2s, color 0.2s, transform 0.15s; }
.copy:hover { background: #fff; color: var(--cobalt); }
.copy:active { transform: scale(0.97); }
.contact :focus-visible { outline-color: #fff; }
.copy-msg { margin: 16px 0 0; color: #dfe3ff; font-size: 14px; }

.foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 22px var(--gutter); color: var(--muted); }
.foot p { margin: 0; }
.foot a { display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0; }

.js .reveal { opacity: 0; transform: translateY(26px); transition: opacity 0.8s var(--ease), transform 0.8s var(--ease); }
.js .reveal.in { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .reveal { opacity: 1; transform: none; }
  .marquee { flex-wrap: wrap; width: auto; gap: 12px 32px; }
  .marquee li[aria-hidden="true"] { display: none; }
}
`;

const SCRIPT = `// Jordan Lee: small enhancements. The page is complete without this file.
(function () {
  document.documentElement.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  var canObserve = "IntersectionObserver" in window;

  // Work and sections rise in once as they scroll into view.
  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // Looping motion rests while it's off screen.
  if (canObserve) {
    document.querySelectorAll(".band, .hero").forEach(function (el) {
      new IntersectionObserver(function (entries) { el.classList.toggle("off", !entries[0].isIntersecting); }).observe(el);
    });
  }

  // Covers tilt toward the pointer.
  if (finePointer && !reduce) {
    document.querySelectorAll(".work").forEach(function (card) {
      var cover = card.querySelector(".cover");
      card.addEventListener("pointermove", function (e) {
        var r = cover.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--ry", (x * 8).toFixed(2) + "deg");
        card.style.setProperty("--rx", (y * -8).toFixed(2) + "deg");
      });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--ry", "0deg");
        card.style.setProperty("--rx", "0deg");
      });
    });
  }

  // Copy the email address, and say what happened.
  var copy = document.getElementById("copy");
  var msg = document.getElementById("copy-msg");
  if (copy && msg) {
    copy.addEventListener("click", function () {
      var email = copy.dataset.email;
      var done = function () { copy.textContent = "Copied"; msg.textContent = "Copied " + email + ". It's a sample address, so replace it with yours."; setTimeout(function () { copy.textContent = "Copy email"; }, 2400); };
      var fail = function () { msg.textContent = "Couldn't copy here. The address is " + email + "."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(email).then(done, fail);
      else fail();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Jordan Lee: design

Design read: a product designer's portfolio for hiring managers and founders. Confident and quiet, with type as the main event.

## Palette (CSS variables in styles.css)

- \`--bg\` #f4f5f7: the page, a cool off-white
- \`--ink\` #0e0f12: type, the moving band
- \`--cobalt\` #2b3dff: the one accent, for one letter of the name, the status, hovers and the contact band
- \`--cobalt-soft\` #e3e6ff: soft fills in covers
- \`--muted\` #5b606b and \`--line\` #dadde3: secondary text and rules

## Type

- Display: the system sans at weight 900 (Segoe UI Black, SF Pro Black), tracking -0.065em on the name and -0.05em on headings.
- Body: the same family at 17px.
- Labels and data: the system monospace at 13px.

## Layout

The name fills the first screen, with one statement and three facts under it. A moving band of disciplines, then an offset 12-column grid of case studies (wide, narrow, narrow, wide), a two-column About with a timeline, and a cobalt contact band.

## Signature

The name builds itself letter by letter, with one cobalt letter. Case-study covers are drawn as SVG art, so they stay sharp and load nothing, and they tilt toward the pointer.

## Motion

Letters rise in on load; the statement and facts fade in after. The band slides, the route on the Relay cover flows and the Kanto ring fills. Work rises in on scroll. Looping motion pauses off screen, and everything stops under prefers-reduced-motion. The page is complete without JavaScript.

## Shape

Pills for buttons and navigation, 20px covers.

## When this becomes someone else's portfolio

Update this file first. Replace the drawn covers with real project images when you have them (keep the 4:3 frame), and keep one accent.
`;

const README = `# Jordan Lee portfolio (template)

A one-page portfolio built to the Farbaek Studio standard: a name that builds itself, a moving band of skills, four case studies with drawn covers that tilt, an About with a timeline and a contact band with a copyable email.

- \`DESIGN.md\`: the design decisions. Change it first when the portfolio becomes yours.
- \`script.js\`: scroll reveals, cover tilt and copying the email. The page works without it.

The name, projects, history and email are sample content. Ask the agent to make it yours, for example: "Make this my photography portfolio with five projects, a short bio and my email".

The case-study links go to the contact section until each project has its own page.
`;

export const PORTFOLIO_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];
