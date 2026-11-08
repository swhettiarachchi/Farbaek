"use client";

/**
 * The studio (ADR 0164): how every film is shot. Farbaek's window floats in
 * a glass frame on the lit stage, turned toward a headline that sets each
 * chapter. Then the camera settles and the card that matters lifts out of
 * the window toward the viewer, big enough to read, while the window behind
 * it falls out of focus. The card is the same interface, drawn a second
 * time and cut to the card's own box, so what lifts is exactly what was
 * there. Everything is a function of film time, like the rest of the stage.
 *
 * Where a card sits depends on the interface's layout, so it's measured from
 * the window after each render and the lift is placed directly on the DOM,
 * before the frame is painted.
 */
import { CursorIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { FILM_LABEL } from "@/content/films";
import { easeInOut, easeOut, mix, progress } from "../timeline";
import { presence } from "./primitives";

/** Where the window is: its centre in the frame, its scale and its tilt in degrees. */
export interface Pose {
  x: number;
  y: number;
  s: number;
  rx: number;
  ry: number;
}

export const mixPose = (a: Pose, b: Pose, p: number): Pose => ({ x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), s: mix(a.s, b.s, p), rx: mix(a.rx, b.rx, p), ry: mix(a.ry, b.ry, p) });

/** 0 outside [from, to], rising over `fadeIn` and falling over `fadeOut`. */
export function envelope(t: number, from: number, to: number, fadeIn: number, fadeOut: number): number {
  if (t <= from || t >= to) return 0;
  return Math.min(progress(t, from, from + fadeIn, easeInOut), 1 - progress(t, to - fadeOut, to, easeInOut));
}

/** A chapter's headline: words that rise into place, an accent on one of them, and a quieter line under it. */
export interface Head {
  from: number;
  to: number;
  text: string;
  /** The word drawn in signal blue, without its punctuation. */
  accent?: string;
  sub?: string;
}

/** A card that lifts out of the window. */
export interface Lift {
  /** The scene whose interface it's cut from. */
  scene: string;
  /** `data-lift` on the element, or a way to find it in the scene. */
  target: string | ((scene: HTMLElement) => HTMLElement | null);
  from: number;
  to: number;
  /** Room around the element, filled with the window's canvas, for parts that have no card of their own. */
  pad?: number;
  maxScale?: number;
  /** Pointer clicks on the lifted card, at film times; the target is `data-film-click` or a finder inside the card. */
  clicks?: { at: number; target: string | ((card: HTMLElement) => HTMLElement | null) }[];
}

export interface StudioLayout {
  width: number;
  height: number;
  /** The interface inside the glass, and the glass around it. */
  device: { w: number; h: number; pad: number; radius: number };
  /** The window while a headline is up, while a card is lifted, and at the very start. */
  title: Pose;
  detail: Pose;
  open?: Pose;
  hero: { x: number; y: number; maxW: number; maxH: number; maxScale: number };
  head?: { x: number; y: number; size: number; width: number; subSize: number; subWidth: number };
  /** How far out of focus the window goes behind a lifted card, in px. */
  dof: number;
  perspective: number;
}

const LIFT_IN = 950;
const LIFT_OUT = 850;
/** Where the stage's vanishing point sits, as a share of its width and height. */
const PERSPECTIVE_ORIGIN = { x: 0.5, y: 0.44 };

const liftP = (t: number, l: Lift) => envelope(t, l.from, l.to, LIFT_IN, LIFT_OUT);

/** How settled the camera is on the lifted cards: lifts close together hold it there. */
function detailWeight(t: number, lifts: readonly Lift[]): number {
  const spans: [number, number][] = [];
  for (const l of [...lifts].sort((a, b) => a.from - b.from)) {
    const span: [number, number] = [l.from - 350, l.to + 150];
    const last = spans.at(-1);
    if (last && span[0] - last[1] < 1400) last[1] = Math.max(last[1], span[1]);
    else spans.push(span);
  }
  return Math.max(0, ...spans.map(([a, b]) => envelope(t, a, b, 950, 900)));
}

function poseTransform(p: Pose, w: number, h: number, z = 0): string {
  return `translate3d(${p.x}px, ${p.y}px, ${z}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) scale(${p.s}) translate(${-w / 2}px, ${-h / 2}px)`;
}

