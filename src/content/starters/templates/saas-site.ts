/**
 * Template: a marketing site for a software product, with a drawn product
 * window, features and plans. Sample content; previews instantly.
 */
import type { StarterFile } from "../types";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ledgerly: invoices that chase themselves</title>
    <meta name="description" content="Ledgerly sends invoices, reminders and receipts for small teams. Sample software site." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="nav">
      <a class="brand" href="#top">Ledgerly</a>
      <nav aria-label="Main">
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a class="cta" href="#pricing">Start free</a>
      </nav>
    </header>

    <main id="top">
      <section class="hero">
        <div class="copy">
          <p class="tag">Sample product · for small teams</p>
          <h1>Invoices that chase themselves.</h1>
          <p class="lead">Send an invoice once. Ledgerly follows up politely, takes the payment and files the receipt, so you don't have to.</p>
          <div class="row">
            <a class="btn primary" href="#pricing">Start free</a>
            <a class="btn" href="#features">How it works</a>
          </div>
        </div>
        <div class="window" aria-label="Sample product screen">
          <div class="chrome"><span></span><span></span><span></span></div>
          <div class="screen">
            <div class="stat"><small>Outstanding</small><b>$4,280</b></div>
            <div class="stat"><small>Paid this month</small><b>$12,940</b></div>
            <ul class="list">
              <li><span>Harbor Café</span><em class="ok">Paid</em></li>
              <li><span>Northline Studio</span><em class="due">Reminder sent</em></li>
              <li><span>Pine &amp; Co.</span><em class="due">Due Friday</em></li>
              <li><span>Atlas Movers</span><em class="ok">Paid</em></li>
            </ul>
          </div>
        </div>
      </section>

      <section id="features" class="features">
        <h2>Everything after "send"</h2>
        <div class="grid">
          <article><h3>Polite reminders</h3><p>Three gentle follow-ups on a schedule you set, in your own words.</p></article>
          <article><h3>Pay by link</h3><p>Customers pay by card or bank transfer from the invoice itself.</p></article>
          <article><h3>Receipts filed</h3><p>Every payment gets a receipt, filed by customer and month.</p></article>
          <article><h3>Clear numbers</h3><p>See what's owed, what's late and what came in, on one page.</p></article>
        </div>
      </section>

      <section id="pricing" class="pricing">
        <h2>Simple plans</h2>
        <p class="note">Sample prices. Replace them with your own.</p>
        <div class="plans">
          <article class="plan">
            <h3>Starter</h3>
            <p class="price"><b>$0</b> / month</p>
            <ul><li>10 invoices a month</li><li>Email reminders</li></ul>
            <a class="btn" href="#top">Start free</a>
          </article>
          <article class="plan featured">
            <h3>Team</h3>
            <p class="price"><b>$19</b> / month</p>
            <ul><li>Unlimited invoices</li><li>Pay by link</li><li>Receipts filed</li></ul>
            <a class="btn primary" href="#top">Try Team</a>
          </article>
        </div>
      </section>
    </main>

    <footer class="foot">Ledgerly is a sample product. &copy; <span id="year"></span></footer>
    <script>document.getElementById("year").textContent = new Date().getFullYear();</script>
  </body>
</html>
`;

const STYLES = `:root {
  --bg: #f5f7fb;
  --panel: #ffffff;
  --ink: #101828;
  --muted: #5b6577;
  --line: #e1e6ee;
  --accent: #2f5bea;
  --ok: #117a4d;
  --due: #b25e00;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 var(--font); }
a { color: inherit; text-decoration: none; }

.nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px clamp(16px, 5vw, 56px); }
.brand { font-weight: 800; letter-spacing: -0.03em; font-size: 20px; }
.nav nav { display: flex; align-items: center; gap: 20px; font-size: 15px; }
.nav .cta { background: var(--ink); color: #fff; border-radius: 999px; padding: 8px 16px; }

.hero { display: grid; grid-template-columns: 1.05fr 1fr; gap: 48px; align-items: center; max-width: 1180px; margin: 0 auto; padding: clamp(40px, 8vw, 96px) clamp(16px, 5vw, 56px); }
.tag { margin: 0 0 14px; color: var(--accent); font-weight: 600; font-size: 14px; }
h1 { margin: 0; font-size: clamp(38px, 6vw, 64px); line-height: 1.03; letter-spacing: -0.045em; }
.lead { margin: 20px 0 0; color: var(--muted); font-size: 18px; max-width: 46ch; }
.row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 20px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); font-weight: 600; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }

.window { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 24px 60px -24px rgb(16 24 40 / 0.25); overflow: hidden; transform: perspective(1200px) rotateY(-6deg) rotateX(3deg); }
.chrome { display: flex; gap: 6px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
.chrome span { width: 10px; height: 10px; border-radius: 50%; background: var(--line); }
.screen { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 18px; }
.stat { background: var(--bg); border-radius: 14px; padding: 14px; }
.stat small { display: block; color: var(--muted); }
.stat b { font-size: 26px; letter-spacing: -0.03em; }
.list { grid-column: 1 / -1; margin: 0; padding: 0; list-style: none; }
.list li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 2px; border-top: 1px solid var(--line); }
.list em { font-style: normal; font-size: 13px; font-weight: 600; }
.ok { color: var(--ok); }
.due { color: var(--due); }

.features, .pricing { max-width: 1180px; margin: 0 auto; padding: 72px clamp(16px, 5vw, 56px); }
h2 { margin: 0 0 28px; font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.035em; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.grid article, .plan { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 24px; }
.grid h3, .plan h3 { margin: 0 0 6px; font-size: 18px; }
.grid p { margin: 0; color: var(--muted); }

.note { margin: -16px 0 24px; color: var(--muted); font-size: 14px; }
.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; max-width: 760px; }
.plan.featured { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.price b { font-size: 36px; letter-spacing: -0.03em; }
.plan ul { margin: 0 0 20px; padding-left: 18px; color: var(--muted); }

.foot { padding: 32px clamp(16px, 5vw, 56px); color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); }

@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr; }
  .window { transform: none; }
  .nav nav a:not(.cta) { display: none; }
}
`;

const README = `# Ledgerly software site (template)

A marketing site for a software product: a hero with a drawn product screen, four features and two plans.

Everything here is sample content, including the product, the numbers on the screen and the prices. Ask the agent to make it yours, for example: "Turn this into the site for my clinic booking app, with plans at $12 and $29".
`;

export const SAAS_SITE_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "README.md", content: README },
];
