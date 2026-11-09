/**
 * Farbaek Studio kit v1: the motion and behaviour behind studio.css.
 * Import it once as a module: <script type="module" src=".../kit/studio/v1/studio.js"></script>.
 *
 * - [data-fs-reveal] (up, scale, mask, words) rises in as it comes into view,
 *   staggered inside [data-fs-stagger]; the first screen enters in order.
 * - [data-fs-count] counts its number up once it's seen.
 * - [data-fs-tilt] leans toward a fine pointer in 3D.
 * - .fs-nav gets its phone menu; <html data-fs-scrolled> once the page moves.
 * - Autoplaying videos pause off-screen and under reduced motion.
 *
 * Everything runs on IntersectionObserver, never scroll listeners. Under
 * prefers-reduced-motion the page is complete and still. The pure helpers are
 * exported for tests.
 */

export const VERSION = "1.0.0";

/** "1,250+", "$4.8M", "98%" → its parts, or null when there's no number to count. */
export function parseCount(text) {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s.exec(String(text ?? "").trim());
  if (!m) return null;
  const raw = m[2];
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { prefix: m[1], value, decimals, grouped: raw.includes(","), suffix: m[3] };
}

/** The number at `value`, written the way the original was. */
export function formatCount(parts, value) {
  const fixed = Math.max(0, value).toFixed(parts.decimals);
  const [whole, frac] = fixed.split(".");
  const grouped = parts.grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return `${parts.prefix}${grouped}${frac ? `.${frac}` : ""}${parts.suffix}`;
}

/** Text split into words and the spaces between them, so each word can rise on its own. */
export function splitWords(text) {
  return String(text ?? "").split(/(\s+)/).filter((s) => s !== "");
}

/** easeOutExpo, for counting. */
export function easeOut(t) {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

const media = (q) => typeof matchMedia === "function" && matchMedia(q).matches;
export const prefersReducedMotion = () => media("(prefers-reduced-motion: reduce)");
const finePointer = () => media("(hover: hover) and (pointer: fine)");

/** Wraps each word in a span (and, for "rise", an inner span the word rises inside). */
function revealWords(el) {
  if (el.dataset.fsSplit) return;
  el.dataset.fsSplit = "1";
  const rise = el.dataset.fsReveal === "rise";
  const walk = (node, counter) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of splitWords(child.textContent)) {
          if (/^\s+$/.test(part)) frag.append(part);
          else {
            const w = document.createElement("span");
            w.className = "fs-w";
            w.style.setProperty("--fs-i", String(counter.i++));
            if (rise) {
              const inner = document.createElement("span");
              inner.textContent = part;
              w.append(inner);
            } else w.textContent = part;
            frag.append(w);
          }
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && !child.matches("br")) walk(child, counter);
    }
  };
  walk(el, { i: 0 });
}

function stagger(root) {
  for (const group of root.querySelectorAll("[data-fs-stagger]")) {
    [...group.querySelectorAll(":scope > [data-fs-reveal], :scope > * > [data-fs-reveal]")].forEach((el, i) => {
      if (!el.style.getPropertyValue("--fs-i")) el.style.setProperty("--fs-i", String(i));
    });
  }
}

function countUp(el) {
  const parts = parseCount(el.textContent);
  if (!parts || prefersReducedMotion()) return;
  const final = el.textContent;
  const ms = Number(el.dataset.fsCount) > 0 ? Number(el.dataset.fsCount) : 1600;
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = t >= 1 ? final : formatCount(parts, parts.value * easeOut(t));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = formatCount(parts, 0);
  requestAnimationFrame(step);
}

function tilt(el) {
  if (el.dataset.fsTiltOn) return;
  el.dataset.fsTiltOn = "1";
  const max = Number(el.dataset.fsTilt) > 0 ? Number(el.dataset.fsTilt) : 6;
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.dataset.fsTilting = "";
    el.style.setProperty("--fs-ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty("--fs-rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty("--fs-mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--fs-my", `${(y * 100).toFixed(1)}%`);
    el.style.setProperty("--fs-glare", "1");
  });
  el.addEventListener("pointerleave", () => {
    delete el.dataset.fsTilting;
    for (const p of ["--fs-rx", "--fs-ry", "--fs-glare"]) el.style.removeProperty(p);
  });
}

function nav(doc) {
  const html = doc.documentElement;
  const toggle = doc.querySelector(".fs-nav__toggle");
  const menu = doc.querySelector(".fs-menu");
  if (toggle && menu && !toggle.dataset.fsOn) {
    toggle.dataset.fsOn = "1";
    if (!menu.id) menu.id = "fs-menu";
    toggle.setAttribute("aria-controls", menu.id);
    toggle.setAttribute("aria-expanded", "false");
    const set = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close the menu" : "Open the menu");
      if (open) html.dataset.fsMenuOpen = "";
      else delete html.dataset.fsMenuOpen;
      if (open) menu.querySelector("a, button")?.focus();
    };
    toggle.addEventListener("click", () => set(toggle.getAttribute("aria-expanded") !== "true"));
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) set(false);
    });
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        set(false);
        toggle.focus();
      }
    });
  }
  // A marker at the top of the page says when it has scrolled, without a scroll listener.
  if (typeof IntersectionObserver === "function" && !doc.querySelector("[data-fs-top]")) {
    const marker = doc.createElement("div");
    marker.dataset.fsTop = "";
    marker.setAttribute("aria-hidden", "true");
    marker.style.cssText = "position:absolute;top:0;left:0;width:1px;height:64px;pointer-events:none;";
    doc.body.prepend(marker);
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) delete html.dataset.fsScrolled;
      else html.dataset.fsScrolled = "";
    }).observe(marker);
  }
}

function videos(root) {
  const vids = [...root.querySelectorAll("video[autoplay]")];
  if (!vids.length) return;
  if (prefersReducedMotion()) {
    for (const v of vids) {
      v.removeAttribute("autoplay");
      v.pause();
    }
    return;
  }
  if (typeof IntersectionObserver !== "function") return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) v.play?.().catch(() => undefined);
      else v.pause?.();
    }
  });
  for (const v of vids) io.observe(v);
}

/** Wires every kit behaviour inside `root`. Safe to call again after adding content. */
export function init(root = document) {
  const doc = root.ownerDocument ?? root;
  const html = doc.documentElement;
  html.classList.add("fs-js");
  const still = prefersReducedMotion() || typeof IntersectionObserver !== "function";

  stagger(root);
  const reveals = [...root.querySelectorAll("[data-fs-reveal]:not(.fs-in)")];
  for (const el of reveals) if (el.dataset.fsReveal === "words" || el.dataset.fsReveal === "rise") revealWords(el);
  if (still) for (const el of reveals) el.classList.add("fs-in");
  else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("fs-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const el of reveals) io.observe(el);
  }

  const counters = [...root.querySelectorAll("[data-fs-count]")];
  if (counters.length && !still) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          countUp(e.target);
        }
      },
      { threshold: 0.6 },
    );
    for (const el of counters) io.observe(el);
  }

  if (finePointer() && !prefersReducedMotion()) for (const el of root.querySelectorAll("[data-fs-tilt]")) tilt(el);
  if (root === doc || root === html) nav(doc);
  videos(root);
  html.classList.add("fs-ready");
}

if (typeof document !== "undefined" && typeof window !== "undefined" && !window.FARBAEK_STUDIO_MANUAL) {
  window.FarbaekStudio = { VERSION, init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init(), { once: true });
  else init();
}
