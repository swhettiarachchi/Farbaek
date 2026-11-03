/**
 * Template: a concept store, the premium direction for shops (ADR 0160):
 * built on the Farbaek Studio kit in its bloom look, light by default, with
 * the store craft from the "Shop and product pages" skill. A promo bar of
 * true messages, an editorial hero that rotates three stories and pauses,
 * category pills and sorting that really filter the page, product cards
 * whose button says what's missing ("Select a size"), a wishlist, and a bag
 * drawer with a free-delivery line that remembers what's in it. Real photos
 * in replaceable slots; the 3D moment is the fanned edit and the tilting
 * product photos. Checkout says plainly that it isn't connected. Sample
 * content throughout; the page is complete without JavaScript.
 */
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

type Cat = "clothing" | "objects" | "scent" | "jewellery";
const CAT_LABEL: Record<Cat, string> = { clothing: "Clothing", objects: "Objects", scent: "Scent", jewellery: "Jewellery" };

interface Product {
  id: string;
  cat: Cat;
  name: string;
  note: string;
  price: number;
  was?: number;
  photo: string;
  alt: string;
  sizes?: string[];
  soldOut?: string[];
  isNew?: boolean;
}

const PRODUCTS: Product[] = [
  { id: "linen-shirt", cat: "clothing", name: "Washed linen shirt", note: "Relaxed fit, mother-of-pearl buttons", price: 8900, photo: "1490481651871-ab68de25d43d", alt: "Light linen shirts hanging on a rail against a pale wall", sizes: ["XS", "S", "M", "L"], soldOut: ["M"], isNew: true },
  { id: "merino-knit", cat: "clothing", name: "Merino crew knit", note: "Fine gauge, in oat and charcoal", price: 12500, photo: "1558769132-cb1aea458c5e", alt: "Neutral knitwear and coats on a rail beside dried pampas grass", sizes: ["S", "M", "L"] },
  { id: "sea-glass", cat: "scent", name: "Sea Glass, 50 ml", note: "Salt, fig leaf and vetiver", price: 14500, photo: "1793707758252-09808b33d1e9", alt: "A blue glass perfume bottle against a pale blue sky", isNew: true },
  { id: "stacking-rings", cat: "jewellery", name: "Stacking rings, set of three", note: "Recycled 14k gold", price: 18000, photo: "1543294001-f7cd5d7fb516", alt: "Gold rings set with small stones resting on white cloth", sizes: ["6", "7", "8"] },
  { id: "weekend-coat", cat: "clothing", name: "Weekend coat", note: "Boiled wool, dropped shoulder", price: 24000, was: 30000, photo: "1603189343302-e603f7add05a", alt: "A model in a black oversized coat against a white wall", sizes: ["S", "M", "L"] },
  { id: "stoneware-pair", cat: "objects", name: "Stoneware bowls, pair", note: "Thrown in Matale, ash glaze", price: 6400, photo: "1727257049009-940bed27080f", alt: "Two grey ceramic bowls beside a sprig of dried flowers" },
  { id: "resort-shirt", cat: "clothing", name: "Printed resort shirt", note: "Cotton voile, our own print", price: 9800, photo: "1604284195847-88dc4b5a9faa", alt: "A model in an orange and white printed shirt standing in a field", sizes: ["S", "M", "L", "XL"], isNew: true },
  { id: "bar-pendant", cat: "jewellery", name: "Bar pendant", note: "Gold vermeil on a fine chain", price: 11500, photo: "1569397288884-4d43d6738fbd", alt: "A gold bar pendant on a fine chain over a dark box" },
];

const rs = (n: number) => `Rs. ${n.toLocaleString("en-US")}`;

const productCard = (p: Product, i: number) => {
  const price = p.was
    ? `<p class="price"><span class="price__now">${rs(p.price)}</span> <s><span class="fs-sr">was </span>${rs(p.was)}</s> <span class="price__off">${Math.round((1 - p.price / p.was) * 100)}% off</span></p>`
    : `<p class="price">${rs(p.price)}</p>`;
  const sizes = p.sizes
    ? `
              <div class="sizes" role="group" aria-label="Size for ${p.name}">
${p.sizes.map((s) => (p.soldOut?.includes(s) ? `                <button type="button" data-size="${s}" disabled aria-label="${s}, sold out">${s}</button>` : `                <button type="button" data-size="${s}" aria-pressed="false">${s}</button>`)).join("\n")}
              </div>`
    : "";
  return `          <li class="product" data-fs-reveal data-id="${p.id}" data-cat="${p.cat}" data-price="${p.price}" data-order="${i}"${p.isNew ? ' data-new=""' : ""}>
            <div class="product__media fs-frame" data-fs-tilt="3">
              ${photo(p.photo, 900, 1200, `product-${i + 1}`, p.alt)}
              ${p.isNew ? '<span class="badge">New</span>' : p.was ? '<span class="badge badge--sale">Sale</span>' : ""}
            </div>
            <button class="wish" type="button" aria-pressed="false" aria-label="Save ${p.name} to your wishlist"></button>
            <div class="product__info">
              <p class="product__cat">${CAT_LABEL[p.cat]}</p>
              <h3 class="product__name">${p.name}</h3>
              <p class="product__note">${p.note}</p>
              ${price}
            </div>${sizes}
            <button class="add" type="button"${p.sizes ? " data-needs-size" : ""}>${p.sizes ? "Select a size" : "Add to bag"}</button>
          </li>`;
};

const SLIDES = [
  { photo: "1483985988355-763728e1935b", alt: "A woman in sunglasses and a red coat carrying shopping bags", kicker: "New in", title: "The monsoon edit is here.", body: "Linen, boiled wool and one very good coat, cut for wet streets and air-conditioned offices.", cta: "Shop clothing", filter: "clothing", link: "Read the edit", href: "#edit" },
  { photo: "1793707758252-09808b33d1e9", alt: "A blue glass perfume bottle against a pale blue sky", kicker: "Our first scent", title: "Sea Glass, bottled in Colombo.", body: "Salt, fig leaf and vetiver, blended with a perfumer in Negombo. Try it at the counter.", cta: "Shop scent", filter: "scent", link: "Visit the store", href: "#visit" },
  { photo: "1585960622850-ed33c41d6418", alt: "A woman in a white shirt wearing fine gold necklaces", kicker: "Small gold", title: "Gold for every day, not every occasion.", body: "Recycled 14k gold and vermeil, made in Kandy, sized at the counter for free.", cta: "Shop jewellery", filter: "jewellery", link: "How we size rings", href: "#help" },
];

