/**
 * Template: an online store (a ceramics studio), built to the Studio
 * standard (ADR 0030, ADR 0124). Every product is a drawn vessel in its own
 * glaze, so nothing is fetched. A catalogue you can filter and sort, a cart
 * drawer with quantity steppers, a free-delivery progress line and a cart
 * kept between visits. Checkout is a sample and says so. Previews instantly
 * and is complete without JavaScript.
 */
import type { StarterFile } from "../types";

type Kind = "vase" | "bowl" | "cup";
const PRODUCTS: { id: string; kind: Kind; name: string; note: string; price: number; glaze: string; deep: string; badge?: string }[] = [
  { id: "tide-vase", kind: "vase", name: "Tide vase", note: "Cobalt over porcelain, 24 cm.", price: 64, glaze: "#2f52c4", deep: "#1b2f7a", badge: "Bestseller" },
  { id: "moss-bowl", kind: "bowl", name: "Moss bowl", note: "Celadon, wide and shallow, 18 cm.", price: 38, glaze: "#7fae9b", deep: "#4f7d6c" },
  { id: "ember-cup", kind: "cup", name: "Ember cup", note: "Iron red rim, holds 240 ml.", price: 22, glaze: "#c4553a", deep: "#7d2f1f" },
  { id: "salt-vase", kind: "vase", name: "Salt vase", note: "Ash white with a speckled foot, 31 cm.", price: 88, glaze: "#e9ecef", deep: "#a9b1bb" },
  { id: "dusk-bowl", kind: "bowl", name: "Dusk bowl", note: "Plum to slate, deep, 14 cm.", price: 34, glaze: "#6c5a9c", deep: "#3d3166", badge: "New" },
  { id: "pine-cup", kind: "cup", name: "Pine cup", note: "Forest green, double-dipped, 200 ml.", price: 20, glaze: "#2e6b4f", deep: "#1a4232" },
  { id: "noon-vase", kind: "vase", name: "Noon vase", note: "Ochre glaze, tall and narrow, 28 cm.", price: 72, glaze: "#d6a23a", deep: "#8f6618" },
  { id: "rain-bowl", kind: "bowl", name: "Rain bowl", note: "Blue-grey crackle, nests in threes.", price: 46, glaze: "#8ea3b8", deep: "#55697d" },
];

const SHAPES: Record<Kind, string> = {
  vase: `<path class="body" d="M44 18h32v8c0 6 10 10 14 24 4 16 2 36-6 52-4 8-12 12-24 12s-20-4-24-12c-8-16-10-36-6-52 4-14 14-18 14-24z" /><path class="drip" d="M30 50c4-14 14-18 14-24v-8h32v8c0 6 10 10 14 24-6 4-8 14-14 10s-6-14-12-10-6 16-12 12-4-14-10-10-6 4-12-2z" /><ellipse class="foot" cx="60" cy="114" rx="22" ry="3" />`,
  bowl: `<path class="body" d="M14 52h92c0 30-20 52-46 52S14 82 14 52z" /><path class="drip" d="M14 52h92c-1 8-3 14-6 20-6-2-8 8-14 6s-4-10-10-8-6 12-12 10-4-10-10-8-6 10-12 8-6-10-12-8c-6-4-9-11-10-20z" /><ellipse class="rim" cx="60" cy="52" rx="46" ry="7" /><ellipse class="foot" cx="60" cy="106" rx="18" ry="3" />`,
  cup: `<path class="body" d="M28 34h56l-4 62c-1 8-8 12-24 12s-23-4-24-12z" /><path class="handle" d="M84 50c14 0 18 8 18 16s-6 16-20 16" /><path class="drip" d="M28 34h56l-1 18c-5-1-6 8-11 6s-4-8-9-7-5 9-10 7-4-8-9-7-5 7-10 5z" /><ellipse class="foot" cx="56" cy="110" rx="18" ry="2.5" />`,
};

