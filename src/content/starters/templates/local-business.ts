/**
 * Template: a local business site (a café), built to the Studio standard
 * (ADR 0030). An illustrated hero with rising steam and drifting water, a
 * live "open now" status worked out from the opening hours, a menu you can
 * filter, and a drawn map. Sample content; previews instantly and is
 * complete without JavaScript.
 */
import type { StarterFile } from "../types";

type Kind = "coffee" | "breakfast" | "bakes";
const MENU: { kind: Kind; name: string; desc: string; price: string }[] = [
  { kind: "coffee", name: "Flat white", desc: "Double ristretto, silky milk.", price: "4.20" },
  { kind: "coffee", name: "Harbour cold brew", desc: "Steeped for 18 hours, served over ice.", price: "4.80" },
  { kind: "coffee", name: "Cardamom latte", desc: "Our house blend with ground cardamom.", price: "4.90" },
  { kind: "breakfast", name: "Eggs on sourdough", desc: "Two eggs your way, herbed butter.", price: "9.50" },
  { kind: "breakfast", name: "Fisherman's breakfast", desc: "Smoked fish, crushed potatoes, a soft egg.", price: "13.00" },
  { kind: "breakfast", name: "Coconut granola bowl", desc: "Toasted oats, yoghurt, fruit from the market.", price: "8.00" },
  { kind: "bakes", name: "Butter croissant", desc: "Laminated over three days.", price: "3.40" },
  { kind: "bakes", name: "Cinnamon knot", desc: "Brown sugar, cinnamon, a little salt.", price: "3.80" },
  { kind: "bakes", name: "Lemon poppy seed loaf", desc: "A thick slice, lemon glaze.", price: "3.60" },
];

const ICONS: Record<Kind, string> = {
  coffee: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 15h19v7a9.5 9.5 0 0 1-19 0z" /><path d="M28 17h2.5a3.5 3.5 0 0 1 0 7H28" /><path d="M6 33h26" /><path class="wisp" d="M15 10c-1.5-2 1.5-3 0-5M21 10c-1.5-2 1.5-3 0-5" /></svg>`,
  breakfast: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="21" r="14" /><path d="M13 19c0-4 4-6 7-5s5-1 7 2 0 7-3 8-5 2-8 0-3-2-3-5z" /><circle cx="20" cy="20" r="3.2" class="fill" /></svg>`,
  bakes: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 27c3-10 27-10 30 0-5-3-10-4-15-4S10 24 5 27z" /><path d="M14 19.5l2 7M20 18.5v8M26 19.5l-2 7" /></svg>`,
};

const menuItems = MENU.map(
  (m) => `            <li class="dish" data-kind="${m.kind}">
              <span class="dish-icon">${ICONS[m.kind]}</span>
              <span class="dish-text"><strong>${m.name}</strong><small>${m.desc}</small></span>
              <span class="dish-price">${m.price}</span>
            </li>`,
).join("\n");