const slides = SLIDES.map(
  (s, i) => `          <article class="slide${i === 0 ? " is-on" : ""}" data-slide="${i}" aria-roledescription="slide" aria-label="${i + 1} of ${SLIDES.length}"${i === 0 ? "" : ' aria-hidden="true"'}>
            <div class="slide__media">
              ${photo(s.photo, 2000, 1250, `hero-${i + 1}`, s.alt, false)}
            </div>
            <div class="fs-container slide__copy">
              <p class="slide__kicker">${s.kicker}</p>
              <h${i === 0 ? "1" : "2"} class="fs-display slide__title"${i === 0 ? ' data-fs-reveal="words"' : ""}>${s.title}</h${i === 0 ? "1" : "2"}>
              <p class="fs-lead">${s.body}</p>
              <div class="fs-actions">
                <a class="fs-btn" href="#shop" data-shop="${s.filter}"${i === 0 ? "" : ' tabindex="-1"'}>${s.cta} <span class="fs-btn__icon" aria-hidden="true"></span></a>
                <a class="fs-link" href="${s.href}"${i === 0 ? "" : ' tabindex="-1"'}>${s.link}</a>
              </div>
            </div>
          </article>`,
).join("\n");

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="bloom">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Palm Row, a concept store in Colombo</title>
    <meta name="description" content="Clothing, objects, scent and small gold, chosen in Colombo. Free delivery in the city over Rs. 15,000 and returns within 14 days." />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&amp;family=Hanken+Grotesk:wght@400;500;600&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <div class="promo" role="region" aria-label="Store news">
      <ul class="promo__list" id="promo">
        <li class="is-on">Free delivery in Colombo over Rs. 15,000</li>
        <li>Returns within 14 days</li>
        <li>Free gift wrapping at the counter</li>
      </ul>
      <button class="promo__pause" type="button" id="promo-pause" aria-pressed="false" aria-label="Pause the store news"></button>
    </div>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top"><span class="mark" aria-hidden="true"></span>Palm Row</a>
      <ul class="fs-nav__links">
        <li><a href="#shop" data-shop="clothing">Clothing</a></li>
        <li><a href="#shop" data-shop="objects">Objects</a></li>
        <li><a href="#shop" data-shop="scent">Scent</a></li>
        <li><a href="#shop" data-shop="jewellery">Jewellery</a></li>
        <li><a href="#visit">Visit</a></li>
      </ul>
      <button class="bag-btn" type="button" id="bag-open" aria-controls="bag" aria-expanded="false"><span class="bag-btn__icon" aria-hidden="true"></span>Bag <span class="bag-btn__count" id="bag-count">0</span></button>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#shop" data-shop="clothing">Clothing</a>
      <a href="#shop" data-shop="objects">Objects</a>
      <a href="#shop" data-shop="scent">Scent</a>
      <a href="#shop" data-shop="jewellery">Jewellery</a>
      <a href="#visit">Visit the store</a>
    </nav>

    <main id="main">
      <section class="hero" id="top" aria-roledescription="carousel" aria-label="This season at Palm Row">
        <div class="slides" id="slides">
${slides}
        </div>
        <div class="fs-container hero__controls">
          <p class="hero__count" aria-hidden="true"><span id="slide-now">1</span> / ${SLIDES.length}</p>
          <div class="hero__buttons">
            <button type="button" class="round" id="slide-prev" aria-label="Previous story"><span class="chev chev--left" aria-hidden="true"></span></button>
            <button type="button" class="round" id="slide-play" aria-pressed="false" aria-label="Pause the stories"><span class="pp" aria-hidden="true"></span></button>
            <button type="button" class="round" id="slide-next" aria-label="Next story"><span class="chev" aria-hidden="true"></span></button>
          </div>
        </div>
      </section>

      <section class="fs-section shop" id="shop" aria-labelledby="shop-title">
        <div class="fs-container">
          <div class="shop__head">
            <h2 class="fs-h2" id="shop-title" data-fs-reveal>Shop the store</h2>
            <p class="fs-small" id="shop-count" role="status">Showing ${PRODUCTS.length} of ${PRODUCTS.length}</p>
          </div>
          <div class="shop__bar">
            <div class="pills" role="group" aria-label="Filter by category">
              <button type="button" aria-pressed="true" data-filter="all">Everything</button>
              <button type="button" aria-pressed="false" data-filter="new">New in</button>
              <button type="button" aria-pressed="false" data-filter="clothing">Clothing</button>
              <button type="button" aria-pressed="false" data-filter="objects">Objects</button>
              <button type="button" aria-pressed="false" data-filter="scent">Scent</button>
              <button type="button" aria-pressed="false" data-filter="jewellery">Jewellery</button>
            </div>
            <label class="sort">Sort
              <select id="sort">
                <option value="featured">Featured</option>
                <option value="new">Newest</option>
                <option value="low">Price, low to high</option>
                <option value="high">Price, high to low</option>
              </select>
            </label>
          </div>
          <ul class="products" id="products" data-fs-stagger>