const money = (n: number) => `$${n}`;
const productCards = PRODUCTS.map(
  (p) => `          <li class="product" data-kind="${p.kind}" data-price="${p.price}" data-id="${p.id}" style="--glaze: ${p.glaze}; --deep: ${p.deep}">
            <figure class="vessel">
              <svg viewBox="0 0 120 120" role="img" aria-label="${p.name}, drawn">${SHAPES[p.kind]}</svg>
              ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
            </figure>
            <div class="product-text">
              <h3>${p.name}</h3>
              <p>${p.note}</p>
            </div>
            <div class="product-buy">
              <span class="price">${money(p.price)}</span>
              <button type="button" class="add" data-add="${p.id}" data-name="${p.name}" data-price="${p.price}">Add to cart</button>
            </div>
          </li>`,
).join("\n");

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Glaze and Kiln, handmade ceramics (sample store)</title>
    <meta name="description" content="A sample online store for a small ceramics studio: vases, bowls and cups, each made by hand." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#shop">Skip to the shop</a>
    <header class="top">
      <a class="brand" href="#top" aria-label="Glaze and Kiln, home"><span class="mark" aria-hidden="true"></span>Glaze and Kiln</a>
      <nav aria-label="Main">
        <a href="#shop">Shop</a>
        <a href="#studio">Studio</a>
        <a href="#care">Care</a>
      </nav>
      <button type="button" class="cart-button" id="open-cart" aria-haspopup="dialog" aria-controls="cart">
        Cart <span class="count" id="cart-count" aria-live="polite">0</span>
      </button>
    </header>

    <main id="top">
      <section class="hero">
        <div class="hero-text">
          <p class="sample-note">Sample store: products, prices and stock are examples.</p>
          <h1>Made slowly, by hand, in small firings.</h1>
          <p class="lede">Vases, bowls and cups thrown on the wheel and glazed in our studio. Each one is a little different from the last.</p>
          <a class="cta" href="#shop">See this firing</a>
        </div>
        <div class="hero-art" aria-hidden="true">
          <svg viewBox="0 0 120 120" class="hero-vessel" style="--glaze: #2f52c4; --deep: #1b2f7a">${SHAPES.vase}</svg>
          <svg viewBox="0 0 120 120" class="hero-vessel small" style="--glaze: #7fae9b; --deep: #4f7d6c">${SHAPES.bowl}</svg>
        </div>
      </section>

      <section id="shop" class="shop" aria-labelledby="shop-title">
        <div class="shop-head">
          <h2 id="shop-title">This firing</h2>
          <div class="controls">
            <div class="filters" role="group" aria-label="Show">
              <button type="button" class="filter" data-filter="all" aria-pressed="true">All</button>
              <button type="button" class="filter" data-filter="vase" aria-pressed="false">Vases</button>
              <button type="button" class="filter" data-filter="bowl" aria-pressed="false">Bowls</button>
              <button type="button" class="filter" data-filter="cup" aria-pressed="false">Cups</button>
            </div>
            <label class="sort">Sort
              <select id="sort">
                <option value="featured">Featured</option>
                <option value="low">Price, low to high</option>
                <option value="high">Price, high to low</option>
              </select>
            </label>
          </div>
        </div>
        <ul class="grid" id="products">