// Opening hours, Monday first. The status pill and the highlighted row are worked out from these.
const HOURS = [
  ["Monday", "7:00", "18:00"],
  ["Tuesday", "7:00", "18:00"],
  ["Wednesday", "7:00", "18:00"],
  ["Thursday", "7:00", "18:00"],
  ["Friday", "7:00", "20:00"],
  ["Saturday", "7:30", "20:00"],
  ["Sunday", "7:30", "17:00"],
] as const;
const pretty = (t: string) => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `.${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
};
const hoursRows = HOURS.map(
  ([day, open, close], i) => `              <tr data-day="${(i + 1) % 7}" data-open="${open}" data-close="${close}"><th scope="row">${day}</th><td>${pretty(open)} to ${pretty(close)}</td></tr>`,
).join("\n");

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Harbor Café, coffee and breakfast by the water</title>
    <meta name="description" content="Harbor Café on Pier 4: strong coffee, slow breakfasts and pastries baked before sunrise. A sample local business site." />
    <meta name="theme-color" content="#f4f7f6" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="bar">
      <a class="brand" href="#top">
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#12304a" /><path d="M9 14h11v4a5.5 5.5 0 0 1-11 0z" fill="#f4f7f6" /><path d="M20 15h1.5a2 2 0 0 1 0 4H20" fill="none" stroke="#f4f7f6" stroke-width="1.6" /><path d="M7 24c3-2 6-2 9 0s6 2 9 0" fill="none" stroke="#c8352b" stroke-width="2" stroke-linecap="round" /></svg>
        Harbor Café
      </a>
      <nav class="nav" aria-label="Main">
        <a href="#menu">Menu</a>
        <a href="#visit">Visit</a>
      </nav>
    </header>

    <main id="main">
      <section class="hero" id="top">
        <div class="hero-copy">
          <p class="status" id="status"><span class="beacon" aria-hidden="true"></span><span id="status-text">Open every day from 7 am</span></p>
          <h1>Breakfast by the water.</h1>
          <p class="lead">Strong coffee, slow breakfasts and pastries baked before sunrise, a few steps from the boats.</p>
          <div class="actions">
            <a class="button" href="#menu">See the menu</a>
            <a class="link" href="#visit">Find us on Pier 4 <span aria-hidden="true">&rarr;</span></a>
          </div>
          <p class="note">Harbor Café is a sample business. The menu, prices and address are sample content.</p>
        </div>

        <div class="scene" aria-hidden="true">
          <svg viewBox="0 0 520 520">
            <defs><clipPath id="disc"><circle cx="260" cy="260" r="236" /></clipPath></defs>
            <circle cx="260" cy="260" r="236" fill="#dcebea" />
            <g clip-path="url(#disc)">
              <circle class="sun" cx="370" cy="190" r="46" fill="#ffffff" />
              <g class="boat"><path d="M120 300h70l-10 14h-50z" fill="#12304a" /><path d="M150 296v-64l34 64z" fill="#ffffff" /><path d="M146 296v-48l-24 48z" fill="#c8352b" /></g>
              <g class="sea">
                <path class="wave a" d="M-260 318c40-14 80-14 120 0s80 14 120 0 80-14 120 0 80 14 120 0 80-14 120 0 80 14 120 0 80-14 120 0 80 14 120 0V540H-260z" fill="#9fc6c9" />
                <path class="wave b" d="M-260 352c40-12 80-12 120 0s80 12 120 0 80-12 120 0 80 12 120 0 80-12 120 0 80 12 120 0 80-12 120 0 80 12 120 0V540H-260z" fill="#5f97a3" />
                <path class="wave c" d="M-260 392c40-12 80-12 120 0s80 12 120 0 80-12 120 0 80 12 120 0 80-12 120 0 80 12 120 0 80-12 120 0 80 12 120 0V540H-260z" fill="#12304a" />
              </g>
            </g>
            <g class="cup">
              <ellipse cx="300" cy="438" rx="128" ry="26" fill="#0b2134" opacity="0.18" />
              <ellipse cx="300" cy="420" rx="124" ry="30" fill="#ffffff" stroke="#12304a" stroke-width="4" />
              <path d="M330 330h38a34 34 0 0 1 0 68h-30" fill="none" stroke="#12304a" stroke-width="14" stroke-linecap="round" />
              <path d="M206 318h188l-14 74a62 62 0 0 1-61 50h-38a62 62 0 0 1-61-50z" fill="#ffffff" stroke="#12304a" stroke-width="4" />
              <ellipse cx="300" cy="318" rx="94" ry="20" fill="#5b3424" stroke="#12304a" stroke-width="4" />
              <path d="M300 330c-8-10-24-6-20 4 3 7 20 12 20 12s17-5 20-12c4-10-12-14-20-4z" fill="#f4e9dc" />
            </g>
            <g class="steam" fill="none" stroke="#12304a" stroke-width="6" stroke-linecap="round" opacity="0.55">
              <path class="s1" d="M270 290c-14-18 14-30 0-50s12-30 0-46" />
              <path class="s2" d="M302 286c-14-18 14-30 0-50s12-30 0-50" />
              <path class="s3" d="M334 290c-14-18 14-30 0-50s12-30 0-46" />
            </g>
          </svg>
        </div>
      </section>

      <section class="menu" id="menu" aria-labelledby="menu-title">
        <div class="wrap">
          <div class="menu-head reveal">
            <h2 id="menu-title">Today's menu</h2>
            <div class="chips" role="group" aria-label="Show">
              <button type="button" aria-pressed="true" data-filter="all">Everything</button>
              <button type="button" aria-pressed="false" data-filter="coffee">Coffee</button>
              <button type="button" aria-pressed="false" data-filter="breakfast">Breakfast</button>
              <button type="button" aria-pressed="false" data-filter="bakes">Bakes</button>
            </div>
          </div>
          <ul class="dishes reveal" id="dishes">
${menuItems}
          </ul>
          <p class="menu-note">Sample menu and prices, in dollars. Breakfast until 11.30 am, bakes until they're gone.</p>
        </div>
      </section>

      <section class="visit" id="visit" aria-labelledby="visit-title">
        <div class="wrap visit-grid">
          <div class="map reveal" aria-hidden="true">
            <svg viewBox="0 0 480 360">
              <rect width="480" height="360" rx="28" fill="#cfe2e3" />
              <path d="M0 0h480v120c-60 30-120 10-170 40s-60 90-130 100S40 230 0 250z" fill="#f4f7f6" />
              <path d="M0 64h480M120 0v200M300 0v150" stroke="#dbe4e6" stroke-width="10" />
              <g fill="#e2eaec"><rect x="18" y="86" width="84" height="54" rx="8" /><rect x="138" y="86" width="64" height="40" rx="8" /><rect x="138" y="8" width="144" height="40" rx="8" /><rect x="18" y="8" width="84" height="40" rx="8" /><rect x="318" y="8" width="140" height="40" rx="8" /><rect x="18" y="158" width="84" height="54" rx="8" /></g>
              <path d="M300 218c40 20 80 40 150 54" fill="none" stroke="#5f97a3" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" />
              <text x="352" y="296" font-family="system-ui, sans-serif" font-size="11" fill="#4b5d6b">Ferry steps</text>
              <g transform="translate(424 316)"><circle r="18" fill="#f4f7f6" /><path d="M0-12l5 12h-10z" fill="#c8352b" /><path d="M0 12l5-12h-10z" fill="#12304a" /></g>
              <rect x="252" y="150" width="22" height="150" rx="4" fill="#f4f7f6" stroke="#9fc6c9" stroke-width="2" />
              <rect x="226" y="200" width="74" height="18" rx="4" fill="#f4f7f6" stroke="#9fc6c9" stroke-width="2" />
              <g class="pin"><circle cx="263" cy="150" r="30" fill="#c8352b" opacity="0.18" class="halo" /><circle cx="263" cy="150" r="13" fill="#c8352b" /><circle cx="263" cy="150" r="5" fill="#ffffff" /></g>
              <text x="296" y="132" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="#12304a">Harbor Café</text>
              <text x="296" y="150" font-family="system-ui, sans-serif" font-size="12" fill="#4b5d6b">Pier 4</text>
              <path d="M60 300c10-6 20-6 30 0s20 6 30 0" fill="none" stroke="#5f97a3" stroke-width="4" stroke-linecap="round" />
            </svg>
          </div>
          <div class="visit-text reveal">
            <h2 id="visit-title">Come by the pier.</h2>
            <address>Pier 4, Harbour Road<br />Old Port</address>
            <p class="visit-help">Five minutes' walk from the ferry steps. Bike racks outside, and the terrace is dog friendly.</p>
            <div class="visit-actions">
              <button class="button ghost" type="button" id="copy-address" data-address="Harbor Café, Pier 4, Harbour Road, Old Port">Copy the address</button>
              <a class="link" href="tel:+15550100">Call us <span aria-hidden="true">&rarr;</span></a>
            </div>
            <p class="copy-msg" id="copy-msg" role="status">A sample address and phone number.</p>
            <table class="hours" id="hours">
              <caption>Opening hours</caption>
              <tbody>
${hoursRows}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>

    <footer class="foot">
      <p>&copy; <span id="year">2026</span> Harbor Café. A sample site.</p>
      <a href="#top">Back to top</a>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `/* Harbor Café. The design decisions behind these tokens are in DESIGN.md. */
