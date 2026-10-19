/**
 * Template: a landing page for one product or offer. Sample content, meant
 * to be replaced; no build step, previews instantly.
 */
import type { StarterFile } from "../types";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tidewater: plan your week in five minutes</title>
    <meta name="description" content="Tidewater turns your notes into a calm, realistic week plan. Sample landing page." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="bar">
      <a class="logo" href="#top"><span class="dot" aria-hidden="true"></span>Tidewater</a>
      <a class="pill" href="#start">Get early access</a>
    </header>

    <main id="top">
      <section class="hero">
        <p class="eyebrow">Sample product</p>
        <h1>Plan your week in five minutes, then get on with it.</h1>
        <p class="lead">Tidewater reads the notes you already keep and turns them into a week you can actually finish. No new system to learn.</p>
        <div class="actions">
          <a class="button" href="#start">Get early access</a>
          <a class="link" href="#how">See how it works</a>
        </div>
        <ul class="proof" aria-label="At a glance">
          <li><strong>5 min</strong> to plan a week</li>
          <li><strong>3</strong> priorities a day, never more</li>
          <li><strong>0</strong> new apps to learn</li>
        </ul>
      </section>

      <section id="how" class="steps">
        <h2>How it works</h2>
        <ol>
          <li>
            <h3>Bring your notes</h3>
            <p>Paste a list, a page of notes or last week's leftovers.</p>
          </li>
          <li>
            <h3>Pick three priorities</h3>
            <p>Tidewater suggests a realistic three for each day. You choose.</p>
          </li>
          <li>
            <h3>Work the plan</h3>
            <p>One calm page for today. Anything unfinished rolls forward on its own.</p>
          </li>
        </ol>
      </section>

      <section class="quote">
        <blockquote>
          <p>"Sample quote: I stopped rewriting my to-do list every morning."</p>
          <footer>Sample customer, freelance designer</footer>
        </blockquote>
      </section>

      <section id="start" class="cta">
        <h2>Be first in line</h2>
        <p>Leave your email and we'll write once, when it's ready.</p>
        <form class="signup" action="#" onsubmit="event.preventDefault(); this.querySelector('.thanks').hidden = false;">
          <label class="sr-only" for="email">Email</label>
          <input id="email" type="email" placeholder="you@example.com" required />
          <button class="button" type="submit">Join the list</button>
          <p class="thanks" hidden>Thanks. This sample form doesn't send anything yet.</p>
        </form>
      </section>
    </main>

    <footer class="foot">
      <p>&copy; <span id="year"></span> Tidewater. Sample site.</p>
    </footer>
    <script>document.getElementById("year").textContent = new Date().getFullYear();</script>
  </body>
</html>
`;

const STYLES = `:root {
  --bg: #ffffff;
  --ink: #0d1117;
  --muted: #586070;
  --line: #e6e8ec;
  --accent: #0f8a5f;
  --accent-soft: #e7f5ef;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 var(--font); }
a { color: inherit; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

.bar { display: flex; align-items: center; justify-content: space-between; padding: 18px clamp(16px, 5vw, 64px); }
.logo { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; text-decoration: none; letter-spacing: -0.02em; }
.dot { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.pill { border: 1px solid var(--line); border-radius: 999px; padding: 8px 16px; text-decoration: none; font-size: 15px; }

.hero { max-width: 980px; margin: 0 auto; padding: clamp(48px, 10vw, 120px) clamp(16px, 5vw, 64px) 64px; }
.eyebrow { margin: 0 0 12px; color: var(--accent); font-weight: 600; font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(40px, 7vw, 76px); line-height: 1.02; letter-spacing: -0.045em; max-width: 14ch; }
.lead { max-width: 52ch; margin: 24px 0 0; color: var(--muted); font-size: 19px; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; margin-top: 32px; }
.button { display: inline-flex; align-items: center; min-height: 48px; padding: 0 24px; border: 0; border-radius: 999px; background: var(--ink); color: #fff; font: 600 16px var(--font); text-decoration: none; cursor: pointer; }
.button:hover { background: var(--accent); }
.link { font-weight: 600; text-underline-offset: 4px; }
.proof { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 56px 0 0; padding: 0; list-style: none; }
.proof li { border-top: 2px solid var(--ink); padding-top: 12px; color: var(--muted); }
.proof strong { display: block; color: var(--ink); font-size: 32px; letter-spacing: -0.03em; }

.steps { background: #f6f7f9; padding: 80px clamp(16px, 5vw, 64px); }
.steps h2, .cta h2 { margin: 0 auto 32px; max-width: 980px; font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.03em; }
.steps ol { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; max-width: 980px; margin: 0 auto; padding: 0; list-style: none; counter-reset: step; }
.steps li { background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 24px; counter-increment: step; }
.steps li::before { content: counter(step); display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.steps h3 { margin: 16px 0 6px; font-size: 19px; }
.steps p { margin: 0; color: var(--muted); }

.quote { padding: 80px clamp(16px, 5vw, 64px); }
blockquote { max-width: 760px; margin: 0 auto; }
blockquote p { margin: 0; font-size: clamp(24px, 3.4vw, 34px); line-height: 1.25; letter-spacing: -0.02em; }
blockquote footer { margin-top: 16px; color: var(--muted); }

.cta { padding: 80px clamp(16px, 5vw, 64px) 96px; text-align: center; }
.cta h2 { margin-bottom: 8px; }
.cta > p { color: var(--muted); }
.signup { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 24px; }
.signup input { min-height: 48px; min-width: min(320px, 100%); padding: 0 18px; border: 1px solid var(--line); border-radius: 12px; font: 16px var(--font); }
.thanks { flex-basis: 100%; color: var(--accent); }

.foot { border-top: 1px solid var(--line); padding: 24px clamp(16px, 5vw, 64px); color: var(--muted); font-size: 14px; }
`;

const README = `# Tidewater landing page (template)

A one-page landing page: a hero with a clear promise, three steps, a quote and an email sign-up.

The text, the product name and the quote are sample content. Ask the agent to replace them with yours, for example: "Make this the landing page for my bookkeeping service in Colombo".

The sign-up form doesn't send anything yet. Connecting it to an email list is a separate change.
`;

export const LANDING_PAGE_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "README.md", content: README },
];