${productCards}
        </ul>
        <p class="empty" id="empty" hidden>Nothing in this group right now.</p>
      </section>

      <section id="studio" class="studio" aria-labelledby="studio-title">
        <h2 id="studio-title">From the studio</h2>
        <p>Two potters, one kiln and a lot of patience. We fire every three weeks, so this page changes with each firing. When a piece is gone, it's gone.</p>
      </section>

      <section id="care" class="care" aria-labelledby="care-title">
        <h2 id="care-title">Care</h2>
        <ul>
          <li><strong>Food safe:</strong> every glaze is lead free and food safe.</li>
          <li><strong>Dishwasher:</strong> fine for cups and bowls; wash vases by hand.</li>
          <li><strong>Delivery:</strong> packed in paper, free on orders over $60.</li>
        </ul>
      </section>
    </main>

    <dialog id="cart" class="cart" aria-labelledby="cart-title">
      <div class="cart-inner">
        <div class="cart-head">
          <h2 id="cart-title">Your cart</h2>
          <button type="button" class="close" id="close-cart" aria-label="Close the cart">Close</button>
        </div>
        <div class="ship" aria-live="polite">
          <p id="ship-text">Add $60 for free delivery.</p>
          <div class="ship-bar" aria-hidden="true"><span id="ship-fill"></span></div>
        </div>
        <ul class="lines" id="lines"></ul>
        <p class="cart-empty" id="cart-empty">Your cart is empty.</p>
        <div class="cart-foot">
          <p class="subtotal">Subtotal <strong id="subtotal">$0</strong></p>
          <button type="button" class="checkout" id="checkout">Checkout</button>
          <p class="checkout-note" id="checkout-note" hidden>This is a sample store, so checkout isn't connected. Ask Farbaek to connect payments when you're ready to sell.</p>
        </div>
      </div>
    </dialog>

    <footer class="foot">
      <p>Glaze and Kiln is a sample store made with Farbaek. Products, prices and stock are sample content.</p>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `:root {
  --porcelain: #f4f6f8;
  --paper: #ffffff;
  --ink: #121722;
  --slate: #4f5869;
  --line: #dde2e8;
  --cobalt: #2340a8;
  --cobalt-deep: #172c78;
  --clay: #c9b8a6;
  --radius: 18px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
  background: var(--porcelain);
}
* { box-sizing: border-box; }
body { margin: 0; line-height: 1.5; }
a { color: inherit; }
:focus-visible { outline: 3px solid var(--cobalt); outline-offset: 3px; border-radius: 6px; }
.skip { position: absolute; left: -999px; top: 8px; background: var(--paper); padding: 10px 14px; border-radius: 999px; }
.skip:focus { left: 12px; z-index: 30; }

.top { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 18px; padding: 14px clamp(16px, 4vw, 40px); background: rgba(244, 246, 248, 0.86); backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid var(--line); }
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -0.02em; text-decoration: none; min-height: 44px; }
.mark { width: 22px; height: 22px; border-radius: 50% 50% 46% 46%; background: radial-gradient(circle at 35% 30%, #6f8ff0, var(--cobalt) 55%, var(--cobalt-deep)); }
.top nav { display: flex; gap: 4px; margin-left: auto; }
.top nav a { text-decoration: none; padding: 10px 12px; border-radius: 999px; color: var(--slate); min-height: 44px; display: inline-flex; align-items: center; }
.top nav a:hover { color: var(--ink); background: var(--paper); }
.cart-button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); font: inherit; font-weight: 600; cursor: pointer; }
.count { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 999px; background: var(--paper); color: var(--ink); font-size: 13px; font-variant-numeric: tabular-nums; }
.count.bump { animation: bump 380ms cubic-bezier(0.2, 1.6, 0.4, 1); }
@keyframes bump { 40% { transform: scale(1.35); } }

.hero { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: clamp(24px, 5vw, 64px); align-items: center; padding: clamp(40px, 8vw, 96px) clamp(16px, 4vw, 40px); max-width: 1180px; margin: 0 auto; }
.sample-note { display: inline-block; margin: 0 0 18px; padding: 6px 12px; border-radius: 999px; border: 1px dashed var(--slate); color: var(--slate); font-size: 14px; }
.hero h1 { margin: 0; font-size: clamp(2.4rem, 6vw, 4.6rem); line-height: 1.02; letter-spacing: -0.045em; font-weight: 800; max-width: 12ch; }
.lede { font-size: clamp(1.05rem, 2vw, 1.25rem); color: var(--slate); max-width: 46ch; margin: 22px 0 30px; }
.cta { display: inline-flex; align-items: center; min-height: 48px; padding: 0 22px; border-radius: 999px; background: var(--cobalt); color: var(--paper); text-decoration: none; font-weight: 600; }
.cta:hover { background: var(--cobalt-deep); }
/* A soft ground shadow drawn with a gradient: no CSS filters, which paint a black square on some phones. */
.hero-art { position: relative; aspect-ratio: 1; background: radial-gradient(ellipse 46% 9% at 42% 93%, rgba(23, 44, 120, 0.16), transparent 70%); }
.hero-vessel { position: absolute; width: 72%; left: 6%; top: 4%; }
.hero-vessel.small { width: 46%; left: 50%; top: 52%; }

.vessel svg .body { fill: var(--glaze); }
.vessel svg .drip, svg .drip { fill: var(--deep); opacity: 0.55; }
svg .body { fill: var(--glaze); }
svg .rim { fill: var(--deep); opacity: 0.35; }
svg .foot { fill: var(--clay); }
svg .handle { fill: none; stroke: var(--glaze); stroke-width: 7; stroke-linecap: round; }

.shop { max-width: 1180px; margin: 0 auto; padding: 24px clamp(16px, 4vw, 40px) 64px; }
.shop-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.shop-head h2, .studio h2, .care h2 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.2rem); letter-spacing: -0.03em; }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.filters { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); }
.filter { min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--slate); font: inherit; cursor: pointer; }
.filter[aria-pressed="true"] { background: var(--ink); color: var(--paper); font-weight: 600; }
.sort { display: inline-flex; align-items: center; gap: 8px; color: var(--slate); }
.sort select { min-height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--paper); padding: 0 12px; font: inherit; font-size: 16px; color: var(--ink); }

.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 18px; }
.product { display: grid; grid-template-rows: auto 1fr auto; gap: 12px; padding: 14px; border-radius: var(--radius); background: var(--paper); border: 1px solid var(--line); transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 260ms; }
.product:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(18, 23, 34, 0.08); }
.vessel { position: relative; margin: 0; aspect-ratio: 1; border-radius: 12px; display: grid; place-items: center; background: radial-gradient(circle at 50% 60%, color-mix(in oklab, var(--glaze) 12%, white), var(--porcelain) 70%); }
.vessel svg { width: 74%; transition: transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.product:hover .vessel svg { transform: rotate(-4deg) scale(1.04); }
.badge { position: absolute; top: 10px; left: 10px; padding: 4px 10px; border-radius: 999px; background: var(--ink); color: var(--paper); font-size: 12px; font-weight: 600; }
.product-text h3 { margin: 0; font-size: 1.1rem; letter-spacing: -0.01em; }
.product-text p { margin: 4px 0 0; color: var(--slate); font-size: 0.95rem; }
.product-buy { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.price { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 1.05rem; }
.add { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--ink); background: var(--paper); font: inherit; font-weight: 600; cursor: pointer; }
.add:hover { background: var(--ink); color: var(--paper); }
.add.added { background: var(--cobalt); border-color: var(--cobalt); color: var(--paper); }
.product[hidden] { display: none; }
.empty { color: var(--slate); }

.studio, .care { max-width: 760px; margin: 0 auto; padding: 32px clamp(16px, 4vw, 40px); }
.studio p { font-size: 1.1rem; color: var(--slate); }
.care ul { padding-left: 1.1rem; color: var(--slate); }
.care li { margin: 8px 0; }

.cart { border: 0; padding: 0; margin: 0 0 0 auto; width: min(420px, 100vw); max-width: 100vw; height: 100dvh; max-height: 100dvh; background: var(--paper); color: var(--ink); }
.cart::backdrop { background: rgba(18, 23, 34, 0.42); }
.cart-inner { display: grid; grid-template-rows: auto auto 1fr auto; height: 100%; padding: 20px; gap: 14px; }
.cart-head { display: flex; justify-content: space-between; align-items: center; }
.cart-head h2 { margin: 0; font-size: 1.4rem; }
.close { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper); font: inherit; cursor: pointer; }
.ship p { margin: 0 0 8px; color: var(--slate); font-size: 0.95rem; }
.ship-bar { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden; }
.ship-bar span { display: block; height: 100%; width: 0; background: var(--cobalt); border-radius: inherit; transition: width 360ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.lines { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: grid; align-content: start; gap: 10px; }
.line { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; }
.line strong { display: block; }
.line small { color: var(--slate); font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.stepper { display: inline-flex; align-items: center; gap: 4px; }
.stepper button { width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper); font: inherit; font-size: 1.1rem; cursor: pointer; }
.stepper output { min-width: 28px; text-align: center; font-variant-numeric: tabular-nums; }
.cart-empty { color: var(--slate); margin: 0; }
.cart-foot { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 14px; }
.subtotal { display: flex; justify-content: space-between; margin: 0; font-size: 1.05rem; }
.subtotal strong { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.checkout { min-height: 48px; border-radius: 999px; border: 0; background: var(--cobalt); color: var(--paper); font: inherit; font-weight: 700; cursor: pointer; }
.checkout:disabled { opacity: 0.45; cursor: not-allowed; }
.checkout-note { margin: 0; padding: 12px; border-radius: 12px; border: 1px dashed var(--slate); color: var(--slate); font-size: 0.95rem; }

.fly { position: fixed; z-index: 40; width: 14px; height: 14px; border-radius: 50%; background: var(--cobalt); pointer-events: none; }

.foot { padding: 32px clamp(16px, 4vw, 40px) 48px; color: var(--slate); text-align: center; font-size: 0.95rem; border-top: 1px solid var(--line); }

/* Entrances wait for script.js (the .js class), so a page without scripts shows everything. */
.js .product { opacity: 0; transform: translateY(18px); }
.js .product.seen { opacity: 1; transform: none; transition: opacity 520ms ease-out, transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1); }

@media (max-width: 760px) {
  .hero { grid-template-columns: 1fr; }
  .hero-art { max-width: 320px; }
  .top nav { display: none; }
  .cart-button { margin-left: auto; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .product { opacity: 1; transform: none; }
  .product:hover, .product:hover .vessel svg { transform: none; }
}
`;