/** Layout offsets from the page, ignoring transforms, so the camera never skews a measurement. */
function offsets(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

function rectIn(el: HTMLElement, root: HTMLElement) {
  const a = offsets(el);
  const b = offsets(root);
  return { x: a.x - b.x, y: a.y - b.y, w: el.offsetWidth, h: el.offsetHeight };
}

function find<T extends HTMLElement>(target: string | ((scope: HTMLElement) => HTMLElement | null), scope: HTMLElement, attr: string): T | null {
  return (typeof target === "string" ? scope.querySelector(`[${attr}="${target}"]`) : target(scope)) as T | null;
}

/** An element whose text starts with `text`: for buttons inside real components that can't carry a data attribute. */
export function byText(selector: string, text: string, parent = false): (scope: HTMLElement) => HTMLElement | null {
  return (scope) => {
    const el = [...scope.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.trim().startsWith(text)) ?? null;
    return parent ? (el?.parentElement ?? null) : el;
  };
}

/** The chapter's headline. Each word rises out of its own mask, then leaves upward. */
export function Headline({ t, head, x, y, size, width, subSize, subWidth, align = "left" }: { t: number; head: Head; x: number; y: number; size: number; width: number; subSize: number; subWidth: number; align?: "left" | "center" }) {
  if (t < head.from - 40 || t > head.to + 40) return null;
  const words = head.text.split(" ");
  const sub = progress(t, head.from + 420, head.from + 1100) * (1 - progress(t, head.to - 560, head.to - 160, easeInOut));
  return (
    <div className="pointer-events-none absolute z-30" style={{ left: x, top: y, width, transform: `translateY(-50%)${align === "center" ? " translateX(-50%)" : ""}`, textAlign: align }}>
      <h2 className="font-medium text-ink" style={{ fontSize: size, lineHeight: 1.04, letterSpacing: "-0.045em", textWrap: "balance" }}>
        {words.map((word, i) => {
          const rise = progress(t, head.from + i * 80, head.from + i * 80 + 860, easeOut);
          const leave = progress(t, head.to - 520 + i * 40, head.to - 100 + i * 40, easeInOut);
          return (
            <span key={i}>
              <span className="inline-block overflow-hidden pb-[0.14em] align-bottom">
                <span className={`inline-block ${word.replace(/[.,!?]/g, "") === head.accent ? "text-accent" : ""}`} style={{ transform: `translateY(${(1 - rise) * 108 - leave * 108}%)` }}>
                  {word}
                </span>
              </span>
              {i < words.length - 1 ? " " : null}
            </span>
          );
        })}
      </h2>
      {head.sub ? (
        <p className="text-ink-2" style={{ marginTop: size * 0.32, fontSize: subSize, lineHeight: 1.45, maxWidth: subWidth, marginInline: align === "center" ? "auto" : undefined, opacity: sub, transform: `translateY(${(1 - sub) * 10}px)` }}>
          {head.sub}
        </p>
      ) : null}
    </div>
  );
}

/** Frosted glass around the window: a bright edge and a soft lift off the stage, its shadows tinted with ink (ADR 0183). */
function Glass({ w, h, pad, radius, children }: { w: number; h: number; pad: number; radius: number; children: ReactNode }) {
  return (
    <div
      className="relative"
      style={{
        width: w + pad * 2,
        height: h + pad * 2,
        padding: pad,
        borderRadius: radius + pad,
        background: "linear-gradient(155deg, color-mix(in oklab, var(--color-surface) 96%, transparent) 0%, color-mix(in oklab, var(--color-surface-raised) 82%, transparent) 55%, color-mix(in oklab, var(--color-surface) 90%, transparent) 100%)",
        boxShadow: [
          "inset 0 1px 0 var(--color-surface)",
          "0 0 0 1px color-mix(in oklab, var(--color-line) 90%, transparent)",
          "0 70px 120px -50px color-mix(in oklab, var(--color-ink) 38%, transparent)",
          "0 36px 80px -40px color-mix(in oklab, var(--color-ink) 14%, transparent)",
          "0 2px 8px color-mix(in oklab, var(--color-ink) 6%, transparent)",
        ].join(", "),
      }}
    >
      {children}
    </div>
  );
}

export interface StudioFilmProps {
  t: number;
  layout: StudioLayout;
  scenes: Readonly<Record<string, readonly [number, number]>>;
  content: (scene: string, t: number) => ReactNode;
  /** The padding of each scene's content inside the app's main area. */
  pad: string;
  scroll?: (scene: string, t: number) => number;
  /** The interface around the scenes: the window with the app's sidebar, or the phone's shell. */
  frame: (scenes: ReactNode) => ReactNode;
  heads?: readonly Head[];
  lifts: readonly Lift[];
  /** For a film's ending: a pose to move to, and how far the window fades and blurs as it does. */
  exit?: { from: number; to: number; pose: Pose; fade: number; blur: number };
  overlay?: ReactNode;
  label: ReactNode;
}

export function StudioFilm({ t, layout, scenes, content, pad, scroll, frame, heads = [], lifts, exit, overlay, label }: StudioFilmProps) {
  const win = useRef<HTMLDivElement>(null);
  const liftRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { device: d } = layout;
  const W = d.w + d.pad * 2;
  const H = d.h + d.pad * 2;

  const weight = detailWeight(t, lifts);
  let pose = mixPose(layout.title, layout.detail, weight);
  if (layout.open) pose = mixPose(layout.open, pose, progress(t, 0, 2000, easeOut));
  const out = exit ? progress(t, exit.from, exit.to, easeInOut) : 0;
  if (exit) pose = mixPose(pose, exit.pose, out);
  // A slow breath of movement, so a held shot never looks frozen.
  pose = { ...pose, ry: pose.ry + Math.sin(t / 2700) * 1.1, rx: pose.rx + Math.cos(t / 3300) * 0.5, y: pose.y + Math.sin(t / 3100) * 2.5 };
  const lifted = Math.max(0, ...lifts.map((l) => liftP(t, l)));
  const blur = layout.dof * lifted + (exit ? exit.blur * out : 0);
  const opacity = (1 - 0.14 * lifted) * (exit ? 1 - exit.fade * out : 1);

  // Each lift is placed from the window's layout after this render, before the frame is painted.
  useLayoutEffect(() => {
    const root = win.current;
    if (!root) return;
    lifts.forEach((l, i) => {
      const card = liftRefs.current[i];
      if (!card) return;
      const p = liftP(t, l);
      const sceneEl = root.querySelector<HTMLElement>(`[data-scene="${l.scene}"]`);
      const contentEl = sceneEl?.querySelector<HTMLElement>("[data-scene-content]");
      const el = sceneEl ? find(l.target, sceneEl, "data-lift") : null;
      const socket = root.querySelector<HTMLElement>(`[data-socket="${i}"]`);
      if (!el || !contentEl || p <= 0) {
        card.style.visibility = "hidden";
        if (socket) socket.style.visibility = "hidden";
        return;
      }
      const pad = l.pad ?? 0;
      const r = rectIn(el, root);
      const c = rectIn(el, contentEl);
      const w = r.w + pad * 2;
      const h = r.h + pad * 2;
      const radius = pad ? 22 : parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16;
      const hero = layout.hero;
      const s = Math.min(l.maxScale ?? hero.maxScale, hero.maxW / w, hero.maxH / h);
      // From where the card sits in the window to the front of the stage, in one curve.
      const e = p;
      const tx = mix(pose.x, hero.x, e);
      // Held at the front, the card drifts by a few pixels so the shot breathes.
      const ty = mix(pose.y, hero.y + Math.sin(t / 1900) * 3, e);
      const tz = Math.sin(Math.PI * e) * 160;
      const rx = mix(pose.rx, 0, e);
      const ry = mix(pose.ry, 0, e);
      const sc = mix(pose.s, s, e);
      const ix = mix(-W / 2 + r.x - pad, -w / 2, e);
      const iy = mix(-H / 2 + r.y - pad, -h / 2, e);
      card.style.visibility = "visible";
      card.style.width = `${w}px`;
      card.style.height = `${h}px`;
      // It flies in 3D, then rests flat and square to the camera while it's read: a flat layer is drawn
      // at its true size, so its text stays sharp, where a tilted one is resampled and goes soft.
      card.style.transform =
        e >= 0.999
          ? `translate(${tx}px, ${ty}px) scale(${sc}) translate(${ix}px, ${iy}px)`
          : `translate(${PERSPECTIVE_ORIGIN.x * layout.width}px, ${PERSPECTIVE_ORIGIN.y * layout.height}px) perspective(${layout.perspective}px) translate(${-PERSPECTIVE_ORIGIN.x * layout.width}px, ${-PERSPECTIVE_ORIGIN.y * layout.height}px) translate3d(${tx}px, ${ty}px, ${tz}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${sc}) translate(${ix}px, ${iy}px)`;
      const clip = card.firstElementChild as HTMLElement;
      clip.style.borderRadius = `${radius}px`;
      clip.style.boxShadow = `0 0 0 1px color-mix(in oklab, var(--color-line) ${Math.round(40 + 60 * e)}%, transparent), 0 ${Math.round(18 + 50 * e)}px ${Math.round(40 + 90 * e)}px -${Math.round(20 + 20 * e)}px color-mix(in oklab, var(--color-ink) ${Math.round(14 + 22 * e)}%, transparent), 0 ${Math.round(10 + 30 * e)}px ${Math.round(30 + 60 * e)}px -24px color-mix(in oklab, var(--color-ink) ${Math.round(4 + 10 * e)}%, transparent)`;
      // Only the element itself shows; any room around it is the card's own canvas.
      const box = clip.firstElementChild as HTMLElement;
      box.style.left = `${pad}px`;
      box.style.top = `${pad}px`;
      box.style.width = `${r.w}px`;
      box.style.height = `${r.h}px`;
      box.style.borderRadius = pad ? `${parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0}px` : "0";
      const inner = box.firstElementChild as HTMLElement;
      inner.style.left = `${-c.x}px`;
      inner.style.top = `${-c.y}px`;
      inner.style.width = `${contentEl.offsetWidth}px`;
      // A band of light crosses the card once as it rises.
      const glint = clip.lastElementChild as HTMLElement;
      glint.style.backgroundPosition = `${mix(140, -40, progress(t, l.from + 150, l.from + 1500, easeInOut))}% 0`;
      glint.style.opacity = String(1 - progress(t, l.from + 1300, l.from + 1700));
      if (socket) {
        socket.style.visibility = "visible";
        socket.style.left = `${r.x}px`;
        socket.style.top = `${r.y}px`;
        socket.style.width = `${r.w}px`;
        socket.style.height = `${r.h}px`;
        socket.style.borderRadius = `${pad ? 18 : radius}px`;
        socket.style.opacity = String(Math.min(1, p * 4));
      }
      // The pointer, when this card is clicked: it comes in from below right, presses, and leaves.
      const pointer = card.lastElementChild as HTMLElement;
      const click = (l.clicks ?? []).find((k) => t >= k.at - 1300 && t <= k.at + 900);
      const targetEl = click ? find(click.target, el, "data-film-click") : null;
      if (!click || !targetEl) {
        pointer.style.opacity = "0";
        return;
      }
      const tr = rectIn(targetEl, el);
      const ax = pad + tr.x + Math.min(tr.w * 0.62, tr.w - 10);
      const ay = pad + tr.y + tr.h * 0.62;
      const travel = progress(t, click.at - 1200, click.at - 120, easeInOut);
      pointer.style.opacity = String(Math.min(progress(t, click.at - 1300, click.at - 950), 1 - progress(t, click.at + 450, click.at + 900)));
      pointer.style.transform = `translate(${mix(ax + 150, ax, travel)}px, ${mix(ay + 110, ay, travel)}px)`;
      const press = t >= click.at && t < click.at + 260 ? 1 - Math.abs((t - click.at) / 260 - 0.5) * 2 : 0;
      const ring = pointer.firstElementChild as HTMLElement;
      const ripple = progress(t, click.at, click.at + 650);
      ring.style.opacity = t >= click.at ? String(1 - ripple) : "0";
      ring.style.transform = `scale(${mix(0.4, 1.6, ripple)})`;
      (pointer.lastElementChild as HTMLElement).style.transform = `scale(${1 - press * 0.14})`;
    });
  });

  const keysNow = Object.keys(scenes);
  const scenesNode = (
    <>
      {keysNow.map((key) => {
        const [from, to] = scenes[key]!;
        const p = presence(t, from, to, 420);
        if (p <= 0) return null;
        return (
          <div key={key} data-scene={key} className="absolute inset-0" style={{ opacity: p }}>
            <div data-scene-content className={pad} style={{ marginTop: -(scroll?.(key, t) ?? 0) }}>
              {content(key, t)}
            </div>
          </div>
        );
      })}
    </>
  );

  return (
    <div className="relative overflow-hidden bg-canvas" style={{ width: layout.width, height: layout.height }}>
      <StageLight t={t} />
      <div className="absolute inset-0" style={{ perspective: layout.perspective, perspectiveOrigin: `${PERSPECTIVE_ORIGIN.x * 100}% ${PERSPECTIVE_ORIGIN.y * 100}%` }}>
        {/* A soft contact shadow on the floor under the window. */}
        <div
          aria-hidden
          className="absolute left-0 top-0"
          style={{
            width: W * 0.92,
            height: 120,
            transformOrigin: "0 0",
            transform: `translate(${pose.x - (W * 0.92 * pose.s) / 2}px, ${pose.y + (H * pose.s) / 2 - 30 * pose.s}px) scale(${pose.s})`,
            background: "radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--color-ink) 22%, transparent), transparent 72%)",
            opacity: opacity * (1 - lifted * 0.4),
          }}
        />
        <div ref={win} data-film-window className="absolute left-0 top-0" style={{ width: W, height: H, transformOrigin: "0 0", transform: poseTransform(pose, W, H), opacity, filter: blur > 0.05 ? `blur(${blur}px) saturate(${1 - lifted * 0.15})` : undefined }}>
          <Glass w={d.w} h={d.h} pad={d.pad} radius={d.radius}>
            <div className="relative overflow-hidden" style={{ width: d.w, height: d.h, borderRadius: d.radius }}>
              {frame(scenesNode)}
            </div>
          </Glass>
          {/* Where a lifted card came from: an empty, lightly sunken place in the window. */}
          {lifts.map((_, i) => (
            <div key={i} data-socket={i} aria-hidden className="absolute border border-line-2/70 bg-canvas-2" style={{ visibility: "hidden", boxShadow: "inset 0 2px 10px color-mix(in oklab, var(--color-ink) 7%, transparent)" }} />
          ))}
        </div>
      </div>
      {/* The lifted cards carry their own perspective, the same as the window's, so at rest they can be flat. */}
      <div className="absolute inset-0">
        {lifts.map((l, i) => {
          const live = liftP(t, l) > 0;
          return (
            <div key={i} ref={(el) => void (liftRefs.current[i] = el)} aria-hidden className="absolute left-0 top-0" style={{ transformOrigin: "0 0", visibility: "hidden" }}>
              <div className="absolute inset-0 overflow-hidden bg-canvas">
                <div className="absolute overflow-hidden">
                  <div className={`absolute ${pad}`}>{live ? content(l.scene, t) : null}</div>
                </div>
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ backgroundImage: "linear-gradient(105deg, transparent 38%, color-mix(in oklab, var(--color-surface) 55%, transparent) 50%, transparent 62%)", backgroundSize: "260% 100%", opacity: 0 }}
                />
              </div>
              <div className="pointer-events-none absolute left-0 top-0 z-10" style={{ opacity: 0 }}>
                <span className="absolute -left-5 -top-5 size-10 rounded-full border-2 border-accent" style={{ opacity: 0 }} />
                <span className="relative block" style={{ transformOrigin: "4px 4px" }}>
                  <CursorIcon size={30} weight="fill" className="absolute -left-[3px] -top-[3px] text-surface" aria-hidden />
                  <CursorIcon size={24} weight="fill" className="relative text-ink" aria-hidden />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {layout.head
        ? heads.map((h, i) => <Headline key={i} t={t} head={h} x={layout.head!.x} y={layout.head!.y} size={layout.head!.size} width={layout.head!.width} subSize={layout.head!.subSize} subWidth={layout.head!.subWidth} />)
        : null}
      {overlay}
      {label}
    </div>
  );
}

/**
 * The stage's light: Farbaek's canvas lit like the homepage's aurora, a
 * slow pool of signal blue with a cyan glint, a bright spot from above and
 * the hero's dot grid fading toward the floor. It drifts with film time.
 */
export function StageLight({ t }: { t: number }) {
  const drift = (t / 1000) * 0.9;
  const poolX = 34 + Math.sin(drift * 0.33) * 9;
  const poolY = 46 + Math.cos(drift * 0.25) * 6;
  const glintX = 78 - Math.sin(drift * 0.21) * 7;
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(70% 55% at 50% -8%, var(--color-surface) 0%, transparent 70%)",
            `radial-gradient(54% 60% at ${poolX}% ${poolY}%, color-mix(in oklab, var(--color-accent) 15%, transparent) 0%, transparent 72%)`,
            `radial-gradient(40% 46% at ${glintX}% 20%, color-mix(in oklab, var(--color-accent-2) 13%, transparent) 0%, transparent 72%)`,
            "radial-gradient(90% 55% at 50% 120%, color-mix(in oklab, var(--color-accent) 9%, transparent) 0%, transparent 70%)",
            "linear-gradient(180deg, var(--color-canvas) 0%, var(--color-canvas-2) 100%)",
          ].join(", "),
        }}
      />
      <div aria-hidden className="dot-grid absolute inset-0" style={{ opacity: 0.55, maskImage: "linear-gradient(180deg, #000 0%, #000 55%, transparent 100%)" }} />
    </>
  );
}

