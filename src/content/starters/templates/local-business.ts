/**
 * Template: a site for a local business: what it offers, opening hours,
 * where it is and how to reach it. Sample content; previews instantly.
 */
import type { StarterFile } from "../types";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Harbor Café, coffee and breakfast by the water</title>
    <meta name="description" content="Harbor Café serves coffee, breakfast and lunch by the harbour. Sample local business site." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="head">
      <a class="name" href="#top">Harbor Café</a>
      <a class="call" href="tel:+10000000000">Call us</a>
    </header>

    <main id="top">
      <section class="hero">
        <p class="open" id="open-now">Open today 7:00 to 16:00</p>
        <h1>Coffee and breakfast by the water.</h1>
        <p>Fresh bread every morning, slow coffee all day and a table with a view.</p>
        <div class="buttons">
          <a class="btn" href="#menu">See the menu</a>
          <a class="btn ghost" href="#visit">Find us</a>
        </div>
      </section>

      <section id="menu" class="menu">
        <h2>Menu</h2>
        <p class="sample">Sample items and prices.</p>
        <div class="cols">
          <div>
            <h3>Breakfast</h3>
            <dl>
              <div><dt>Harbor breakfast</dt><dd>$12</dd></div>
              <div><dt>Eggs on sourdough</dt><dd>$9</dd></div>
              <div><dt>Granola and yoghurt</dt><dd>$7</dd></div>
            </dl>
          </div>
          <div>
            <h3>Coffee</h3>
            <dl>
              <div><dt>Flat white</dt><dd>$4</dd></div>
              <div><dt>Filter, refills free</dt><dd>$3</dd></div>
              <div><dt>Iced latte</dt><dd>$5</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section id="visit" class="visit">
        <div>
          <h2>Visit</h2>
          <p>12 Quay Road, Harbourside<br />Two minutes from the ferry.</p>
          <a class="btn" href="https://www.openstreetmap.org/" rel="noopener">Open the map</a>
        </div>
        <div>
          <h2>Hours</h2>
          <table>
            <tr><th scope="row">Monday to Friday</th><td>7:00 to 16:00</td></tr>
            <tr><th scope="row">Saturday</th><td>8:00 to 17:00</td></tr>
            <tr><th scope="row">Sunday</th><td>8:00 to 14:00</td></tr>
          </table>
        </div>
      </section>
    </main>

    <footer class="foot">Harbor Café is a sample business. &copy; <span id="year"></span></footer>
    <script>document.getElementById("year").textContent = new Date().getFullYear();</script>
  </body>
</html>
`;

const STYLES = `:root {
  --bg: #f6f8f5;
  --forest: #1f4d3a;
  --forest-ink: #f6f8f5;
  --ink: #17231d;
  --muted: #55645b;
  --line: #d9e0da;
  --amber: #e3a008;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 var(--font); }
a { color: inherit; }

.head { display: flex; align-items: center; justify-content: space-between; padding: 16px clamp(16px, 5vw, 64px); background: var(--forest); color: var(--forest-ink); }
.name { font-weight: 800; text-decoration: none; letter-spacing: -0.02em; font-size: 19px; }
.call { border: 1px solid rgb(246 248 245 / 0.4); border-radius: 999px; padding: 6px 14px; text-decoration: none; font-size: 15px; }

.hero { background: var(--forest); color: var(--forest-ink); padding: clamp(48px, 9vw, 112px) clamp(16px, 5vw, 64px) clamp(56px, 9vw, 120px); }
.open { display: inline-block; margin: 0 0 16px; padding: 4px 12px; border-radius: 999px; background: var(--amber); color: #2a1d00; font-weight: 700; font-size: 14px; }
.hero h1 { margin: 0; max-width: 16ch; font-size: clamp(40px, 7vw, 72px); line-height: 1.02; letter-spacing: -0.04em; }
.hero p { max-width: 44ch; font-size: 19px; opacity: 0.9; }
.buttons { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
.btn { display: inline-flex; align-items: center; min-height: 46px; padding: 0 20px; border-radius: 999px; background: var(--amber); color: #2a1d00; font-weight: 700; text-decoration: none; }
.btn.ghost { background: transparent; color: inherit; border: 1px solid currentColor; }

.menu, .visit { max-width: 1040px; margin: 0 auto; padding: 72px clamp(16px, 5vw, 64px); }
h2 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.03em; color: var(--forest); }
.sample { margin: 0 0 24px; color: var(--muted); font-size: 14px; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 32px; }
h3 { margin: 0 0 8px; font-size: 18px; }
dl { margin: 0; }
dl div { display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px dashed var(--line); }
dt { font-weight: 600; }
dd { margin: 0; color: var(--muted); font-variant-numeric: tabular-nums; }

.visit { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 40px; border-top: 1px solid var(--line); }
.visit .btn { background: var(--forest); color: var(--forest-ink); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 0; border-bottom: 1px solid var(--line); text-align: left; font-weight: 400; }
td { text-align: right; color: var(--muted); }

.foot { padding: 24px clamp(16px, 5vw, 64px); color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); }
`;

const README = `# Harbor Café (template)

A site for a local business: a hero with today's hours, a menu, where to find it and opening hours.

The business, menu, prices and address are sample content. Ask the agent to make it yours, for example: "Make this the site for my bakery in Kandy, open 6am to 8pm, with our real menu".
`;

export const LOCAL_BUSINESS_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "README.md", content: README },
];