const SCRIPT = `document.documentElement.classList.add("js");

(function () {
  var KEY = "glaze-and-kiln-sample-cart";
  var FREE_FROM = 60;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var grid = document.getElementById("products");
  var products = Array.prototype.slice.call(grid.querySelectorAll(".product"));
  var order = products.slice();
  var dialog = document.getElementById("cart");
  var count = document.getElementById("cart-count");
  var lines = document.getElementById("lines");

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  var cart = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
  }
  function info(id) {
    var el = grid.querySelector('[data-id="' + id + '"]');
    return el ? { name: el.querySelector("h3").textContent, price: Number(el.dataset.price) } : null;
  }

  // Entrances, once each card is on screen.
  if ("IntersectionObserver" in window && !still) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("seen"); seen.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    products.forEach(function (p) { seen.observe(p); });
  } else {
    products.forEach(function (p) { p.classList.add("seen"); });
  }

  // Filters and sorting.
  var filter = "all";
  var filters = Array.prototype.slice.call(document.querySelectorAll(".filter"));
  function show() {
    var visible = 0;
    products.forEach(function (p) {
      var on = filter === "all" || p.dataset.kind === filter;
      p.hidden = !on;
      if (on) { visible += 1; p.classList.add("seen"); }
    });
    document.getElementById("empty").hidden = visible > 0;
  }
  filters.forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.dataset.filter;
      filters.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      show();
    });
  });
  document.getElementById("sort").addEventListener("change", function (e) {
    var how = e.target.value;
    var sorted = how === "featured" ? order.slice() : products.slice().sort(function (a, b) {
      return how === "low" ? a.dataset.price - b.dataset.price : b.dataset.price - a.dataset.price;
    });
    sorted.forEach(function (p) { grid.appendChild(p); });
  });

  // The cart.
  function render() {
    var ids = Object.keys(cart).filter(function (id) { return cart[id] > 0 && info(id); });
    var items = 0;
    var total = 0;
    lines.innerHTML = "";
    ids.forEach(function (id) {
      var p = info(id);
      var q = cart[id];
      items += q;
      total += q * p.price;
      var li = document.createElement("li");
      li.className = "line";
      li.innerHTML =
        "<div><strong></strong><small></small></div>" +
        '<div class="stepper"><button type="button" data-step="-1"></button><output></output><button type="button" data-step="1"></button></div>';
      li.querySelector("strong").textContent = p.name;
      li.querySelector("small").textContent = "$" + p.price + " each";
      li.querySelector("output").textContent = String(q);
      var minus = li.querySelector('[data-step="-1"]');
      var plus = li.querySelector('[data-step="1"]');
      minus.textContent = "-";
      plus.textContent = "+";
      minus.setAttribute("aria-label", "One fewer " + p.name);
      plus.setAttribute("aria-label", "One more " + p.name);
      minus.addEventListener("click", function () { cart[id] = Math.max(0, q - 1); if (!cart[id]) delete cart[id]; save(); render(); });
      plus.addEventListener("click", function () { cart[id] = Math.min(20, q + 1); save(); render(); });
      lines.appendChild(li);
    });
    count.textContent = String(items);
    document.getElementById("subtotal").textContent = "$" + total;
    document.getElementById("cart-empty").hidden = items > 0;
    document.getElementById("checkout").disabled = items === 0;
    var left = Math.max(0, FREE_FROM - total);
    document.getElementById("ship-text").textContent = left > 0 ? "Add $" + left + " for free delivery." : "Free delivery on this order.";
    document.getElementById("ship-fill").style.width = Math.min(100, (total / FREE_FROM) * 100) + "%";
  }

  function fly(from) {
    if (still || !from.animate) return;
    var a = from.getBoundingClientRect();
    var b = document.getElementById("open-cart").getBoundingClientRect();
    var dot = document.createElement("span");
    dot.className = "fly";
    dot.style.left = a.left + a.width / 2 - 7 + "px";
    dot.style.top = a.top + a.height / 2 - 7 + "px";
    document.body.appendChild(dot);
    var dx = b.left + b.width / 2 - (a.left + a.width / 2);
    var dy = b.top + b.height / 2 - (a.top + a.height / 2);
    dot.animate(
      [{ transform: "translate(0, 0) scale(1)" }, { transform: "translate(" + dx * 0.5 + "px," + (dy - 120) + "px) scale(1.2)" }, { transform: "translate(" + dx + "px," + dy + "px) scale(0.4)" }],
      { duration: 620, easing: "cubic-bezier(0.3, 0.6, 0.3, 1)" }
    ).onfinish = function () { dot.remove(); };
  }

  Array.prototype.slice.call(document.querySelectorAll("[data-add]")).forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.dataset.add;
      cart[id] = Math.min(20, (cart[id] || 0) + 1);
      save();
      render();
      fly(b);
      b.classList.add("added");
      b.textContent = "Added";
      setTimeout(function () { b.classList.remove("added"); b.textContent = "Add to cart"; }, 1400);
      if (!still) { count.classList.remove("bump"); void count.offsetWidth; count.classList.add("bump"); }
    });
  });

  document.getElementById("open-cart").addEventListener("click", function () {
    document.getElementById("checkout-note").hidden = true;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
  });
  document.getElementById("close-cart").addEventListener("click", function () {
    if (dialog.close) dialog.close(); else dialog.removeAttribute("open");
  });
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog && dialog.close) dialog.close();
  });
  document.getElementById("checkout").addEventListener("click", function () {
    document.getElementById("checkout-note").hidden = false;
  });

  render();
})();
`;