:root {
  --salt: #f4f7f6;
  --navy: #12304a;
  --buoy: #c8352b;
  --foam: #dcebea;
  --muted: #4b5d6b;
  --line: #d5e0e2;
  --display: Futura, "Century Gothic", "Avenir Next", system-ui, sans-serif;
  --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(16px, 5vw, 64px);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--salt); color: var(--navy); font: 17px/1.6 var(--body); -webkit-font-smoothing: antialiased; overflow-x: hidden; }
a { color: inherit; }
h1, h2 { font-family: var(--display); font-weight: 700; letter-spacing: -0.03em; }
h2 { margin: 0; font-size: clamp(32px, 4.6vw, 56px); line-height: 1.04; }
:focus-visible { outline: 3px solid var(--buoy); outline-offset: 3px; border-radius: 8px; }
.skip { position: absolute; left: 16px; top: -60px; z-index: 20; padding: 10px 16px; border-radius: 999px; background: var(--navy); color: #fff; }
.skip:focus { top: 12px; }
.wrap { max-width: 1140px; margin: 0 auto; }

.bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px var(--gutter); background: rgba(244, 247, 246, 0.86); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.brand { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; font: 700 19px var(--display); text-decoration: none; letter-spacing: -0.02em; }
.nav { display: flex; gap: 4px; }
.nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; font-weight: 600; text-decoration: none; }
.nav a:hover { background: var(--foam); }

