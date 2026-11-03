/**
 * Template: an admin dashboard (a small shop's back office), built to the
 * Studio standard (ADR 0030, ADR 0124). Tiles for the numbers that matter,
 * a revenue chart drawn in SVG with a 7, 30 and 90 day range and a readout
 * that follows the pointer or the keyboard, and an orders table with search,
 * a status filter, sorting, pages and a CSV export. Every number is sample
 * data made in the page, and the page says so. Previews instantly; the table
 * and tiles are complete without JavaScript.
 */
import type { StarterFile } from "../types";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ledgerly, shop dashboard (sample)</title>
    <meta name="description" content="A sample admin dashboard for a small online shop: revenue, orders and customers at a glance." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to the dashboard</a>
    <div class="shell">
      <aside class="side" aria-label="Sections">
        <a class="brand" href="#main" aria-label="Ledgerly, dashboard"><span class="mark" aria-hidden="true"></span>Ledgerly</a>
        <nav>
          <a href="#main" aria-current="page">Overview</a>
          <a href="#orders">Orders</a>
          <a href="#notes">Notes</a>
        </nav>
        <p class="side-note">Sample dashboard: every number is made up.</p>
      </aside>

      <main id="main" class="main">
        <header class="head">
          <div>
            <p class="eyebrow-sample">Sample data</p>
            <h1>Good afternoon, Rae</h1>
            <p class="sub">Here's how the shop is doing.</p>
          </div>
          <div class="range" role="group" aria-label="Range">
            <button type="button" data-range="7" aria-pressed="false">7 days</button>
            <button type="button" data-range="30" aria-pressed="true">30 days</button>
            <button type="button" data-range="90" aria-pressed="false">90 days</button>
          </div>
        </header>

        <section class="tiles" aria-label="Key numbers">
          <article class="tile"><h2>Revenue</h2><p class="value" id="t-revenue">$18,420</p><p class="delta up" id="d-revenue">Up 12% on the period before</p></article>
          <article class="tile"><h2>Orders</h2><p class="value" id="t-orders">412</p><p class="delta up" id="d-orders">Up 8% on the period before</p></article>
          <article class="tile"><h2>Average order</h2><p class="value" id="t-aov">$44.70</p><p class="delta down" id="d-aov">Down 2% on the period before</p></article>
          <article class="tile"><h2>Refunds</h2><p class="value" id="t-refunds">1.9%</p><p class="delta" id="d-refunds">Same as the period before</p></article>
        </section>

        <section class="chart-card" aria-labelledby="chart-title">
          <div class="card-head">
            <h2 id="chart-title">Revenue by day</h2>
            <p class="legend"><span class="key now" aria-hidden="true"></span>This period <span class="key before" aria-hidden="true"></span>Period before</p>
          </div>
          <div class="chart" id="chart" tabindex="0" role="img" aria-label="A line chart of revenue by day. Use the left and right arrow keys to read each day.">
            <svg viewBox="0 0 720 240" preserveAspectRatio="none" aria-hidden="true">
              <g class="grid" id="grid"></g>
              <path class="before" id="line-before" d="" />
              <path class="area" id="area" d="" />
              <path class="now" id="line-now" d="" />
              <line class="cursor" id="cursor" x1="0" x2="0" y1="0" y2="240" />
              <circle class="dot" id="dot" r="5" cx="-10" cy="-10" />
            </svg>
            <div class="readout" id="readout" aria-live="polite" hidden></div>
          </div>
        </section>

        <section id="orders" class="orders" aria-labelledby="orders-title">
          <div class="card-head">
            <h2 id="orders-title">Orders</h2>
            <button type="button" class="export" id="export">Export CSV</button>
          </div>
          <div class="table-tools">
            <label class="search">Search
              <input id="search" type="search" placeholder="Customer or order" autocomplete="off" />
            </label>
            <label class="status-filter">Status
              <select id="status">
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="shipped">Shipped</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
          </div>
          <div class="table-wrap">
            <table>
              <caption class="visually-hidden">Recent orders, sample data</caption>
              <thead>
                <tr>
                  <th scope="col"><button type="button" class="sort" data-sort="id">Order</button></th>
                  <th scope="col"><button type="button" class="sort" data-sort="customer">Customer</button></th>
                  <th scope="col"><button type="button" class="sort" data-sort="date" aria-sort="descending">Date</button></th>
                  <th scope="col"><button type="button" class="sort" data-sort="status">Status</button></th>
                  <th scope="col" class="num"><button type="button" class="sort" data-sort="total">Total</button></th>
                </tr>
              </thead>
              <tbody id="rows">
                <tr><td>#1042</td><td>Amaya Perera</td><td>Today</td><td><span class="pill paid">Paid</span></td><td class="num">$58.00</td></tr>
                <tr><td>#1041</td><td>Jonah Field</td><td>Today</td><td><span class="pill shipped">Shipped</span></td><td class="num">$32.50</td></tr>
                <tr><td>#1040</td><td>Lena Ortiz</td><td>Yesterday</td><td><span class="pill refunded">Refunded</span></td><td class="num">$19.00</td></tr>
              </tbody>
            </table>
          </div>
          <div class="pager">
            <p id="page-info">Showing 3 of 3</p>
            <div class="pager-buttons">
              <button type="button" id="prev">Previous</button>
              <button type="button" id="next">Next</button>
            </div>
          </div>
        </section>

        <section id="notes" class="notes" aria-labelledby="notes-title">
          <h2 id="notes-title">Notes</h2>
          <p>This is a sample dashboard made with Farbaek. The people, orders and amounts are invented. Ask Farbaek to connect your shop's real data when you're ready.</p>
        </section>
      </main>
    </div>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `:root {
  --canvas: #f5f6f8;
  --panel: #ffffff;
  --ink: #101418;
  --muted: #59616e;
  --line: #e1e4ea;
  --signal: #e4572e;
  --signal-soft: rgba(228, 87, 46, 0.12);
  --before: #9aa3b0;
  --paid: #1f7a4d;
  --shipped: #2b5bb8;
  --refunded: #a23b3b;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
  background: var(--canvas);
}

/* Filters hide items with the hidden attribute; a display rule must never bring them back. */
[hidden] { display: none !important; }
* { box-sizing: border-box; }
body { margin: 0; line-height: 1.5; }
:focus-visible { outline: 3px solid var(--signal); outline-offset: 2px; border-radius: 6px; }
.skip { position: absolute; left: -999px; top: 8px; background: var(--panel); padding: 10px 14px; border-radius: 999px; }
.skip:focus { left: 12px; z-index: 30; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 100vh; }
.side { position: sticky; top: 0; align-self: start; height: 100vh; display: flex; flex-direction: column; gap: 22px; padding: 22px 16px; background: var(--ink); color: #e9ecf1; }
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -0.02em; color: inherit; text-decoration: none; min-height: 44px; }
.mark { width: 20px; height: 20px; border-radius: 5px; background: conic-gradient(var(--signal) 0 30%, #f3b391 30% 55%, #ffffff 55%); }
.side nav { display: grid; gap: 4px; }
.side nav a { display: flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 10px; color: #c3c9d3; text-decoration: none; }
.side nav a[aria-current="page"], .side nav a:hover { background: rgba(255, 255, 255, 0.08); color: #ffffff; }
.side-note { margin-top: auto; font-size: 13px; color: #9aa3b0; border: 1px dashed #59616e; border-radius: 10px; padding: 10px; }

/* minmax(0, 1fr) lets the wide orders table scroll inside its frame instead of widening the page. */
.main { padding: clamp(16px, 3vw, 32px); display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-content: start; min-width: 0; }
.head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 16px; }
.eyebrow-sample { display: inline-block; margin: 0 0 6px; padding: 3px 10px; border-radius: 999px; border: 1px dashed var(--muted); font-size: 13px; color: var(--muted); }
.head h1 { margin: 0; font-size: clamp(1.7rem, 3.4vw, 2.4rem); letter-spacing: -0.035em; }
.sub { margin: 4px 0 0; color: var(--muted); }
.range { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); }
.range button { min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: inherit; cursor: pointer; }
.range button[aria-pressed="true"] { background: var(--ink); color: #ffffff; font-weight: 600; }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
.tile { padding: 16px; border-radius: 16px; background: var(--panel); border: 1px solid var(--line); }
.tile h2 { margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--muted); }
.value { margin: 6px 0 4px; font-size: clamp(1.6rem, 3vw, 2rem); font-weight: 750; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.delta { margin: 0; font-size: 0.9rem; color: var(--muted); }
.delta.up::before { content: "\\2191  "; color: var(--paid); font-weight: 700; }
.delta.down::before { content: "\\2193  "; color: var(--refunded); font-weight: 700; }

.chart-card, .orders, .notes { padding: 18px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); }
.card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.card-head h2, .notes h2 { margin: 0; font-size: 1.15rem; letter-spacing: -0.01em; }
.legend { margin: 0; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); font-size: 0.9rem; }
.key { display: inline-block; width: 18px; height: 3px; border-radius: 3px; }
.key.now { background: var(--signal); }
.key.before { background: repeating-linear-gradient(90deg, var(--before) 0 4px, transparent 4px 7px); margin-left: 8px; }
.chart { position: relative; height: 240px; border-radius: 12px; }
.chart svg { width: 100%; height: 100%; display: block; overflow: visible; }
.grid line { stroke: var(--line); stroke-width: 1; }
.now { fill: none; stroke: var(--signal); stroke-width: 2.5; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.before { fill: none; stroke: var(--before); stroke-width: 1.5; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
.area { fill: var(--signal-soft); }
.cursor { stroke: var(--ink); stroke-width: 1; opacity: 0.25; vector-effect: non-scaling-stroke; }
.dot { fill: var(--panel); stroke: var(--signal); stroke-width: 3; vector-effect: non-scaling-stroke; }
/* The cursor and dot show only while someone reads the chart. */
.chart:not(.reading) .cursor, .chart:not(.reading) .dot { visibility: hidden; }
.readout { position: absolute; top: 8px; padding: 8px 10px; border-radius: 10px; background: var(--ink); color: #ffffff; font-size: 13px; pointer-events: none; white-space: nowrap; font-variant-numeric: tabular-nums; }

.table-tools { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.table-tools label { display: grid; gap: 4px; font-size: 0.9rem; color: var(--muted); }
.table-tools input, .table-tools select { min-height: 44px; min-width: 200px; border-radius: 12px; border: 1px solid var(--line); padding: 0 12px; font: inherit; font-size: 16px; color: var(--ink); background: var(--panel); }
.export { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--ink); background: var(--panel); font: inherit; font-weight: 600; cursor: pointer; }
.export:hover { background: var(--ink); color: #ffffff; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; min-width: 560px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); }
th { background: #f9fafb; font-size: 0.85rem; color: var(--muted); }
tbody tr:last-child td { border-bottom: 0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.sort { min-height: 44px; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; }
.sort[aria-sort]::after { content: "  \\25BE"; }
.sort[aria-sort="ascending"]::after { content: "  \\25B4"; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; font-size: 0.85rem; border: 1px solid; }
.pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.pill.paid { color: var(--paid); }
.pill.shipped { color: var(--shipped); border-style: dashed; }
.pill.refunded { color: var(--refunded); border-style: dotted; }
.pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
.pager p { margin: 0; color: var(--muted); }
.pager-buttons { display: flex; gap: 8px; }
.pager-buttons button { min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); font: inherit; cursor: pointer; }
.pager-buttons button:disabled { opacity: 0.45; cursor: not-allowed; }
.notes p { color: var(--muted); margin: 8px 0 0; }

/* Entrances wait for script.js (the .js class), so a page without scripts shows everything. */
.js .tile { opacity: 0; transform: translateY(10px); }
.js .tile.seen { opacity: 1; transform: none; transition: opacity 420ms ease-out, transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.now.draw { animation: draw 900ms cubic-bezier(0.3, 0.7, 0.2, 1) both; }
@keyframes draw { from { stroke-dasharray: 1600; stroke-dashoffset: 1600; } to { stroke-dasharray: 1600; stroke-dashoffset: 0; } }

@media (max-width: 820px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  .side { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 10px; }
  .side nav { grid-auto-flow: column; }
  .side-note { margin: 0; width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .tile { opacity: 1; transform: none; }
}
`;