${PRODUCTS.map(productCard).join("\n")}
          </ul>
          <p class="empty fs-small" id="empty" hidden>Nothing here yet. <button type="button" class="fs-link" data-filter-reset>Show everything</button></p>
          <p class="fs-small shop__note">Sample products and prices. Replace them with yours.</p>
        </div>
      </section>

      <section class="fs-section fs-section--raised edit" id="edit" aria-labelledby="edit-title">
        <div class="fs-container fs-split">
          <div class="fan" data-fs-tilt="6" aria-hidden="true">
            <div class="fan__card fan__card--1">${photo("1662532577856-e8ee8b138a8b", 800, 1060, "edit-1", "")}</div>
            <div class="fan__card fan__card--2">${photo("1562151270-c7d22ceb586a", 800, 1060, "edit-2", "")}</div>
            <div class="fan__card fan__card--3">${photo("1574015974293-817f0ebebb74", 800, 1060, "edit-3", "")}</div>
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" id="edit-title" data-fs-reveal>Colour, worn <em>loudly.</em></h2>
            <p class="fs-lead" data-fs-reveal>Our buyer's picks for the season: tomato red, monsoon yellow and the black that goes with both. Twelve pieces, in small runs, from four studios on the island.</p>
            <div class="fs-actions" data-fs-reveal>
              <a class="fs-btn" href="#shop" data-shop="clothing">Shop the edit <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <a class="fs-link" href="#visit">Try it on in store</a>
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section" id="visit" aria-labelledby="visit-title">
        <div class="fs-container fs-split fs-split--reverse">
          <div class="fs-frame" data-fs-reveal="mask">
            ${photo("1441986300917-64674bd600d8", 1100, 1375, "store-photo", "The store's shelves and rails of folded clothing under warm lights")}
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" id="visit-title" data-fs-reveal>The store on Ward Place.</h2>
            <p class="fs-lead" data-fs-reveal>Two floors in an old house: clothing downstairs, objects and scent up the teak stairs. Parking in the lane behind.</p>
            <ul class="fs-list" data-fs-stagger>
              <li data-fs-reveal>Free delivery in Colombo over Rs. 15,000, next day</li>
              <li data-fs-reveal>Returns within 14 days, unworn, with the tag</li>
              <li data-fs-reveal>Rings sized and gifts wrapped at the counter, free</li>
            </ul>
            <p class="fs-small">Open Tuesday to Sunday, 10 am to 7 pm. 21 Ward Place, Colombo 7. A sample address.</p>
          </div>
        </div>
      </section>

      <section class="fs-section" aria-labelledby="pass-title">
        <div class="fs-container">
          <div class="pass" data-fs-reveal="scale">
            <div class="pass__stub" aria-hidden="true"><span>Palm Row</span><span>First look</span></div>
            <div class="pass__body">
              <h2 class="fs-h2" id="pass-title">First look at new pieces.</h2>
              <p class="fs-lead">One email when something new comes in. Nothing else, and you can leave in a click.</p>
              <form class="pass__form" id="signup" novalidate>
                <label class="fs-sr" for="signup-email">Email address</label>
                <input id="signup-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
                <button class="fs-btn fs-btn--ink" type="submit">Sign up <span class="fs-btn__icon" aria-hidden="true"></span></button>
              </form>
              <p class="fs-small" id="signup-msg" role="status">A sample form. It doesn't send anything yet.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="help" aria-labelledby="help-title">
        <div class="fs-container fs-split fs-split--wide">
          <div class="fs-faq" data-fs-reveal>
            <details><summary>How long does delivery take?</summary><p>Next day in Colombo when you order before 3 pm, two to four days elsewhere on the island. Over Rs. 15,000 it's free in the city.</p></details>
            <details><summary>Can I return something?</summary><p>Yes, within 14 days if it's unworn and still has its tag. Bring it to the store or we'll send a courier for Rs. 450.</p></details>
            <details><summary>How do I find my ring size?</summary><p>Come in and we'll size you in a minute. At home, wrap a strip of paper round your finger, mark where it meets and measure it: 52 mm is a 6, 54 mm a 7, 57 mm an 8.</p></details>
            <details><summary>Do you have gift cards?</summary><p>At the counter, in any amount from Rs. 5,000, valid for a year.</p></details>
          </div>
          <div class="fs-head">
            <h2 class="fs-h2" id="help-title" data-fs-reveal>Good to know</h2>
            <p class="fs-lead" data-fs-reveal>Anything else, call the store or ask at the counter.</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Visit</h2><p>21 Ward Place<br />Colombo 7</p></div>
          <div><h2>Shop</h2><ul><li><a href="#shop" data-shop="clothing">Clothing</a></li><li><a href="#shop" data-shop="objects">Objects</a></li><li><a href="#shop" data-shop="scent">Scent</a></li><li><a href="#shop" data-shop="jewellery">Jewellery</a></li></ul></div>
          <div><h2>Help</h2><ul><li><a href="#help">Delivery and returns</a></li><li><a href="tel:+94110000000">Call the store</a></li></ul></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Palm Row. A sample store.</span><span>Chosen in Colombo</span></div>
        <div class="fs-wordmark" aria-hidden="true">Palm Row</div>
      </div>
    </footer>

    <div class="scrim" id="scrim" hidden></div>
    <aside class="bag" id="bag" role="dialog" aria-modal="true" aria-labelledby="bag-title" hidden>
      <div class="bag__head">
        <h2 id="bag-title" tabindex="-1">Your bag</h2>
        <button type="button" class="round" id="bag-close" aria-label="Close the bag"><span class="x" aria-hidden="true"></span></button>
      </div>
      <div class="bag__free" id="bag-free">
        <p id="bag-free-text">Free delivery in Colombo over Rs. 15,000.</p>
        <div class="meter" aria-hidden="true"><span id="bag-meter"></span></div>
      </div>
      <ul class="bag__items" id="bag-items"></ul>
      <p class="bag__empty" id="bag-empty">Your bag is empty. <a class="fs-link" href="#shop" id="bag-shop">Start with the new pieces</a></p>
      <div class="bag__foot">
        <p class="bag__total"><span>Subtotal</span><span id="bag-total">Rs. 0</span></p>
        <button class="fs-btn bag__checkout" type="button" disabled aria-describedby="bag-note">Checkout isn't connected yet</button>
        <p class="fs-small" id="bag-note">This is a sample store, so there's no payment yet. Your bag stays in this browser.</p>
      </div>
    </aside>
    <p class="fs-sr" id="announce" role="status"></p>

    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/* Palm Row: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #e2412a;
  --accent-2: #1f6f63;
  --on-accent: #ffffff;
  --ink: #121212;
  --ink-2: #555555;
  --paper: #ffffff;
  --paper-2: #f2f2ef;
  --line: rgb(18 18 18 / 0.1);
  --font-display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
  --radius: 22px;
  --radius-lg: 36px;
  --fs-display-weight: 700;
  --fs-display-track: -0.045em;
}

[hidden] { display: none !important; }
html { scrollbar-gutter: stable; }
.mark { width: 20px; height: 20px; border-radius: 6px 50% 50% 50%; background: var(--accent); }
.fs-h2 em { font-style: normal; color: var(--accent); }

/* The promo bar sits above the floating header. */
.promo { position: relative; z-index: 51; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 12px; background: var(--ink); color: var(--paper); font-size: 14px; }
.promo__list { position: relative; list-style: none; margin: 0; padding: 0; display: grid; text-align: center; }
/* The message going out hides at once and the next rises in, so two never overlap. */
.promo__list li { grid-area: 1 / 1; visibility: hidden; transform: translateY(8px); }
.promo__list li.is-on { visibility: visible; transform: none; transition: transform 400ms var(--fs-ease); }
.promo__pause { flex: none; width: 44px; height: 44px; border: 0; border-radius: 999px; background: none; color: inherit; cursor: pointer; display: grid; place-items: center; }
.promo__pause::before { content: ""; width: 9px; height: 10px; border-inline: 3px solid currentColor; box-sizing: border-box; }
.promo__pause[aria-pressed="true"]::before { width: 0; height: 0; border-style: solid; border-width: 5px 0 5px 9px; border-color: transparent transparent transparent currentColor; }
.fs-nav { top: 56px; }
[data-fs-scrolled] .fs-nav { top: 8px; }
.fs-menu { padding-top: 140px; }

