/**
 * Farbaek Studio kit Pro v1 (ADR 0157), for builds on paid plans. Import it
 * after studio.js: <script type="module" src=".../kit/studio/v1/studio-pro.js"></script>.
 *
 * - .fs-chapters: the sticky stage shows the media of the chapter in view.
 * - .fs-carousel: previous, next and pause; advances on its own while seen.
 * - .fs-marquee: loops seamlessly (a hidden copy fills the gap).
 * - .fs-turntable: drag or use the slider to turn the product.
 * - .fs-hscroll--pinned: knows how many panels it has.
 * - [data-fs-magnetic], [data-fs-glow], [data-fs-depth]: pointer and depth.
 *
 * IntersectionObserver only, no scroll listeners; still under reduced motion.
 */
import { prefersReducedMotion } from "./studio.js";

export const VERSION = "1.0.0";

/** Which frame of `count` a turn of `ratio` (0 to 1) shows. */
export function frameAt(ratio, count) {
  if (!(count > 0)) return 0;
  const r = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  return Math.min(count - 1, Math.floor(r * count));
}

/** The pull toward the pointer, limited to `max` pixels. */
export function magnet(dx, dy, max = 10) {
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  const k = Math.min(1, max / len) * 0.35;
  return { x: +(dx * k).toFixed(2), y: +(dy * k).toFixed(2) };
}

const media = (q) => typeof matchMedia === "function" && matchMedia(q).matches;
const finePointer = () => media("(hover: hover) and (pointer: fine)");
const once = (el, key) => {
  if (el.dataset[key]) return false;
  el.dataset[key] = "1";
  return true;
};

function chapters(root) {
  if (typeof IntersectionObserver !== "function") return;
  for (const box of root.querySelectorAll(".fs-chapters")) {
    if (!once(box, "fsChapters")) continue;
    const shows = [...box.querySelectorAll("[data-fs-show]")];
    const steps = [...box.querySelectorAll(".fs-chapter")];
    if (!steps.length) continue;
    box.classList.add("fs-chapters--live");
    const activate = (step) => {
      const key = step.dataset.fsStep ?? String(steps.indexOf(step) + 1);
      for (const s of steps) s.classList.toggle("is-active", s === step);
      for (const m of shows) m.classList.toggle("is-active", m.dataset.fsShow === key);
    };
    activate(steps[0]);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) activate(e.target);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const s of steps) io.observe(s);
  }
}

function carousels(root) {
  for (const box of root.querySelectorAll(".fs-carousel")) {
    if (!once(box, "fsCarousel")) continue;
    const track = box.querySelector(".fs-carousel__track");
    if (!track) continue;
    const slides = [...track.children];
    box.classList.add("fs-carousel--live");
    let active = 0;
    const go = (i) => {
      const n = (i + slides.length) % slides.length;
      const s = slides[n];
      track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.clientWidth) / 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };
    box.querySelector("[data-fs-prev]")?.addEventListener("click", () => go(active - 1));
    box.querySelector("[data-fs-next]")?.addEventListener("click", () => go(active + 1));
    const pause = box.querySelector("[data-fs-pause]");
    let paused = prefersReducedMotion();
    if (pause) {
      pause.setAttribute("aria-pressed", String(paused));
      pause.setAttribute("aria-label", paused ? "Play the slides" : "Pause the slides");
      pause.addEventListener("click", () => {
        paused = !paused;
        pause.setAttribute("aria-pressed", String(paused));
        pause.setAttribute("aria-label", paused ? "Play the slides" : "Pause the slides");
      });
    }
    if (typeof IntersectionObserver !== "function") continue;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          active = slides.indexOf(e.target);
          for (const s of slides) s.classList.toggle("is-active", s === e.target);
        }
      },
      { root: track, threshold: 0.6 },
    );
    for (const s of slides) seen.observe(s);
    let inView = false;
    let hovering = false;
    new IntersectionObserver(([e]) => (inView = e.isIntersecting)).observe(box);
    box.addEventListener("pointerenter", () => (hovering = true));
    box.addEventListener("pointerleave", () => (hovering = false));
    box.addEventListener("focusin", () => (hovering = true));
    box.addEventListener("focusout", () => (hovering = false));
    const ms = Number(box.dataset.fsInterval) > 0 ? Number(box.dataset.fsInterval) : 5500;
    setInterval(() => {
      if (!paused && inView && !hovering && !document.hidden) go(active + 1);
    }, ms);
  }
}