const DESIGN = `# Design plan: Glaze and Kiln (sample online store)

Built to the Studio standard. Sample content: replace the products, prices and copy with your own.

## Palette

- Porcelain #f4f6f8 for the page, paper #ffffff for cards.
- Ink #121722 for text and the cart button; slate #4f5869 for secondary text.
- Cobalt #2340a8 is the one accent: the main call to action, checkout and the free-delivery line.
- Each product carries its own glaze (two values: the glaze and a deeper drip), so colour belongs to the work, not the chrome.

## Type

- System sans (system-ui) throughout, heavy and tightly tracked for headings.
- Monospace for prices and per-item amounts, so numbers line up.

## Layout

- A split hero: the claim on the left, two drawn vessels on the right. Stacks on phones.
- The shop: a heading with filters and sort, then an auto-filling grid of product cards.
- The cart is a drawer from the right (a native dialog), with the delivery progress at the top and the total at the bottom.

## Signature

Every product is a drawn vessel (an SVG vase, bowl or cup) in its own glaze with a darker drip. Nothing is photographed or fetched, and swapping a product's two glaze values changes its look.

## Motion

- Cards rise in once as they come on screen.
- Hovering a card lifts it and tilts its vessel.
- Adding to the cart sends a dot along an arc to the cart button, which bumps its count.
- Under reduced motion, everything is still and fully visible.
`;

const README = `# Glaze and Kiln (sample store)

A sample online store made with Farbaek. Everything here is sample content.

- \`index.html\`: the page.
- \`styles.css\`: the look. Each product's glaze is set on its card with \`--glaze\` and \`--deep\`.
- \`script.js\`: filters, sorting and the cart, kept in this browser between visits.
- \`DESIGN.md\`: the design plan.

Checkout is a sample and isn't connected to payments. Ask Farbaek to connect a payment provider when you're ready to sell.
`;

export const ONLINE_STORE_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];