const SCRIPT = `document.documentElement.classList.add("js");

(function () {
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Sample data, the same each visit: a seeded random, so nothing is fetched.
  var seed = 7;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var DAYS = 180;
  var revenue = [];
  for (var i = 0; i < DAYS; i++) {
    var weekly = 1 + 0.25 * Math.sin((i / 7) * Math.PI * 2);
    var trend = 380 + i * 1.6;
    revenue.push(Math.round(trend * weekly * (0.8 + rand() * 0.4)));
  }
  var FIRST = ["Amaya", "Jonah", "Lena", "Ravi", "Mei", "Tomas", "Ines", "Kofi", "Sara", "Dev", "Noor", "Hugo"];
  var LAST = ["Perera", "Field", "Ortiz", "Shah", "Chen", "Berg", "Silva", "Mensah", "Ali", "Rao", "Haddad", "Lind"];
  var STATUSES = ["paid", "shipped", "shipped", "paid", "refunded"];
  var orders = [];
  for (var n = 0; n < 64; n++) {
    var daysAgo = Math.floor(n / 3);
    orders.push({
      id: 1042 - n,
      customer: FIRST[Math.floor(rand() * FIRST.length)] + " " + LAST[Math.floor(rand() * LAST.length)],
      daysAgo: daysAgo,
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
      total: Math.round((12 + rand() * 90) * 100) / 100
    });
  }

  function money(v, cents) { return "$" + v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }); }
  function change(now, before) {
    if (!before) return { text: "No period before to compare", cls: "" };
    var p = Math.round(((now - before) / before) * 100);
    if (p === 0) return { text: "Same as the period before", cls: "" };
    return { text: (p > 0 ? "Up " : "Down ") + Math.abs(p) + "% on the period before", cls: p > 0 ? "up" : "down" };
  }
  function dayLabel(ago) {
    if (ago === 0) return "Today";
    if (ago === 1) return "Yesterday";
    var d = new Date();
    d.setDate(d.getDate() - ago);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Tiles and the chart for a range.
  var range = 30;
  var series = [];
  var chart = document.getElementById("chart");
  var W = 720, H = 240, PAD = 14;
  function path(values, max) {
    return values.map(function (v, k) {
      var x = (k / (values.length - 1)) * W;
      var y = H - PAD - (v / max) * (H - PAD * 2);
      return (k ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
  }
  function draw() {
    var now = revenue.slice(DAYS - range);
    var before = revenue.slice(DAYS - range * 2, DAYS - range);
    series = now;
    var max = Math.max.apply(null, now.concat(before)) * 1.08;
    var grid = document.getElementById("grid");
    grid.innerHTML = "";
    for (var g = 1; g < 4; g++) {
      var l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      var y = (H / 4) * g;
      l.setAttribute("x1", "0"); l.setAttribute("x2", String(W)); l.setAttribute("y1", String(y)); l.setAttribute("y2", String(y));
      grid.appendChild(l);
    }
    var line = path(now, max);
    document.getElementById("line-now").setAttribute("d", line);
    document.getElementById("line-before").setAttribute("d", path(before, max));
    document.getElementById("area").setAttribute("d", line + " L" + W + " " + H + " L0 " + H + " Z");
    var lineEl = document.getElementById("line-now");
    if (!still) { lineEl.classList.remove("draw"); void lineEl.getBoundingClientRect(); lineEl.classList.add("draw"); }

    var sum = function (a) { return a.reduce(function (s, v) { return s + v; }, 0); };
    var revNow = sum(now), revBefore = sum(before);
    var ordNow = Math.round(revNow / 44.7), ordBefore = Math.round(revBefore / 45.6);
    var set = function (id, text) { document.getElementById(id).textContent = text; };
    var put = function (id, c) { var el = document.getElementById(id); el.textContent = c.text; el.className = "delta " + c.cls; };
    set("t-revenue", money(revNow));
    put("d-revenue", change(revNow, revBefore));
    set("t-orders", ordNow.toLocaleString("en-US"));
    put("d-orders", change(ordNow, ordBefore));
    set("t-aov", money(revNow / ordNow, true));
    put("d-aov", change(revNow / ordNow, revBefore / ordBefore));
    set("t-refunds", (1.6 + (range % 7) / 10).toFixed(1) + "%");
    put("d-refunds", { text: "Sample figure", cls: "" });
    hide();
  }

  // The readout, by pointer or by arrow keys.
  var at = -1;
  function show(k) {
    if (!series.length) return;
    at = Math.max(0, Math.min(series.length - 1, k));
    var x = (at / (series.length - 1)) * W;
    var max = Math.max.apply(null, revenue.slice(DAYS - range * 2)) * 1.08;
    var y = H - PAD - (series[at] / max) * (H - PAD * 2);
    var cursor = document.getElementById("cursor");
    cursor.setAttribute("x1", String(x)); cursor.setAttribute("x2", String(x));
    var dot = document.getElementById("dot");
    dot.setAttribute("cx", String(x)); dot.setAttribute("cy", String(y));
    chart.classList.add("reading");
    var r = document.getElementById("readout");
    r.hidden = false;
    r.textContent = dayLabel(series.length - 1 - at) + ": " + money(series[at]);
    var px = (x / W) * chart.clientWidth;
    r.style.left = Math.min(Math.max(px - 60, 4), chart.clientWidth - 150) + "px";
  }
  function hide() {
    at = -1;
    chart.classList.remove("reading");
    document.getElementById("readout").hidden = true;
  }
  chart.addEventListener("pointermove", function (e) {
    var box = chart.getBoundingClientRect();
    show(Math.round(((e.clientX - box.left) / box.width) * (series.length - 1)));
  });
  chart.addEventListener("pointerleave", hide);
  chart.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      show(at < 0 ? series.length - 1 : at + (e.key === "ArrowRight" ? 1 : -1));
    } else if (e.key === "Escape") hide();
  });
  chart.addEventListener("blur", hide);

  Array.prototype.forEach.call(document.querySelectorAll("[data-range]"), function (b, _, all) {
    b.addEventListener("click", function () {
      range = Number(b.dataset.range);
      Array.prototype.forEach.call(all, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      draw();
    });
  });

  // The orders table.
  var PAGE = 10;
  var page = 0;
  var sortKey = "date";
  var sortDir = -1;
  var rows = document.getElementById("rows");
  function filtered() {
    var q = document.getElementById("search").value.trim().toLowerCase();
    var st = document.getElementById("status").value;
    var list = orders.filter(function (o) {
      return (st === "all" || o.status === st) && (!q || o.customer.toLowerCase().indexOf(q) >= 0 || ("#" + o.id).indexOf(q) >= 0);
    });
    list.sort(function (a, b) {
      var va = sortKey === "date" ? -a.daysAgo : sortKey === "id" ? a.id : sortKey === "total" ? a.total : a[sortKey];
      var vb = sortKey === "date" ? -b.daysAgo : sortKey === "id" ? b.id : sortKey === "total" ? b.total : b[sortKey];
      return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
    });
    return list;
  }
  function table() {
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.min(page, pages - 1);
    rows.innerHTML = "";
    list.slice(page * PAGE, page * PAGE + PAGE).forEach(function (o) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td></td><td></td><td></td><td><span></span></td><td class=\\"num\\"></td>";
      tr.children[0].textContent = "#" + o.id;
      tr.children[1].textContent = o.customer;
      tr.children[2].textContent = dayLabel(o.daysAgo);
      var pill = tr.children[3].firstChild;
      pill.className = "pill " + o.status;
      pill.textContent = o.status.charAt(0).toUpperCase() + o.status.slice(1);
      tr.children[4].textContent = money(o.total, true);
      rows.appendChild(tr);
    });
    if (!list.length) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td colspan=\\"5\\">No orders match.</td>";
      rows.appendChild(tr);
    }
    document.getElementById("page-info").textContent = list.length ? "Showing " + (page * PAGE + 1) + " to " + Math.min(list.length, page * PAGE + PAGE) + " of " + list.length : "Showing 0 of 0";
    document.getElementById("prev").disabled = page === 0;
    document.getElementById("next").disabled = page >= pages - 1;
  }
  document.getElementById("search").addEventListener("input", function () { page = 0; table(); });
  document.getElementById("status").addEventListener("change", function () { page = 0; table(); });
  document.getElementById("prev").addEventListener("click", function () { page -= 1; table(); });
  document.getElementById("next").addEventListener("click", function () { page += 1; table(); });
  Array.prototype.forEach.call(document.querySelectorAll(".sort"), function (b, _, all) {
    b.addEventListener("click", function () {
      var key = b.dataset.sort;
      sortDir = key === sortKey ? -sortDir : key === "date" || key === "total" ? -1 : 1;
      sortKey = key;
      Array.prototype.forEach.call(all, function (x) { if (x === b) x.setAttribute("aria-sort", sortDir > 0 ? "ascending" : "descending"); else x.removeAttribute("aria-sort"); });
      table();
    });
  });

  // Export what the table shows now, every page of it.
  document.getElementById("export").addEventListener("click", function () {
    var cell = function (v) { var s = String(v); if (/^[=+\\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    var csv = [["order", "customer", "date", "status", "total"].map(cell).join(",")].concat(filtered().map(function (o) {
      return ["#" + o.id, o.customer, dayLabel(o.daysAgo), o.status, o.total.toFixed(2)].map(cell).join(",");
    })).join("\\r\\n");
    var link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "orders-sample.csv";
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 0);
  });

  // Tiles rise in once.
  var tiles = Array.prototype.slice.call(document.querySelectorAll(".tile"));
  tiles.forEach(function (t, k) { setTimeout(function () { t.classList.add("seen"); }, still ? 0 : 60 * k); });

  draw();
  table();
})();
`;