function marquees(root) {
  for (const box of root.querySelectorAll(".fs-marquee")) {
    if (!once(box, "fsMarquee")) continue;
    const track = box.querySelector(".fs-marquee__track");
    if (!track) continue;
    for (const item of [...track.children]) {
      const copy = item.cloneNode(true);
      copy.dataset.fsClone = "";
      copy.setAttribute("aria-hidden", "true");
      for (const f of copy.querySelectorAll("a, button, input, [tabindex]")) f.setAttribute("tabindex", "-1");
      track.append(copy);
    }
  }
}

function turntables(root) {
  for (const box of root.querySelectorAll(".fs-turntable")) {
    if (!once(box, "fsTurntable")) continue;
    const stage = box.querySelector(".fs-turntable__stage");
    if (!stage) continue;
    const frames = [...stage.querySelectorAll("img")];
    const range = box.querySelector(".fs-turntable__range");
    const show = (ratio) => {
      if (frames.length > 1) {
        const n = frameAt(ratio, frames.length);
        frames.forEach((f, i) => f.classList.toggle("is-active", i === n));
      } else stage.style.setProperty("--fs-turn", `${((ratio - 0.5) * 50).toFixed(1)}deg`);
      if (range) range.value = String(Math.round(ratio * 100));
    };
    show(range ? Number(range.value || 50) / 100 : 0.5);
    range?.addEventListener("input", () => show(Number(range.value) / 100));
    let start = null;
    box.addEventListener("pointerdown", (e) => {
      if (e.target === range) return;
      start = { x: e.clientX, ratio: range ? Number(range.value) / 100 : 0.5 };
      box.dataset.fsDragging = "";
      box.setPointerCapture?.(e.pointerId);
    });
    box.addEventListener("pointermove", (e) => {
      if (!start) return;
      show(Math.min(1, Math.max(0, start.ratio + (e.clientX - start.x) / box.clientWidth)));
    });
    const end = () => {
      start = null;
      delete box.dataset.fsDragging;
    };
    box.addEventListener("pointerup", end);
    box.addEventListener("pointercancel", end);
  }
}

function pointerEffects(root) {
  if (!finePointer() || prefersReducedMotion()) return;
  for (const el of root.querySelectorAll("[data-fs-magnetic]")) {
    if (!once(el, "fsMagnet")) continue;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const m = magnet(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), Number(el.dataset.fsMagnetic) || 10);
      el.dataset.fsPulling = "";
      el.style.translate = `${m.x}px ${m.y}px`;
    });
    el.addEventListener("pointerleave", () => {
      delete el.dataset.fsPulling;
      el.style.translate = "";
    });
  }
  for (const el of root.querySelectorAll("[data-fs-glow]")) {
    if (!once(el, "fsGlow")) continue;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--fs-mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--fs-my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      el.style.setProperty("--fs-glow-on", "1");
    });
    el.addEventListener("pointerleave", () => el.style.removeProperty("--fs-glow-on"));
  }
}

/** Wires every Pro behaviour inside `root`. Safe to call again after adding content. */
export function initPro(root = document) {
  for (const el of root.querySelectorAll("[data-fs-depth]")) el.style.setProperty("--fs-depth", String(Number(el.dataset.fsDepth) || 0.2));
  for (const el of root.querySelectorAll(".fs-hscroll--pinned")) el.style.setProperty("--fs-panels", String(el.querySelector(".fs-hscroll__track")?.children.length || 4));
  marquees(root);
  chapters(root);
  carousels(root);
  turntables(root);
  pointerEffects(root);
}

if (typeof document !== "undefined" && typeof window !== "undefined" && !window.FARBAEK_STUDIO_MANUAL) {
  window.FarbaekStudioPro = { VERSION, init: initPro };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initPro(), { once: true });
  else initPro();
}