/* Hero */
.hero { display: grid; align-items: center; gap: 32px; min-height: calc(100dvh - 64px); padding: clamp(24px, 5vw, 56px) var(--gutter) clamp(48px, 7vw, 88px); }
@media (min-width: 940px) { .hero { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.status { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 22px; padding: 8px 16px 8px 12px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 1px var(--line); font-size: 15px; font-weight: 600; }
.beacon { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
.status.open .beacon { background: #1f8a4c; animation: beacon 2s var(--ease) infinite; }
.status.closed .beacon { background: var(--buoy); }
@keyframes beacon { 0% { box-shadow: 0 0 0 0 rgba(31, 138, 76, 0.55); } 70%, 100% { box-shadow: 0 0 0 10px rgba(31, 138, 76, 0); } }
h1 { margin: 0; max-width: 13ch; font-size: clamp(44px, 6.6vw, 88px); line-height: 0.98; letter-spacing: -0.045em; }
.lead { max-width: 40ch; margin: 22px 0 0; color: var(--muted); font-size: clamp(18px, 1.6vw, 21px); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; margin-top: 30px; }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 26px; border: 0; border-radius: 999px; background: var(--buoy); color: #fff; font: 600 16px var(--body); text-decoration: none; cursor: pointer; box-shadow: 0 12px 28px -14px rgba(200, 53, 43, 0.8); transition: transform 0.2s var(--ease), box-shadow 0.2s, background-color 0.2s, color 0.2s; }
.button:hover { transform: translateY(-2px); }
.button:active { transform: translateY(1px); }
.button.ghost { background: transparent; color: var(--navy); box-shadow: inset 0 0 0 1.5px var(--navy); }
.button.ghost:hover { background: var(--navy); color: #fff; }
.link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-weight: 600; text-underline-offset: 5px; }
.link span { transition: transform 0.2s var(--ease); }
.link:hover span { transform: translateX(4px); }
.note { margin: 26px 0 0; color: var(--muted); font-size: 13px; }

/* The illustrated hero: steam rises, the sea drifts, the boat rocks. */
.scene { width: min(560px, 100%); justify-self: center; }
.scene svg { display: block; width: 100%; height: auto; overflow: visible; }
.wave { animation: sea 9s linear infinite; }
.wave.b { animation-duration: 13s; animation-direction: reverse; }
.wave.c { animation-duration: 7s; }
@keyframes sea { to { transform: translateX(240px); } }
.boat { transform-box: fill-box; transform-origin: 50% 100%; animation: rock 5s ease-in-out infinite; }
@keyframes rock { 0%, 100% { transform: rotate(-3deg) translateY(0); } 50% { transform: rotate(3deg) translateY(4px); } }
.steam path { stroke-dasharray: 130 160; animation: steam 3.4s ease-in-out infinite; }
.steam .s2 { animation-delay: -1.1s; }
.steam .s3 { animation-delay: -2.2s; }
@keyframes steam { 0% { stroke-dashoffset: 120; opacity: 0; } 30% { opacity: 1; } 100% { stroke-dashoffset: -120; opacity: 0; } }
.cup { animation: settle 1s var(--ease) both; }
@keyframes settle { from { opacity: 0; transform: translateY(24px); } }
.hero.off .wave, .hero.off .boat, .hero.off .steam path, .hero.off .beacon { animation-play-state: paused; }

/* Menu */
.menu { padding: clamp(64px, 9vw, 120px) var(--gutter); background: #ffffff; }
.menu-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips button { min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: var(--salt); color: var(--navy); font: 600 15px var(--body); box-shadow: inset 0 0 0 1px var(--line); cursor: pointer; transition: background-color 0.2s, color 0.2s, transform 0.15s; }
.chips button:hover { background: var(--foam); }
.chips button:active { transform: scale(0.97); }
.chips button[aria-pressed="true"] { background: var(--navy); color: #fff; box-shadow: none; }
.dishes { display: grid; gap: 0 40px; margin: 36px 0 0; padding: 0; list-style: none; }
@media (min-width: 820px) { .dishes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.dish { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px dashed var(--line); }
.dish[hidden] { display: none; }
.dish.enter { animation: enter 0.45s var(--ease) both; }
@keyframes enter { from { opacity: 0; transform: translateY(10px); } }
.dish-icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: var(--foam); }
.dish-icon svg { width: 32px; height: 32px; fill: none; stroke: var(--navy); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.dish-icon .fill { fill: var(--buoy); stroke: none; }
.dish:hover .wisp { animation: wisp 1.4s ease-in-out infinite; }
@keyframes wisp { 50% { transform: translateY(-2px); opacity: 0.5; } }
.dish-text { display: grid; min-width: 0; }
.dish-text strong { font-size: 17px; }
.dish-text small { color: var(--muted); font-size: 14px; }
.dish-price { font: 700 18px var(--display); font-variant-numeric: tabular-nums; }
.menu-note { margin: 22px 0 0; color: var(--muted); font-size: 14px; }

/* Visit */
.visit { padding: clamp(64px, 9vw, 120px) var(--gutter); }
.visit-grid { display: grid; gap: 40px; align-items: center; }
@media (min-width: 940px) { .visit-grid { grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); } }
.map svg { display: block; width: 100%; height: auto; }
.halo { transform-box: fill-box; transform-origin: center; animation: halo 2.4s var(--ease) infinite; }
@keyframes halo { from { transform: scale(0.4); opacity: 0.5; } to { transform: scale(1.4); opacity: 0; } }
address { margin: 20px 0 0; font-style: normal; font-size: 20px; font-weight: 600; line-height: 1.4; }
.visit-help { max-width: 42ch; margin: 12px 0 0; color: var(--muted); }
.visit-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; margin-top: 24px; }
.copy-msg { margin: 12px 0 0; color: var(--muted); font-size: 14px; }
.hours { width: 100%; margin-top: 28px; border-collapse: collapse; }
.hours caption { padding-bottom: 8px; font: 700 13px var(--display); letter-spacing: 0.14em; text-align: left; text-transform: uppercase; color: var(--muted); }
.hours th, .hours td { padding: 10px 12px; border-top: 1px solid var(--line); font-size: 15px; text-align: left; font-variant-numeric: tabular-nums; }
.hours th { font-weight: 500; }
.hours td { text-align: right; }
.hours tr.today { background: #fff; box-shadow: inset 4px 0 0 var(--buoy); }
.hours tr.today th { font-weight: 700; }
.hours tr.today th::after { content: " (today)"; color: var(--buoy); font-weight: 600; }

.foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 24px var(--gutter); border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
.foot p { margin: 0; }
.foot a { display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0; }

.js .reveal { opacity: 0; transform: translateY(22px); transition: opacity 0.7s var(--ease), transform 0.7s var(--ease); }
.js .reveal.in { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .reveal { opacity: 1; transform: none; }
  .steam path { stroke-dasharray: none; }
}
`;

const SCRIPT = `// Harbor Café: live opening status, the menu filter and small enhancements.
// The page is complete without this file.
(function () {
  document.documentElement.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;

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

  var hero = document.querySelector(".hero");
  if (hero && canObserve) {
    new IntersectionObserver(function (entries) { hero.classList.toggle("off", !entries[0].isIntersecting); }).observe(hero);
  }

  // Open now? Worked out from the hours table, in the visitor's local time.
  var minutes = function (hhmm) { var p = hhmm.split(":"); return Number(p[0]) * 60 + Number(p[1]); };
  var pretty = function (hhmm) {
    var p = hhmm.split(":"), h = Number(p[0]), m = Number(p[1]);
    return (h % 12 === 0 ? 12 : h % 12) + (m ? "." + (m < 10 ? "0" : "") + m : "") + (h < 12 ? " am" : " pm");
  };
  function updateStatus() {
    var now = new Date();
    var rows = Array.prototype.slice.call(document.querySelectorAll("#hours tr"));
    var today = rows.filter(function (r) { return Number(r.dataset.day) === now.getDay(); })[0];
    var status = document.getElementById("status");
    var text = document.getElementById("status-text");
    if (!today || !status || !text) return;
    rows.forEach(function (r) { r.classList.toggle("today", r === today); });
    var t = now.getHours() * 60 + now.getMinutes();
    var open = minutes(today.dataset.open), close = minutes(today.dataset.close);
    status.classList.remove("open", "closed");
    if (t >= open && t < close) {
      status.classList.add("open");
      text.textContent = "Open now, until " + pretty(today.dataset.close);
    } else if (t < open) {
      status.classList.add("closed");
      text.textContent = "Closed now, opens at " + pretty(today.dataset.open);
    } else {
      var next = rows[(rows.indexOf(today) + 1) % rows.length];
      status.classList.add("closed");
      text.textContent = "Closed now, opens tomorrow at " + pretty(next.dataset.open);
    }
  }
  updateStatus();
  setInterval(updateStatus, 60000);

  // The menu filter.
  var chips = document.querySelectorAll("[data-filter]");
  var dishes = document.querySelectorAll(".dish");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var kind = chip.dataset.filter;
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      var shown = 0;
      dishes.forEach(function (d) {
        var show = kind === "all" || d.dataset.kind === kind;
        d.hidden = !show;
        d.classList.remove("enter");
        if (show && !reduce) {
          d.style.animationDelay = shown * 40 + "ms";
          void d.offsetWidth;
          d.classList.add("enter");
        }
        if (show) shown += 1;
      });
    });
  });

  // Copy the address, and say what happened.
  var copy = document.getElementById("copy-address");
  var msg = document.getElementById("copy-msg");
  if (copy && msg) {
    copy.addEventListener("click", function () {
      var address = copy.dataset.address;
      var done = function () { msg.textContent = "Copied. It's a sample address, so replace it with yours."; };
      var fail = function () { msg.textContent = "Couldn't copy here. The address is " + address + "."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(address).then(done, fail);
      else fail();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Harbor Café: design

Design read: a waterfront café's site for locals and visitors deciding where to have breakfast. Bright, nautical and friendly, like a harbour on a clear morning.

## Palette (CSS variables in styles.css)

- \`--salt\` #f4f7f6: the page, a cool white
- \`--navy\` #12304a: text and outlines
- \`--buoy\` #c8352b: the one accent, for actions, the map pin and today's hours
- \`--foam\` #dcebea: soft fills
- \`--muted\` #4b5d6b and \`--line\` #d5e0e2: secondary text and borders
- Illustration only: sea tints #9fc6c9 and #5f97a3, coffee #5b3424, open-now green #1f8a4c (always with words)

## Type

- Display: Futura or Century Gothic, weight 700, for headings and prices. It has the feel of harbour signage.
- Body: the system sans at 17px.

## Layout

A split hero (the welcome and status on the left, the illustrated cup on the right), a menu in two columns with filter chips, a visit section with a drawn map, the address and the opening hours.

## Signature

The harbour scene: a cup of coffee with rising steam, in front of a sea that drifts and a small boat that rocks. And a live status that says whether the café is open right now.

## Motion

Steam rises, the sea drifts and the boat rocks, and all of it pauses off screen. The beacon pulses only when the café is open. Menu items settle in when you filter; sections rise in on scroll. Everything stops under prefers-reduced-motion, and the page is complete without JavaScript.

## Shape

Pills for buttons and chips, round icon badges, a 28px map.

## When this becomes another business

Update this file first. Redraw the hero scene around what the business makes, keep the live status if it has opening hours, and keep one accent.
`;

const README = `# Harbor Café local business site (template)

A one-page site for a café or shop, built to the Farbaek Studio standard: an illustrated hero with rising steam and a drifting sea, a live open-now status, a menu you can filter, a drawn map, the address and the opening hours.

- \`DESIGN.md\`: the design decisions. Change it first when the site becomes yours.
- \`script.js\`: the open-now status (from the hours table, in the visitor's local time), the menu filter, copying the address and scroll reveals. The page works without it.

The name, menu, prices, address, phone number and hours are sample content. Ask the agent to make it yours, for example: "Make this the site for my bakery in Kandy, open 6am to 8pm every day, with our cakes and buns".
`;

export const LOCAL_BUSINESS_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];