/**
 * A loop's content: over its last 700ms the clip's opening moment fades in
 * over the current one, so the frame at the end is the frame at the start.
 */
export function looped(base: (t: number) => ReactNode, loopMs: number): (scene: string, t: number) => ReactNode {
  return function loopContent(_scene: string, t: number) {
    const seam = progress(t, loopMs - 700, loopMs, easeInOut);
    if (seam <= 0) return base(t);
    return (
      <div className="relative">
        <div style={{ opacity: 1 - seam }}>{base(t)}</div>
        <div className="absolute inset-0" style={{ opacity: seam }}>
          {base(t - loopMs)}
        </div>
      </div>
    );
  };
}

/**
 * "Sample project, recorded from Farbaek's interface." on every frame of the
 * wide formats. The portrait frame is too narrow to carry it at a readable
 * size, so it goes without: the player's caption under every film says it.
 */
export function FilmLabel({ place }: { place: "left" | "right" }) {
  const at = place === "left" ? "left-[2.6%]" : "right-[2.6%]";
  return <p className={`absolute bottom-[2.2%] ${at} z-50 whitespace-nowrap rounded-full bg-surface/85 px-2.5 py-1 text-[10px] text-ink-3 ring-1 ring-line`}>{FILM_LABEL}</p>;
}