.bag-btn { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: var(--ink); font: 500 15px/1 var(--font-body); cursor: pointer; transition: border-color 160ms; }
.bag-btn:hover { border-color: var(--ink); }
.bag-btn__icon { width: 16px; height: 16px; border: 1.6px solid currentColor; border-radius: 3px 3px 5px 5px; position: relative; }
.bag-btn__icon::before { content: ""; position: absolute; left: 3px; right: 3px; top: -6px; height: 7px; border: 1.6px solid currentColor; border-bottom: 0; border-radius: 8px 8px 0 0; }
.bag-btn__count { display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.bag-btn.bump .bag-btn__count { animation: bump 420ms var(--fs-ease); }
@keyframes bump { 40% { transform: scale(1.35); } }

/* The hero: three stories in one frame, wiping across. */
.hero { position: relative; isolation: isolate; color: #fff; --ink: #fff; --ink-2: rgb(255 255 255 / 0.86); --line: rgb(255 255 255 / 0.28); }
.slides { display: grid; }
.slide { grid-area: 1 / 1; position: relative; display: grid; align-items: end; min-height: min(100svh, 900px); padding: 150px 0 104px; overflow: clip; visibility: hidden; clip-path: inset(0 0 0 100%); }
/* The new story wipes in over the one before, which stays put underneath until it's covered. */
.slide.is-on { visibility: visible; clip-path: inset(0); transition: clip-path 900ms var(--fs-ease); z-index: 1; }
.slide.was-on { visibility: visible; clip-path: inset(0); }
.slide__media { position: absolute; inset: 0; z-index: -1; background: #2a2a2a; }
.slide__media img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.06); transition: transform 7s linear; }
.slide.is-on .slide__media img { transform: scale(1); }
.slide__media::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgb(10 10 10 / 0.6) 0%, rgb(10 10 10 / 0.18) 60%, transparent 85%), linear-gradient(180deg, rgb(10 10 10 / 0.35) 0%, transparent 30%, rgb(10 10 10 / 0.55) 100%); }
.slide__copy { display: grid; gap: 22px; justify-items: start; }
.slide__copy .fs-lead { color: var(--ink-2); }
.slide__title { max-width: 14ch; font-size: clamp(42px, 6.2vw, 96px); }
.slide__kicker { padding: 6px 14px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: 14px; font-weight: 600; }
.hero .fs-link { color: #fff; }
.hero__controls { position: absolute; z-index: 3; left: 50%; bottom: 28px; translate: -50% 0; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.hero__count { font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: 0.04em; }
.hero__buttons { display: flex; gap: 8px; }
.round { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in oklab, var(--paper) 10%, transparent); color: var(--ink); cursor: pointer; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); transition: background-color 160ms, border-color 160ms; }
.round:hover { border-color: var(--ink); }
.chev { width: 9px; height: 9px; border: solid currentColor; border-width: 1.8px 1.8px 0 0; transform: translateX(-2px) rotate(45deg); }
.chev--left { transform: translateX(2px) rotate(-135deg); }
.pp { width: 10px; height: 12px; border-inline: 3px solid currentColor; box-sizing: border-box; }
[aria-pressed="true"] > .pp { width: 0; height: 0; border-style: solid; border-width: 6px 0 6px 10px; border-color: transparent transparent transparent currentColor; translate: 2px 0; }
.x { position: relative; width: 14px; height: 14px; }
.x::before, .x::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 1.6px; background: currentColor; rotate: 45deg; }
.x::after { rotate: -45deg; }