const DESIGN = `# Design plan: Ledgerly (sample shop dashboard)

Built to the Studio standard. Sample data: every person, order and amount is invented in the page. Replace it with your own data source.

## Palette

- Canvas #f5f6f8 and panels #ffffff; the sidebar is ink #101418.
- Muted #59616e for labels and secondary text.
- Signal #e4572e is the one accent: this period's line, the focus ring and the chart's readout dot. The period before is a grey dashed line.
- Order states have their own colour and border pattern (solid, dashed, dotted), so colour is never the only signal.

## Type

- System sans (system-ui) throughout, tightly tracked for headings and big numbers.
- Tabular figures for every number, so columns and tiles line up.

## Layout

- A dark sidebar with the sections; on phones it folds into a top bar.
- Four tiles for the numbers that matter, then the revenue chart, then the orders table with its tools.
- The table scrolls sideways inside its frame on small screens; the page never does.

## Signature

The revenue chart: this period against the one before, drawn in SVG, with a readout that follows the pointer, or the arrow keys when the chart has focus.

## Motion

- Tiles rise in, one after another.
- The revenue line draws itself when the range changes.
- Under reduced motion, everything is still and fully visible.
`;

const README = `# Ledgerly (sample shop dashboard)

A sample admin dashboard made with Farbaek. Every number is sample data made in the page.

- \`index.html\`: the layout, tiles, chart frame and table.
- \`styles.css\`: the look.
- \`script.js\`: the sample data, the chart with its range and readout, and the orders table with search, filter, sorting, pages and CSV export.
- \`DESIGN.md\`: the design plan.

Ask Farbaek to connect your real data (a spreadsheet, a database or your shop's API) when you're ready.
`;

export const DASHBOARD_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];