// ------------------------------------------------------------------ the three formats

/** Landscape, 1280×800 laid out, filmed at twice that. */
export const LANDSCAPE_STUDIO: StudioLayout = {
  width: 1280,
  height: 800,
  device: { w: 1120, h: 700, pad: 10, radius: 22 },
  title: { x: 858, y: 414, s: 0.6, rx: 6, ry: -15 },
  detail: { x: 640, y: 404, s: 0.88, rx: 3, ry: -4 },
  open: { x: 930, y: 470, s: 0.46, rx: 16, ry: -28 },
  hero: { x: 640, y: 398, maxW: 930, maxH: 590, maxScale: 1.5 },
  head: { x: 88, y: 404, size: 62, width: 410, subSize: 19, subWidth: 370 },
  dof: 7,
  perspective: 1700,
};

/** Portrait, 432×540: the app at a phone's width, the headline above it. */
export const PORTRAIT_STUDIO: StudioLayout = {
  width: 432,
  height: 540,
  device: { w: 384, h: 500, pad: 8, radius: 30 },
  title: { x: 216, y: 362, s: 0.6, rx: 8, ry: -8 },
  detail: { x: 216, y: 272, s: 0.92, rx: 3, ry: -3 },
  open: { x: 216, y: 420, s: 0.48, rx: 18, ry: -14 },
  hero: { x: 216, y: 266, maxW: 404, maxH: 450, maxScale: 1.3 },
  head: { x: 24, y: 104, size: 31, width: 384, subSize: 14, subWidth: 360 },
  dof: 5,
  perspective: 1100,
};

/** The 4:3 feature clips, 1024×768: no headline, since the page sets each one. */
export const CLIP_STUDIO: StudioLayout = {
  width: 1024,
  height: 768,
  device: { w: 1000, h: 680, pad: 10, radius: 22 },
  title: { x: 512, y: 390, s: 0.84, rx: 5, ry: -7 },
  detail: { x: 512, y: 388, s: 0.8, rx: 3, ry: -3 },
  hero: { x: 512, y: 378, maxW: 850, maxH: 590, maxScale: 1.5 },
  dof: 6,
  perspective: 1500,
};
