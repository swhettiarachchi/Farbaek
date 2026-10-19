/**
 * Template: a personal portfolio, a big name, a list of selected work and a
 * way to get in touch. Sample content; previews instantly.
 */
import type { StarterFile } from "../types";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jordan Lee, product designer</title>
    <meta name="description" content="Selected work by Jordan Lee, product designer. Sample portfolio." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="top">
      <span>Jordan Lee</span>
      <a href="#contact">Available from June</a>
    </header>

    <main>
      <section class="intro">
        <h1>Jordan Lee<span>.</span></h1>
        <p>Product designer. I make complicated tools feel obvious, mostly for small teams in health and finance.</p>
      </section>

      <section class="work" aria-labelledby="work-title">
        <h2 id="work-title">Selected work</h2>
        <ol>
          <li>
            <span class="year">2025</span>
            <div><h3>Clinic scheduling, rebuilt</h3><p>Cut booking time for front-desk staff from minutes to seconds.</p></div>
            <span class="role">Lead designer</span>
          </li>
          <li>
            <span class="year">2024</span>
            <div><h3>A calmer banking app</h3><p>One home screen instead of five, tested with 40 customers.</p></div>
            <span class="role">Product design</span>
          </li>
          <li>
            <span class="year">2023</span>
            <div><h3>Field notes for nurses</h3><p>An offline-first notes app for rural visits.</p></div>
            <span class="role">Research and design</span>
          </li>
        </ol>
        <p class="note">Sample projects. Replace them with yours.</p>
      </section>

      <section class="about">
        <h2>About</h2>
        <p>I've spent ten years between research rooms and code reviews. I like small teams, clear problems and work that ships.</p>
      </section>

      <section id="contact" class="contact">
        <h2>Let's talk</h2>
        <a class="mail" href="mailto:hello@example.com">hello@example.com</a>
      </section>
    </main>

    <footer class="foot">&copy; <span id="year"></span> Jordan Lee. Sample portfolio.</footer>
    <script>document.getElementById("year").textContent = new Date().getFullYear();</script>
  </body>
</html>
`;

const STYLES = `:root {
  --bg: #fafafa;
  --ink: #111111;
  --muted: #6b6b6b;
  --line: #dcdcdc;
  --accent: #ff5a3c;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 var(--font); }
a { color: inherit; }

.top { display: flex; justify-content: space-between; gap: 16px; padding: 20px clamp(16px, 5vw, 72px); font-size: 15px; }
.top a { text-decoration: none; border-bottom: 1px solid var(--accent); }

.intro { padding: clamp(56px, 12vw, 160px) clamp(16px, 5vw, 72px) 48px; }
h1 { margin: 0; font-size: clamp(56px, 13vw, 168px); line-height: 0.92; letter-spacing: -0.06em; font-weight: 800; }
h1 span { color: var(--accent); }
.intro p { max-width: 38ch; margin: 28px 0 0; font-size: clamp(19px, 2.4vw, 24px); line-height: 1.4; }

.work, .about, .contact { padding: 56px clamp(16px, 5vw, 72px); border-top: 1px solid var(--line); }
h2 { margin: 0 0 24px; font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.work ol { margin: 0; padding: 0; list-style: none; }
.work li { display: grid; grid-template-columns: 80px 1fr auto; gap: 24px; align-items: baseline; padding: 24px 0; border-bottom: 1px solid var(--line); transition: padding 200ms ease; }
.work li:hover { padding-left: 12px; }
.work h3 { margin: 0; font-size: clamp(22px, 3vw, 32px); letter-spacing: -0.03em; }
.work p { margin: 4px 0 0; color: var(--muted); }
.year, .role { color: var(--muted); font-size: 15px; }
.note { margin: 16px 0 0; color: var(--muted); font-size: 14px; }

.about p { max-width: 52ch; margin: 0; font-size: 20px; line-height: 1.5; }
.mail { font-size: clamp(28px, 6vw, 64px); letter-spacing: -0.04em; text-decoration-color: var(--accent); text-underline-offset: 8px; }

.foot { padding: 24px clamp(16px, 5vw, 72px); color: var(--muted); font-size: 14px; }

@media (max-width: 640px) {
  .work li { grid-template-columns: 1fr; gap: 4px; }
}

@media (prefers-reduced-motion: reduce) {
  .work li { transition: none; }
}
`;

const README = `# Jordan Lee portfolio (template)

A personal portfolio: a large name, a list of selected work, a short about and an email link.

The name, projects and words are sample content. Ask the agent to make it yours, for example: "Make this my photography portfolio with five projects and my Instagram link".
`;

export const PORTFOLIO_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "README.md", content: README },
];