/* The shop: pills and sorting that work on the page, cards with a size row. */
.shop__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 12px 24px; margin-bottom: 24px; }
.shop__bar { position: sticky; top: 72px; z-index: 5; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin: 0 calc(-1 * var(--fs-gutter)) 32px; padding: 12px var(--fs-gutter); background: color-mix(in oklab, var(--paper) 88%, transparent); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.pills { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.pills button { flex: none; min-height: 44px; padding: 0 18px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: var(--ink-2); font: 500 15px/1 var(--font-body); cursor: pointer; transition: background-color 160ms, color 160ms, border-color 160ms; }
.pills button:hover { border-color: var(--ink); color: var(--ink); }
.pills button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.sort { display: inline-flex; align-items: center; gap: 10px; font-size: 15px; color: var(--ink-2); }
.sort select { min-height: 44px; padding: 0 36px 0 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='m1 1.5 5 5 5-5' fill='none' stroke='%23121212' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E") right 14px center / 11px no-repeat; color: var(--ink); font: 500 16px/1 var(--font-body); -webkit-appearance: none; appearance: none; }
.products { list-style: none; margin: 0; padding: 0; display: grid; gap: 36px 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 900px) { .products { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 48px 24px; } }
.product { position: relative; display: grid; gap: 12px; align-content: start; }
.product__media { --fs-ratio: 3 / 4; background: var(--paper-2); }
.badge { position: absolute; z-index: 1; left: 12px; top: 12px; padding: 5px 10px; border-radius: 999px; background: var(--paper); color: var(--ink); font-size: 12px; font-weight: 600; }
.badge--sale { background: var(--accent); color: var(--on-accent); }
.wish { position: absolute; z-index: 2; right: 8px; top: 8px; width: 44px; height: 44px; border: 0; border-radius: 999px; background: color-mix(in oklab, var(--paper) 86%, transparent); color: var(--ink); cursor: pointer; display: grid; place-items: center; transition: transform 200ms var(--fs-ease); }
.wish::before { content: ""; width: 18px; height: 18px; background: currentColor; -webkit-mask: var(--heart) center / contain no-repeat; mask: var(--heart) center / contain no-repeat; --heart: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z' fill='none' stroke='black' stroke-width='1.8' stroke-linejoin='round'/%3E%3C/svg%3E"); }
.wish[aria-pressed="true"] { color: var(--accent); }
.wish[aria-pressed="true"]::before { --heart: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z' fill='black'/%3E%3C/svg%3E"); }
.wish:active { transform: scale(0.9); }
.product__info { display: grid; gap: 2px; }
.product__cat { font-size: 13px; color: var(--ink-2); }
.product__name { font: 600 17px/1.3 var(--font-body); letter-spacing: -0.01em; }
.product__note { font-size: 14px; color: var(--ink-2); }
.price { margin-top: 4px; font-weight: 600; font-variant-numeric: tabular-nums; }
.price s { margin-left: 4px; color: var(--ink-2); font-weight: 400; }
.price__now, .price__off { color: var(--accent); }
.price__off { margin-left: 4px; font-size: 13px; }
.sizes { display: flex; flex-wrap: wrap; gap: 6px; }
.sizes button { min-width: 44px; min-height: 44px; padding: 0 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); color: var(--ink); font: 500 14px/1 var(--font-body); cursor: pointer; transition: border-color 160ms, background-color 160ms; }
.sizes button:hover:not(:disabled) { border-color: var(--ink); }
.sizes button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.sizes button:disabled { color: var(--ink-2); text-decoration: line-through; cursor: not-allowed; background: var(--paper-2); }
.add { min-height: 48px; padding: 0 18px; border: 1px solid var(--ink); border-radius: 999px; background: var(--paper); color: var(--ink); font: 600 15px/1 var(--font-body); cursor: pointer; transition: background-color 160ms, color 160ms, transform 160ms var(--fs-ease); }
.add:hover, .add.ready { background: var(--ink); color: var(--paper); }
.add:active { transform: scale(0.98); }
.add.added { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
.add.nudge { animation: nudge 360ms var(--fs-ease); }
@keyframes nudge { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
.empty { padding: 32px 0; }
.shop__note { margin-top: 40px; }

/* The edit: three photos fanned in 3D, opening toward the pointer. */
.fan { position: relative; aspect-ratio: 1 / 1; max-width: 560px; width: 100%; margin-inline: auto; perspective: 1400px; }
.fan__card { position: absolute; top: 8%; left: 26%; width: 48%; aspect-ratio: 3 / 4; border-radius: var(--radius); overflow: hidden; box-shadow: 0 30px 60px -24px rgb(18 18 18 / 0.45); transform-style: preserve-3d; transition: transform 900ms var(--fs-ease); }
.fan__card img { width: 100%; height: 100%; object-fit: cover; }
.fan__card--1 { transform: translateX(-34%) rotate(-9deg) translateZ(-60px); }
.fan__card--2 { transform: translateZ(40px); z-index: 1; }
.fan__card--3 { transform: translateX(34%) rotate(9deg) translateZ(-60px); }
.fan:hover .fan__card--1 { transform: translateX(-46%) rotate(-13deg) rotateY(14deg) translateZ(-40px); }
.fan:hover .fan__card--3 { transform: translateX(46%) rotate(13deg) rotateY(-14deg) translateZ(-40px); }

/* The sign-up: one designed moment, drawn as a pass. */
.pass { position: relative; display: grid; overflow: hidden; border-radius: var(--radius-lg); background: var(--accent); color: var(--on-accent); --ink: #fff; --ink-2: rgb(255 255 255 / 0.86); --line: rgb(255 255 255 / 0.3); }
@media (min-width: 860px) { .pass { grid-template-columns: 104px 1fr; } }
.pass__stub { display: flex; justify-content: space-between; gap: 12px; padding: 20px 28px; border-bottom: 2px dashed rgb(255 255 255 / 0.45); font: 700 15px/1 var(--font-display); letter-spacing: 0.04em; text-transform: uppercase; }
@media (min-width: 860px) {
  .pass__stub { writing-mode: vertical-rl; rotate: 180deg; align-items: center; border-bottom: 0; border-left: 2px dashed rgb(255 255 255 / 0.45); padding: 36px 0; }
  /* The punched notches where the stub tears off. */
  .pass::before, .pass::after { content: ""; position: absolute; left: 104px; width: 30px; height: 30px; border-radius: 50%; background: var(--paper); translate: -50% 0; }
  .pass::before { top: -15px; }
  .pass::after { bottom: -15px; }
}
.pass__body { display: grid; gap: 18px; padding: clamp(28px, 5vw, 64px); }
.pass__form { display: flex; flex-wrap: wrap; gap: 10px; max-width: 560px; }
.pass__form input { flex: 1 1 220px; min-height: 52px; padding: 0 18px; border: 1px solid rgb(255 255 255 / 0.5); border-radius: 12px; background: rgb(255 255 255 / 0.12); color: #fff; font: 400 16px/1 var(--font-body); }
.pass__form input::placeholder { color: rgb(255 255 255 / 0.75); }
.pass__form input[aria-invalid="true"] { border-color: #fff; box-shadow: 0 0 0 2px #fff; }
.pass .fs-btn--ink { background: #121212; color: #fff; }
.pass :focus-visible { outline-color: #fff; }

/* The bag drawer. */
.scrim { position: fixed; inset: 0; z-index: 60; background: rgb(18 18 18 / 0.36); }
.bag { position: fixed; z-index: 61; top: 0; right: 0; bottom: 0; width: min(100%, 440px); display: grid; grid-template-rows: auto auto 1fr auto; background: var(--paper); box-shadow: -30px 0 60px -30px rgb(18 18 18 / 0.4); }
.bag.is-open { animation: slide-in 420ms var(--fs-ease); }
@keyframes slide-in { from { transform: translateX(100%); } }
.bag__head { display: flex; justify-content: space-between; align-items: center; padding: 16px 16px 8px 24px; }
.bag__head h2 { font-size: 28px; }
.bag__free { padding: 8px 24px 16px; font-size: 14px; color: var(--ink-2); border-bottom: 1px solid var(--line); }
.meter { height: 6px; margin-top: 10px; border-radius: 999px; background: var(--paper-2); overflow: hidden; }
.meter span { display: block; height: 100%; width: 0; border-radius: inherit; background: var(--accent-2); transition: width 500ms var(--fs-ease); }
.bag__items { list-style: none; margin: 0; padding: 8px 24px; overflow-y: auto; }
.line { display: grid; grid-template-columns: 72px 1fr auto; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--line); }
.line img { width: 72px; height: 96px; object-fit: cover; border-radius: 12px; background: var(--paper-2); }
.line__name { font-weight: 600; }
.line__meta { font-size: 14px; color: var(--ink-2); }
.qty { display: inline-flex; align-items: center; margin-top: 8px; border: 1px solid var(--line); border-radius: 999px; }
.qty button { width: 44px; height: 40px; border: 0; background: none; color: var(--ink); font: 500 18px/1 var(--font-body); cursor: pointer; border-radius: 999px; }
.qty output { min-width: 24px; text-align: center; font-variant-numeric: tabular-nums; }
.line__side { display: grid; justify-items: end; align-content: space-between; font-weight: 600; font-variant-numeric: tabular-nums; }
.line__remove { min-height: 44px; border: 0; background: none; color: var(--ink-2); font: 400 14px/1 var(--font-body); text-decoration: underline; cursor: pointer; }
.bag__empty { padding: 24px; color: var(--ink-2); }
.bag__foot { display: grid; gap: 12px; padding: 20px 24px 28px; border-top: 1px solid var(--line); }
.bag__total { display: flex; justify-content: space-between; font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.bag__checkout { justify-content: center; }
.bag__checkout:disabled { background: var(--paper-2); color: var(--ink-2); cursor: not-allowed; box-shadow: none; }
html.bag-open { overflow: hidden; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .slide, .slide.is-on, .promo__list li, .promo__list li.is-on, .fan__card { transition: none; }
  .slide__media img { transform: none; transition: none; }
  .bag.is-open, .bag-btn.bump .bag-btn__count, .add.nudge { animation: none; }
}
`;

const SCRIPT = `// Palm Row: the store news, the hero stories, filters and sorting, sizes, the wishlist and the bag.
// The page is complete without this file; the Studio kit does the reveals and the tilt.
(function () {
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var announce = document.getElementById("announce");
  var say = function (text) { if (announce) { announce.textContent = ""; setTimeout(function () { announce.textContent = text; }, 40); } };
  var rs = function (n) { return "Rs. " + n.toLocaleString("en-US"); };
  var read = function (key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; } catch (e) { return fallback; } };
  var write = function (key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: the bag lasts this visit */ } };

  // The store news: one true message at a time, with a pause.
  var promos = Array.prototype.slice.call(document.querySelectorAll("#promo li"));
  var promoPause = document.getElementById("promo-pause");
  var promoAt = 0, promoTimer = null;
  function promoNext() {
    promos[promoAt].classList.remove("is-on");
    promoAt = (promoAt + 1) % promos.length;
    promos[promoAt].classList.add("is-on");
  }
  function promoRun(on) {
    clearInterval(promoTimer);
    if (on) promoTimer = setInterval(promoNext, 4500);
    if (promoPause) {
      promoPause.setAttribute("aria-pressed", String(!on));
      promoPause.setAttribute("aria-label", on ? "Pause the store news" : "Play the store news");
    }
  }
  if (promos.length > 1) {
    promoRun(!still);
    if (promoPause) promoPause.addEventListener("click", function () { promoRun(promoPause.getAttribute("aria-pressed") === "true"); });
  }

  // The hero: three stories that change every seven seconds, and stop when asked, hovered or focused.
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var slideAt = 0, slideTimer = null, slidePaused = still;
  var playBtn = document.getElementById("slide-play");
  var nowEl = document.getElementById("slide-now");
  function show(i) {
    var before = slides[slideAt];
    slideAt = (i + slides.length) % slides.length;
    if (before !== slides[slideAt]) {
      slides.forEach(function (s) { s.classList.remove("was-on"); });
      before.classList.add("was-on");
      setTimeout(function () { before.classList.remove("was-on"); }, 950);
    }
    slides.forEach(function (s, n) {
      var on = n === slideAt;
      s.classList.toggle("is-on", on);
      if (on) s.removeAttribute("aria-hidden"); else s.setAttribute("aria-hidden", "true");
      s.querySelectorAll("a").forEach(function (a) { if (on) a.removeAttribute("tabindex"); else a.setAttribute("tabindex", "-1"); });
    });
    if (nowEl) nowEl.textContent = String(slideAt + 1);
  }
  function schedule() {
    clearInterval(slideTimer);
    if (!slidePaused) slideTimer = setInterval(function () { show(slideAt + 1); }, 7000);
    if (playBtn) {
      playBtn.setAttribute("aria-pressed", String(slidePaused));
      playBtn.setAttribute("aria-label", slidePaused ? "Play the stories" : "Pause the stories");
    }
  }
  if (slides.length > 1) {
    document.getElementById("slide-prev").addEventListener("click", function () { show(slideAt - 1); schedule(); });
    document.getElementById("slide-next").addEventListener("click", function () { show(slideAt + 1); schedule(); });
    if (playBtn) playBtn.addEventListener("click", function () { slidePaused = !slidePaused; schedule(); });
    var hero = document.getElementById("top");
    var hold = function () { clearInterval(slideTimer); };
    hero.addEventListener("pointerenter", hold);
    hero.addEventListener("pointerleave", schedule);
    hero.addEventListener("focusin", hold);
    hero.addEventListener("focusout", schedule);
    schedule();
  }

  // Filters and sorting, on the products already on the page.
  var list = document.getElementById("products");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".product"));
  var pills = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  var sortSel = document.getElementById("sort");
  var count = document.getElementById("shop-count");
  var empty = document.getElementById("empty");
  var filter = "all";
  function apply() {
    var shown = 0;
    cards.forEach(function (c) {
      var ok = filter === "all" || (filter === "new" ? c.hasAttribute("data-new") : c.dataset.cat === filter);
      c.hidden = !ok;
      if (ok) shown++;
    });
    var by = sortSel ? sortSel.value : "featured";
    cards.slice().sort(function (a, b) {
      if (by === "low") return a.dataset.price - b.dataset.price;
      if (by === "high") return b.dataset.price - a.dataset.price;
      if (by === "new") return (b.hasAttribute("data-new") - a.hasAttribute("data-new")) || (a.dataset.order - b.dataset.order);
      return a.dataset.order - b.dataset.order;
    }).forEach(function (c) { list.appendChild(c); });
    pills.forEach(function (p) { p.setAttribute("aria-pressed", String(p.dataset.filter === filter)); });
    if (count) count.textContent = "Showing " + shown + " of " + cards.length;
    if (empty) empty.hidden = shown > 0;
  }
  pills.forEach(function (p) { p.addEventListener("click", function () { filter = p.dataset.filter; apply(); }); });
  if (sortSel) sortSel.addEventListener("change", apply);
  var reset = document.querySelector("[data-filter-reset]");
  if (reset) reset.addEventListener("click", function () { filter = "all"; apply(); });
  // Links that open a category: the header, the hero stories, the edit and the footer.
  document.querySelectorAll("[data-shop]").forEach(function (a) {
    a.addEventListener("click", function () { filter = a.dataset.shop; apply(); });
  });

  // Sizes: the button says what's missing until it's ready.
  cards.forEach(function (card) {
    var add = card.querySelector(".add");
    card.querySelectorAll(".sizes button:not(:disabled)").forEach(function (b) {
      b.addEventListener("click", function () {
        card.querySelectorAll(".sizes button").forEach(function (o) { if (!o.disabled) o.setAttribute("aria-pressed", String(o === b)); });
        card.dataset.size = b.dataset.size;
        add.textContent = "Add to bag, size " + b.dataset.size;
        add.classList.add("ready");
      });
    });
    add.addEventListener("click", function () {
      if (add.hasAttribute("data-needs-size") && !card.dataset.size) {
        add.classList.remove("nudge");
        void add.offsetWidth;
        add.classList.add("nudge");
        say("Choose a size for " + card.querySelector(".product__name").textContent + " first.");
        var first = card.querySelector(".sizes button:not(:disabled)");
        if (first) first.focus();
        return;
      }
      addToBag(card.dataset.id, card.dataset.size || "");
      var label = add.textContent;
      add.classList.add("added");
      add.textContent = "Added";
      setTimeout(function () { add.classList.remove("added"); add.textContent = label; }, 1600);
    });
  });

  // The wishlist, remembered in this browser.
  var wished = read("palmrow-wishlist", []);
  cards.forEach(function (card) {
    var w = card.querySelector(".wish");
    var name = card.querySelector(".product__name").textContent;
    var set = function (on) {
      w.setAttribute("aria-pressed", String(on));
      w.setAttribute("aria-label", (on ? "Remove " : "Save ") + name + (on ? " from" : " to") + " your wishlist");
    };
    set(wished.indexOf(card.dataset.id) !== -1);
    w.addEventListener("click", function () {
      var on = w.getAttribute("aria-pressed") !== "true";
      wished = wished.filter(function (id) { return id !== card.dataset.id; });
      if (on) wished.push(card.dataset.id);
      write("palmrow-wishlist", wished);
      set(on);
      say(on ? name + " saved to your wishlist." : name + " removed from your wishlist.");
    });
  });

  // The bag: a drawer that remembers what's in it, with the way to free delivery.
  var FREE_OVER = 15000;
  var bag = read("palmrow-bag", []).filter(function (l) { return document.querySelector('.product[data-id="' + l.id + '"]'); });
  var drawer = document.getElementById("bag");
  var scrim = document.getElementById("scrim");
  var opener = document.getElementById("bag-open");
  var lastFocus = null;
  function product(id) {
    var c = document.querySelector('.product[data-id="' + id + '"]');
    return { name: c.querySelector(".product__name").textContent, price: Number(c.dataset.price), img: c.querySelector("img").getAttribute("src"), alt: c.querySelector("img").getAttribute("alt") };
  }
  function render() {
    var items = document.getElementById("bag-items");
    items.textContent = "";
    var total = 0, n = 0;
    bag.forEach(function (l, i) {
      var p = product(l.id);
      total += p.price * l.qty;
      n += l.qty;
      var li = document.createElement("li");
      li.className = "line";
      var img = document.createElement("img");
      img.src = p.img; img.alt = p.alt; img.width = 72; img.height = 96;
      var mid = document.createElement("div");
      var nm = document.createElement("p"); nm.className = "line__name"; nm.textContent = p.name;
      var meta = document.createElement("p"); meta.className = "line__meta"; meta.textContent = (l.size ? "Size " + l.size + ", " : "") + rs(p.price) + " each";
      var qty = document.createElement("div"); qty.className = "qty";
      var minus = document.createElement("button"); minus.type = "button"; minus.textContent = "\\u2212"; minus.setAttribute("aria-label", "One fewer " + p.name);
      var out = document.createElement("output"); out.textContent = String(l.qty); out.setAttribute("aria-label", "Quantity");
      var plus = document.createElement("button"); plus.type = "button"; plus.textContent = "+"; plus.setAttribute("aria-label", "One more " + p.name);
      minus.addEventListener("click", function () { l.qty -= 1; if (l.qty < 1) bag.splice(i, 1); save(); });
      plus.addEventListener("click", function () { l.qty = Math.min(9, l.qty + 1); save(); });
      qty.append(minus, out, plus);
      mid.append(nm, meta, qty);
      var side = document.createElement("div"); side.className = "line__side";
      var sum = document.createElement("span"); sum.textContent = rs(p.price * l.qty);
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "line__remove"; rm.textContent = "Remove";
      rm.addEventListener("click", function () { bag.splice(i, 1); save(); say(p.name + " removed from your bag."); });
      side.append(sum, rm);
      li.append(img, mid, side);
      items.appendChild(li);
    });
    document.getElementById("bag-total").textContent = rs(total);
    document.getElementById("bag-empty").hidden = bag.length > 0;
    document.getElementById("bag-count").textContent = String(n);
    var left = FREE_OVER - total;
    document.getElementById("bag-free-text").textContent = total === 0 ? "Free delivery in Colombo over " + rs(FREE_OVER) + "." : left > 0 ? rs(left) + " away from free delivery in Colombo." : "Your delivery in Colombo is free.";
    document.getElementById("bag-meter").style.width = Math.min(100, (total / FREE_OVER) * 100) + "%";
  }
  function save() { write("palmrow-bag", bag); render(); }
  function addToBag(id, size) {
    var line = bag.filter(function (l) { return l.id === id && l.size === size; })[0];
    if (line) line.qty = Math.min(9, line.qty + 1); else bag.push({ id: id, size: size, qty: 1 });
    save();
    opener.classList.remove("bump");
    void opener.offsetWidth;
    opener.classList.add("bump");
    openBag();
  }
  function openBag() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    scrim.hidden = false;
    drawer.classList.add("is-open");
    document.documentElement.classList.add("bag-open");
    opener.setAttribute("aria-expanded", "true");
    document.getElementById("bag-title").focus();
  }
  function closeBag() {
    drawer.hidden = true;
    scrim.hidden = true;
    drawer.classList.remove("is-open");
    document.documentElement.classList.remove("bag-open");
    opener.setAttribute("aria-expanded", "false");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  opener.addEventListener("click", openBag);
  document.getElementById("bag-close").addEventListener("click", closeBag);
  scrim.addEventListener("click", closeBag);
  document.getElementById("bag-shop").addEventListener("click", closeBag);
  document.addEventListener("keydown", function (e) {
    if (drawer.hidden) return;
    if (e.key === "Escape") closeBag();
    if (e.key === "Tab") {
      var f = Array.prototype.slice.call(drawer.querySelectorAll("button:not(:disabled), a[href], [tabindex='-1']"));
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  render();

  // The sign-up checks the address, then says honestly that nothing was sent.
  var form = document.getElementById("signup");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("signup-email");
      var msg = document.getElementById("signup-msg");
      var ok = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.value.trim());
      email.setAttribute("aria-invalid", String(!ok));
      msg.textContent = ok ? "Thanks. This is a sample form, so nothing was sent yet." : "Enter an email address like name@example.com.";
      if (!ok) email.focus();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Palm Row: design

Design read: a concept store in Colombo for clothing, objects, scent and small gold, for people who shop with their eyes; editorial and energetic, with store craft that's honest. Built on the Farbaek Studio kit, light.

## Look

The kit's bloom look, tuned: pure white paper, stone grey behind every product, generous 22px corners, a heavy grotesk display set tight.

## Palette

- \`--paper\` #ffffff, and \`--paper-2\` #f2f2ef, a stone grey behind products and in the drawer.
- \`--ink\` #121212 and \`--ink-2\` #555555.
- \`--accent\` #e2412a, tomato red, for the mark, sale prices, the kicker and the sign-up pass.
- \`--accent-2\` #1f6f63, deep green, for "Added" and the free-delivery line.

## Type

Bricolage Grotesque at 700 for headlines, set tight; Hanken Grotesk for everything else. Prices are tabular.

## Layout

A thin promo bar of true messages; the floating header with the bag; a full-bleed hero of three stories that wipe across, with a count, arrows and a pause; a sticky row of category pills and sorting over a four-up product grid (two on phones); the fanned edit; the store with its promises; one sign-up drawn as a pass; questions; a dense footer with the wordmark; the bag as a drawer.

## Signature

The edit: three photos fanned in 3D that open toward the pointer, and every product photo tilting a little under it, so the clothes feel picked up.

## Motion

The headline rises word by word, stories wipe across with a slow push-in, products rise in turn, the bag count bumps, the drawer slides in, a button without its size nudges. Everything stops under reduced motion and the stories stop rotating.

## Media

Every photo is a real fashion, scent, ceramic or jewellery photo marked as a placeholder: three hero stories, eight products, the edit and the store. Replace each with the shop's own in Studio.

## Avoid

Fake urgency (no viewer counts, stock counts or countdowns), invented reviews, cream-and-brass, a checkout that pretends to take money.
`;

const README = `# Palm Row store (template)

A static site on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Change the products in \`index.html\`: each card's \`data-cat\`, \`data-price\` and sizes drive the filters, sorting and the bag.
2. Change the promo bar, the stories, the address and the delivery threshold (\`FREE_OVER\` in \`script.js\`).
3. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
4. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).

The bag and wishlist live in the visitor's browser. Checkout isn't connected: the button says so until a payment provider is set up.
`;

export const ONLINE_STORE_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];
