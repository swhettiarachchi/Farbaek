/**
 * Farbaek Scenes v1 (ADR 0156): premium 3D moments for the sites Farbaek
 * builds. A page marks a box and loads this module once:
 *
 *   <div class="hero-scene" data-farbaek-scene="aurora" data-farbaek-media="hero-scene">
 *     <img src="poster.webp" alt="" data-farbaek-poster>
 *   </div>
 *   <script type="module" src="https://www.farbaek.com/kit/scenes/v1/scenes.js"></script>
 *
 * Scenes: aurora, glass, particles, horizon, orb, gallery. Colours come from
 * data-palette ("#hex,#hex,#hex") or the page's CSS variables (--scene-1..3,
 * --accent, --accent-2, --brand, --primary). Options: data-tone ("dark" or
 * "light", else read from the background), data-intensity (0 to 1),
 * data-speed (1 is a 16 s loop), data-backdrop ("solid" or "none").
 *
 * The still comes first: the poster image, or a gradient in the scene's
 * colours. WebGL starts only when the box nears the screen, never under
 * reduced motion, Save-Data, a weak device or without WebGL; it pauses off
 * screen and in a hidden tab, and caps the pixel ratio (1.5 on touch).
 * Every scene is a function of a looping phase, so it repeats seamlessly.
 *
 * This path never changes. A new version gets a new path (v2), so published
 * sites keep working.
 */

export const VERSION = "1.0.0";
export const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js";
export const SCENES = ["aurora", "glass", "particles", "horizon", "orb", "gallery"];
/** Scenes that are a whole background; the others float over the page unless data-backdrop="solid". */
const FULL_BLEED = new Set(["aurora", "horizon", "glass"]);
const DEFAULT_PERIOD = 16;

const DEFAULTS = {
  dark: { base: [0.043, 0.059, 0.118], colors: [[0.141, 0.314, 0.941], [0.133, 0.827, 0.933], [0.91, 0.933, 0.988]] },
  light: { base: [0.976, 0.98, 0.992], colors: [[0.141, 0.314, 0.941], [0.039, 0.431, 0.522], [0.067, 0.09, 0.2]] },
};

// ---------------------------------------------------------------------------
// Pure helpers (no DOM, no three.js), exported for tests.

/** "#abc", "#aabbcc", "rgb(…)" or "rgba(…)" as [r, g, b] from 0 to 1, or null. */
export function parseColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16) / 255);
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/.exec(v);
  if (m) {
    const c = [m[1], m[2], m[3]].map((n) => Number(n) / 255);
    return c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ? c : null;
  }
  return null;
}

/** Relative luminance of an sRGB colour, 0 to 1. */
export function luminance([r, g, b]) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Whether WebGL may run here, and why not when it may not. `env` is what the
 * page could read: reducedMotion, saveData, cores, memory (GB, or undefined
 * where the browser doesn't say) and webgl.
 */
export function canRun3D(env, force = false) {
  if (!env.webgl) return { ok: false, reason: "no-webgl" };
  if (force) return { ok: true, reason: null };
  if (env.reducedMotion) return { ok: false, reason: "reduced-motion" };
  if (env.saveData) return { ok: false, reason: "save-data" };
  if (typeof env.cores === "number" && env.cores < 4) return { ok: false, reason: "weak-device" };
  if (typeof env.memory === "number" && env.memory < 4) return { ok: false, reason: "weak-device" };
  return { ok: true, reason: null };
}

/** The pixel ratio to render at: sharp, but never more than the device can afford. */
export function pixelRatio(dpr, coarse) {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(d, coarse ? 1.5 : 2);
}

const clamp01 = (n, fallback) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback);

/** A box's options from its data attributes (a plain object, so tests can pass one). */
export function readOptions(data) {
  const scene = SCENES.includes(data.farbaekScene) ? data.farbaekScene : "aurora";
  const speed = Number(data.speed);
  const palette = typeof data.palette === "string" ? data.palette.split(",").map(parseColor).filter(Boolean) : [];
  return {
    scene,
    tone: data.tone === "light" || data.tone === "dark" ? data.tone : null,
    intensity: clamp01(Number(data.intensity), 0.85),
    period: DEFAULT_PERIOD / (Number.isFinite(speed) && speed > 0 ? Math.min(speed, 4) : 1),
    palette: palette.slice(0, 3),
    backdrop: data.backdrop === "solid" || data.backdrop === "none" ? data.backdrop : FULL_BLEED.has(scene) ? "solid" : "none",
    images: typeof data.images === "string" ? data.images.split(",").map((s) => s.trim()).filter(safeImageSrc) : [],
  };
}

/** An image address the gallery may load: https, an inline image, or a path on the site itself. */
export function safeImageSrc(src) {
  if (typeof src !== "string" || !src || src.length > 2048 || /\s/.test(src)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return /^https:\/\//i.test(src) || /^data:image\/(png|jpe?g|webp|gif|avif);/i.test(src);
  return !src.startsWith("//");
}

/** Fills a palette up to three colours from the defaults for its tone. */
export function completePalette(colors, tone) {
  const d = DEFAULTS[tone === "light" ? "light" : "dark"];
  return [0, 1, 2].map((i) => colors[i] ?? d.colors[i]);
}

/** The loop's phase, 0 to 2π, at a time in seconds. */
export function phaseAt(seconds, period) {
  const p = period > 0 ? period : DEFAULT_PERIOD;
  return (((seconds % p) + p) % p) / p * Math.PI * 2;
}

// ---------------------------------------------------------------------------
// Reading the page.

let webglSupport = null;
/** Whether WebGL 2 works here, tested once per page; the test context is released at once, so it never counts against the browser's limit. */
function hasWebGL() {
  if (webglSupport !== null) return webglSupport;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webglSupport = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function readEnvironment() {
  const mq = (q) => typeof matchMedia === "function" && matchMedia(q).matches;
  const webgl = hasWebGL();
  const nav = typeof navigator === "object" ? navigator : {};
  return {
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    saveData: !!nav.connection?.saveData,
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    webgl,
    coarse: mq("(pointer: coarse)"),
    finePointer: mq("(hover: hover) and (pointer: fine)"),
  };
}

let probe = null;
/** Any CSS colour (oklch, names, variables already resolved) as sRGB [r, g, b], by painting one pixel. */
function cssColor(value) {
  const direct = parseColor(value);
  if (direct || !value || !value.trim()) return direct;
  try {
    probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "#000";
    probe.fillStyle = value.trim();
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    return a === 0 ? null : [r / 255, g / 255, b / 255];
  } catch {
    return null;
  }
}

function backgroundOf(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    const c = cssColor(bg);
    if (c && !/rgba\([^)]*,\s*0\)$/.test(bg) && bg !== "transparent") return c;
  }
  return [1, 1, 1];
}

function readPalette(el, opts) {
  const style = getComputedStyle(el);
  const vars = ["--scene-1", "--scene-2", "--scene-3", "--accent", "--accent-2", "--brand", "--primary", "--secondary", "--color-accent", "--color-primary"];
  const found = [...opts.palette];
  for (const name of vars) {
    if (found.length >= 3) break;
    const c = cssColor(style.getPropertyValue(name));
    if (c && !found.some((f) => f.every((x, i) => Math.abs(x - c[i]) < 0.02))) found.push(c);
  }
  const bg = cssColor(style.getPropertyValue("--scene-base")) ?? backgroundOf(el);
  const tone = opts.tone ?? (luminance(bg) > 0.45 ? "light" : "dark");
  return { base: bg, colors: completePalette(found, tone), tone };
}

const hex = ([r, g, b]) => "#" + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

/** The still: the box's poster if it has one, else a gradient in the scene's colours. */
function paintStill(el, pal) {
  if (el.querySelector("[data-farbaek-poster], img, video")) return;
  const [a, b] = pal.colors;
  const alpha = pal.tone === "light" ? "33" : "55";
  el.style.backgroundImage = `radial-gradient(60% 70% at 25% 35%, ${hex(a)}${alpha}, transparent 70%), radial-gradient(55% 60% at 78% 62%, ${hex(b)}${alpha}, transparent 70%)`;
  if (!el.style.backgroundColor) el.style.backgroundColor = hex(pal.base);
}

// ---------------------------------------------------------------------------
// Shaders shared by the scenes.

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const OUT = `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

// A quad drawn behind everything, in screen space: backdrops and skies.
const SCREEN_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;

const BACKDROP_FRAG = `
varying vec2 vUv;
uniform vec3 uBase, uA, uB; uniform float uPhase, uLight, uAspect;
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 c1 = vec2(-0.32, 0.12) + 0.10 * vec2(cos(uPhase), sin(uPhase));
  vec2 c2 = vec2(0.36, -0.14) + 0.10 * vec2(cos(uPhase + 2.1), sin(uPhase + 2.1));
  float g1 = exp(-dot(p - c1, p - c1) * 5.0);
  float g2 = exp(-dot(p - c2, p - c2) * 6.0);
  vec3 col = uLight > 0.5 ? mix(mix(uBase, uA, g1 * 0.3), uB, g2 * 0.26) : uBase + uA * g1 * 0.55 + uB * g2 * 0.5;
  col *= mix(0.86, 1.0, smoothstep(1.1, 0.2, length(p)));
  gl_FragColor = vec4(col, 1.0);${OUT}
}`;

// Behind glass: the same light, plus fine lines the glass visibly bends.
const GLASS_BACKDROP_FRAG = `
varying vec2 vUv;
uniform vec3 uBase, uA, uB, uC; uniform float uPhase, uLight, uAspect;
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 c1 = vec2(-0.30, 0.10) + 0.09 * vec2(cos(uPhase), sin(uPhase));
  vec2 c2 = vec2(0.34, -0.12) + 0.09 * vec2(cos(uPhase + 2.1), sin(uPhase + 2.1));
  float g1 = exp(-dot(p - c1, p - c1) * 4.0);
  float g2 = exp(-dot(p - c2, p - c2) * 5.0);
  vec3 col = uLight > 0.5 ? mix(mix(uBase, uA, g1 * 0.55), uB, g2 * 0.5) : uBase + uA * g1 * 0.6 + uB * g2 * 0.54;
  float lines = smoothstep(0.455, 0.49, abs(fract((p.x * 0.9 + p.y * 0.35) * 11.0) - 0.5));
  col = mix(col, uLight > 0.5 ? col * 0.86 : col + uC * 0.12, lines * 0.6);
  col *= mix(0.84, 1.0, smoothstep(1.1, 0.2, length(p)));
  gl_FragColor = vec4(col, 1.0);${OUT}
}`;

// ---------------------------------------------------------------------------
// The scenes. Each gets THREE and a context and returns update(phase, pointer),
// resize(w, h) and dispose(). Everything they draw is a function of the phase.

function screenQuad(T, fragmentShader, uniforms) {
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ vertexShader: SCREEN_VERT, fragmentShader, uniforms, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** How far back a camera stands so a form `halfWidth` wide fits across a narrow box, never closer than `min`. */
function fitDistance(camera, halfWidth, min) {
  const t = Math.tan((camera.fov * Math.PI) / 360);
  return Math.max(min, halfWidth / (t * Math.max(0.3, camera.aspect)));
}

function colorUniforms(T, pal) {
  const c = (rgb) => new T.Color().setRGB(rgb[0], rgb[1], rgb[2], T.SRGBColorSpace);
  return {
    uBase: { value: c(pal.base) },
    uA: { value: c(pal.colors[0]) },
    uB: { value: c(pal.colors[1]) },
    uC: { value: c(pal.colors[2]) },
    uLight: { value: pal.tone === "light" ? 1 : 0 },
  };
}

const SCENE_BUILDERS = {
  aurora(T, ctx) {
    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = { ...colorUniforms(T, ctx.pal), uPhase: { value: 0 }, uAspect: { value: 1 }, uPointer: { value: new T.Vector2() }, uIntensity: { value: ctx.opts.intensity } };
    const frag = `
varying vec2 vUv;
uniform vec3 uBase, uA, uB, uC; uniform float uPhase, uLight, uAspect, uIntensity; uniform vec2 uPointer;
${NOISE}
// One curtain of light: a sharp lower edge, rays rising above it, drifting with the loop.
float curtain(vec2 q, float base, float amp, float freq, float off, float ph, out float d){
  vec2 c = vec2(cos(ph), sin(ph));
  float edge = base + amp * sin(q.x * freq + ph + off) + 0.07 * snoise(vec3(q.x * 1.1 + c * 0.35, off));
  d = q.y - edge;
  float below = exp(-pow(max(-d, 0.0) * 26.0, 2.0));
  float above = exp(-max(d, 0.0) * 3.2);
  float rays = 0.35 + 0.65 * pow(0.5 + 0.5 * snoise(vec3(q.x * 11.0 + c * 0.6, off + 3.0)), 1.6);
  return below * above * rays;
}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 q = p + uPointer * 0.03;
  float d1, d2, d3;
  float a1 = curtain(q, -0.02, 0.10, 1.4, 0.0, uPhase, d1);
  float a2 = curtain(q, -0.17, 0.07, 2.1, 2.3, -uPhase, d2);
  float a3 = curtain(q, 0.16, 0.06, 1.0, 4.1, 2.0 * uPhase, d3);
  vec3 c1 = mix(uB, uA, smoothstep(0.0, 0.22, d1));
  vec3 c2 = mix(uB, uA, smoothstep(0.0, 0.18, d2));
  vec3 c3 = mix(uA, uC, 0.25);
  vec3 col = uBase;
  if (uLight > 0.5) {
    vec3 tint = c1 * a1 + c2 * a2 * 0.7 + c3 * a3 * 0.5;
    float k = clamp((a1 + a2 * 0.7 + a3 * 0.5) * 0.45 * uIntensity, 0.0, 0.6);
    col = mix(col, tint / max(a1 + a2 * 0.7 + a3 * 0.5, 0.001), k);
  } else {
    col *= 0.9 + 0.35 * smoothstep(-0.5, 0.5, -p.y);
    col += (c1 * a1 + c2 * a2 * 0.65 + c3 * a3 * 0.45) * 0.85 * uIntensity;
    col += uC * pow(a1, 3.0) * 0.25 * uIntensity;
    vec2 sp = floor(vUv * vec2(uAspect, 1.0) * 260.0);
    float h = fract(sin(dot(sp, vec2(12.9898, 78.233))) * 43758.5453);
    col += uC * step(0.9972, h) * (0.35 + 0.25 * sin(uPhase * 3.0 + h * 60.0)) * smoothstep(0.1, 0.45, p.y + 0.25);
  }
  col = mix(uBase, col, mix(0.75, 1.0, smoothstep(1.4, 0.25, length(p * vec2(0.7, 1.0)))));
  gl_FragColor = vec4(col, 1.0);${OUT}
}`;
    scene.add(screenQuad(T, frag, uniforms));
    return {
      scene,
      camera,
      update(phase, pointer) {
        uniforms.uPhase.value = phase;
        uniforms.uPointer.value.set(pointer.x, pointer.y);
      },
      resize(w, h) {
        uniforms.uAspect.value = w / Math.max(1, h);
      },
    };
  },

  particles(T, ctx) {
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.4, 7.2);
    camera.lookAt(0, 0, 0);
    const count = Math.round((ctx.coarse ? 3200 : 9000) * (0.5 + ctx.opts.intensity * 0.5));
    const dir = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const t = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      dir.set([s * Math.cos(t), u, s * Math.sin(t)], i * 3);
      rand[i] = rnd();
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(dir, 3));
    geo.setAttribute("aRand", new T.BufferAttribute(rand, 1));
    const uniforms = { ...colorUniforms(T, ctx.pal), uPhase: { value: 0 }, uPixel: { value: ctx.dpr }, uSize: { value: ctx.coarse ? 44 : 38 } };
    const light = ctx.pal.tone === "light";
    const mat = new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: light ? T.NormalBlending : T.AdditiveBlending,
      vertexShader: `
attribute float aRand;
uniform float uPhase, uPixel, uSize; uniform vec3 uA, uB, uC;
varying vec3 vColor; varying float vAlpha;
${NOISE}
void main(){
  float m = smoothstep(0.0, 1.0, 0.5 - 0.5 * cos(uPhase));
  vec3 d = position;
  vec3 sphere = d * (1.5 + 0.14 * aRand);
  float ang = atan(d.z, d.x);
  vec3 ring = vec3(cos(ang) * (2.15 + (aRand - 0.5) * 0.55), d.y * 0.16, sin(ang) * (2.15 + (aRand - 0.5) * 0.55));
  vec3 p = mix(sphere, ring, m);
  vec2 c = vec2(cos(uPhase), sin(uPhase));
  p += 0.16 * vec3(snoise(p * 0.8 + vec3(c, 0.0)), snoise(p * 0.8 + vec3(0.0, c) + 7.0), snoise(p * 0.8 + vec3(c.y, 0.0, c.x) + 13.0));
  float a = uPhase; float ca = cos(a), sa = sin(a);
  p = vec3(ca * p.x + sa * p.z, p.y, -sa * p.x + ca * p.z);
  float tilt = 0.32; p = vec3(p.x, cos(tilt) * p.y - sin(tilt) * p.z, sin(tilt) * p.y + cos(tilt) * p.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixel * (0.45 + aRand * 0.9) / -mv.z;
  vColor = mix(mix(uA, uB, aRand), uC, smoothstep(0.86, 1.0, aRand));
  vAlpha = 0.45 + 0.55 * aRand;
}`,
      fragmentShader: `
varying vec3 vColor; varying float vAlpha; uniform float uLight;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = uLight > 0.5 ? vec4(vColor, a * 0.85) : vec4(vColor * a, a);${OUT}
}`,
    });
    const points = new T.Points(geo, mat);
    scene.add(points);
    if (ctx.opts.backdrop === "solid") scene.add(screenQuad(T, BACKDROP_FRAG, ctx.backdropUniforms));
    return {
      scene,
      camera,
      update(phase, pointer) {
        uniforms.uPhase.value = phase;
        camera.position.x = pointer.x * 0.5;
        camera.position.y = 0.4 + pointer.y * 0.3;
        camera.lookAt(0, 0, 0);
      },
      resize(w, h) {
        camera.aspect = w / Math.max(1, h);
        camera.position.z = fitDistance(camera, 2.7, 7.2);
        camera.updateProjectionMatrix();
      },
    };
  },

  horizon(T, ctx) {
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(55, 1, 0.1, 120);
    camera.position.set(0, 1.25, 6);
    camera.lookAt(0, 0.55, -10);
    const L = 10;
    const seg = ctx.coarse ? 110 : 170;
    const geo = new T.PlaneGeometry(44, 44, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -14);
    const uniforms = { ...colorUniforms(T, ctx.pal), uScroll: { value: 0 }, uPhase: { value: 0 }, uIntensity: { value: ctx.opts.intensity } };
    const mat = new T.ShaderMaterial({
      uniforms,
      vertexShader: `
uniform float uScroll;
varying vec3 vW; varying float vH; varying float vDepth;
const float TAU = 6.28318530718;
float height(vec2 p){
  float z = p.y + uScroll;
  float k = TAU / ${L.toFixed(1)};
  float h = 0.55 * sin(p.x * 0.55 + z * k) * sin(z * k * 2.0 + 1.3)
          + 0.32 * sin(p.x * 1.15 - z * k * 3.0 + 0.7)
          + 0.18 * sin(p.x * 2.1 + z * k * 5.0 + 2.2);
  return h * smoothstep(0.7, 3.4, abs(p.x)) * (1.0 + 0.25 * abs(p.x));
}
void main(){
  vec3 p = position;
  p.y += height(p.xz);
  vW = vec3(p.x, p.y, p.z + uScroll);
  vH = p.y;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `
uniform vec3 uBase, uA, uB, uC; uniform float uLight, uIntensity;
varying vec3 vW; varying float vH; varying float vDepth;
void main(){
  vec2 g = vW.xz;
  vec2 grid = abs(fract(g - 0.5) - 0.5) / fwidth(g);
  float line = 1.0 - min(min(grid.x, grid.y), 1.0);
  vec3 lineCol = mix(uA, uB, smoothstep(-0.2, 1.2, vH));
  vec3 fill = uLight > 0.5 ? uBase * 0.97 : uBase * 1.25 + uA * 0.025;
  vec3 col = mix(fill, lineCol, line * (uLight > 0.5 ? 0.75 : 0.9) * uIntensity);
  float fog = smoothstep(6.0, 34.0, vDepth);
  vec3 horizonCol = uLight > 0.5 ? mix(uBase, uB, 0.12) : mix(uBase, uA, 0.32);
  col = mix(col, horizonCol, fog);
  gl_FragColor = vec4(col, 1.0);${OUT}
}`,
    });
    scene.add(new T.Mesh(geo, mat));
    const sky = { ...colorUniforms(T, ctx.pal), uAspect: { value: 1 } };
    scene.add(
      screenQuad(
        T,
        `
varying vec2 vUv; uniform vec3 uBase, uA, uB; uniform float uLight, uAspect;
void main(){
  float y = vUv.y;
  vec3 top = uLight > 0.5 ? uBase : uBase * 0.8;
  vec3 hz = uLight > 0.5 ? mix(uBase, uB, 0.18) : mix(uBase, uA, 0.42);
  vec3 col = mix(hz, top, smoothstep(0.46, 1.0, y));
  vec2 s = (vUv - vec2(0.5, 0.5)) * vec2(uAspect, 1.0);
  float sun = exp(-dot(s, s) * 14.0);
  col += (uLight > 0.5 ? uB * 0.12 : uB * 0.42) * sun;
  gl_FragColor = vec4(col, 1.0);${OUT}
}`,
        sky,
      ),
    );
    return {
      scene,
      camera,
      update(phase, pointer) {
        uniforms.uScroll.value = (phase / (Math.PI * 2)) * L;
        camera.position.x = pointer.x * 0.6;
        camera.position.y = 1.25 + pointer.y * 0.25;
        camera.lookAt(pointer.x * 0.3, 0.55, -10);
      },
      resize(w, h) {
        camera.aspect = w / Math.max(1, h);
        camera.fov = camera.aspect < 1 ? 68 : 55;
        camera.updateProjectionMatrix();
        sky.uAspect.value = camera.aspect;
      },
    };
  },

  orb(T, ctx) {
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.6, 9);
    camera.lookAt(0, 0, 0);
    const uniforms = { ...colorUniforms(T, ctx.pal), uPhase: { value: 0 } };
    const orb = new T.Mesh(
      new T.SphereGeometry(1.35, ctx.coarse ? 64 : 96, ctx.coarse ? 48 : 72),
      new T.ShaderMaterial({
        uniforms,
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `
uniform vec3 uA, uB, uC; uniform float uPhase, uLight;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE}
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float f = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  vec2 c = vec2(cos(uPhase), sin(uPhase));
  float drift = snoise(vec3(vP * 0.5 + vec3(c * 0.3, 0.0)));
  float lat = sin(vP.y * 5.0 + drift * 1.5) * 0.5 + 0.5;
  vec3 body = mix(uA * 0.22, uB * 0.55, smoothstep(-0.9, 1.1, n.y * 0.8 + drift * 0.5));
  body = mix(body, body * 1.18, lat * 0.25);
  vec3 L = normalize(vec3(-0.55, 0.65, 0.55));
  float l = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  float spec = pow(max(dot(reflect(-L, n), v), 0.0), 48.0);
  vec3 col = body * (0.3 + 0.9 * l) + mix(uB, uC, 0.55) * f * 1.1 + vec3(1.0) * spec * 0.45;
  if (uLight > 0.5) col = mix(col, vec3(1.0), 0.2);
  gl_FragColor = vec4(col, 1.0);${OUT}
}`,
      }),
    );
    scene.add(orb);
    // A soft atmosphere: the back faces of a slightly larger sphere, glowing at the rim.
    const halo = new T.Mesh(
      new T.SphereGeometry(1.62, 64, 48),
      new T.ShaderMaterial({
        uniforms,
        side: T.BackSide,
        transparent: true,
        depthWrite: false,
        blending: ctx.pal.tone === "light" ? T.NormalBlending : T.AdditiveBlending,
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uB, uC; uniform float uLight; varying vec3 vN; varying vec3 vV;
void main(){ float i = pow(clamp(1.0 + dot(normalize(vN), normalize(vV)) * 1.1, 0.0, 1.0), 3.0); vec3 col = mix(uB, uC, 0.3); gl_FragColor = vec4(col * i, i * (uLight > 0.5 ? 0.35 : 0.8));${OUT} }`,
      }),
    );
    scene.add(halo);
    const ringMat = new T.MeshBasicMaterial({ color: uniforms.uC.value, transparent: true, opacity: ctx.pal.tone === "light" ? 0.55 : 0.5 });
    const ringA = new T.Mesh(new T.TorusGeometry(2.25, 0.0085, 8, 220), ringMat);
    const ringB = new T.Mesh(new T.TorusGeometry(2.85, 0.006, 8, 260), ringMat);
    ringA.rotation.set(Math.PI / 2.25, 0, 0.18);
    ringB.rotation.set(Math.PI / 1.85, 0.1, -0.3);
    scene.add(ringA, ringB);
    const moonMat = new T.MeshBasicMaterial({ color: uniforms.uC.value });
    const moonA = new T.Mesh(new T.SphereGeometry(0.075, 24, 16), moonMat);
    const moonB = new T.Mesh(new T.SphereGeometry(0.05, 24, 16), moonMat);
    ringA.add(moonA);
    ringB.add(moonB);
    if (ctx.opts.backdrop === "solid") scene.add(screenQuad(T, BACKDROP_FRAG, ctx.backdropUniforms));
    return {
      scene,
      camera,
      update(phase, pointer) {
        uniforms.uPhase.value = phase;
        orb.rotation.y = phase;
        orb.position.y = Math.sin(phase * 2) * 0.06;
        moonA.position.set(Math.cos(phase) * 2.25, Math.sin(phase) * 2.25, 0);
        moonB.position.set(Math.cos(-2 * phase + 1.7) * 2.85, Math.sin(-2 * phase + 1.7) * 2.85, 0);
        camera.position.x = pointer.x * 0.7;
        camera.position.y = 0.6 + pointer.y * 0.4;
        camera.lookAt(0, 0, 0);
      },
      resize(w, h) {
        camera.aspect = w / Math.max(1, h);
        camera.position.z = fitDistance(camera, 3.1, 9);
        camera.updateProjectionMatrix();
      },
    };
  },

  glass(T, ctx, renderer) {
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 8.5);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = ctx.pal.tone === "light" ? 1.05 : 1.15;
    if ("transmissionResolutionScale" in renderer) renderer.transmissionResolutionScale = ctx.coarse ? 0.5 : 1;
    // A small studio for reflections: a dim room with strip lights in the palette.
    const room = new T.Scene();
    room.add(new T.Mesh(new T.BoxGeometry(12, 12, 12), new T.MeshBasicMaterial({ color: new T.Color().setRGB(...ctx.pal.base, T.SRGBColorSpace).multiplyScalar(0.6), side: T.BackSide })));
    const strip = (color, scale, x, y, z, ry) => {
      const m = new T.Mesh(new T.PlaneGeometry(4.5, 0.9), new T.MeshBasicMaterial({ color: new T.Color().setRGB(...color, T.SRGBColorSpace).multiplyScalar(scale), side: T.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      room.add(m);
    };
    strip([1, 1, 1], 7, 0, 4.5, 0, 0);
    strip(ctx.pal.colors[0], 5, -5.5, 1, 0, Math.PI / 2);
    strip(ctx.pal.colors[1], 5, 5.5, -0.5, 0, -Math.PI / 2);
    strip([1, 1, 1], 3, 0, -1, -5.5, 0);
    const pmrem = new T.PMREMGenerator(renderer);
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    room.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    pmrem.dispose();
    const form = new T.Mesh(
      new T.TorusKnotGeometry(1.05, 0.3, ctx.coarse ? 160 : 260, ctx.coarse ? 24 : 36, 2, 3),
      new T.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 1,
        thickness: 1.6,
        roughness: 0.03,
        ior: 1.5,
        dispersion: ctx.coarse ? 2 : 4,
        iridescence: 0.5,
        iridescenceIOR: 1.3,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        attenuationColor: new T.Color().setRGB(...ctx.pal.colors[1], T.SRGBColorSpace).lerp(new T.Color(1, 1, 1), 0.55),
        attenuationDistance: 6,
        envMapIntensity: 1.4,
      }),
    );
    scene.add(form);
    scene.add(screenQuad(T, GLASS_BACKDROP_FRAG, ctx.backdropUniforms));
    return {
      scene,
      camera,
      update(phase, pointer) {
        ctx.backdropUniforms.uPhase.value = phase;
        form.rotation.set(0.35 * Math.sin(phase) + pointer.y * 0.25, phase + pointer.x * 0.3, 0.12 * Math.cos(phase));
        form.position.y = Math.sin(phase * 2) * 0.08;
      },
      resize(w, h) {
        camera.aspect = w / Math.max(1, h);
        camera.position.z = fitDistance(camera, 1.95, 8.5);
        camera.updateProjectionMatrix();
      },
      dispose() {
        env.dispose();
      },
    };
  },

  gallery(T, ctx) {
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 9);
    const group = new T.Group();
    scene.add(group);
    const loader = new T.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const sources = ctx.images.length ? ctx.images : [null, null, null, null, null];
    const cards = [];
    const n = Math.min(sources.length, 7);
    const ARC = 6.5;
    const loads = [];
    for (let i = 0; i < n; i++) {
      const uniforms = { uMap: { value: null }, uHas: { value: 0 }, uTint: { value: new T.Color().setRGB(...ctx.pal.colors[i % 3], T.SRGBColorSpace) }, uAspect: { value: 1.5 } };
      const mat = new T.ShaderMaterial({
        uniforms,
        transparent: true,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
varying vec2 vUv; uniform sampler2D uMap; uniform float uHas, uAspect; uniform vec3 uTint;
void main(){
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 b = vec2(uAspect, 1.0) * 0.5 - 0.06;
  float d = length(max(abs(q) - b + 0.06, 0.0)) - 0.06;
  float a = 1.0 - smoothstep(0.0, 0.006, d);
  vec3 col = uHas > 0.5 ? texture2D(uMap, vUv).rgb : mix(uTint * 0.6, uTint, vUv.y);
  gl_FragColor = vec4(col, a);${OUT}
}`,
      });
      const card = new T.Mesh(new T.PlaneGeometry(2.4, 1.6), mat);
      cards.push(card);
      group.add(card);
      if (sources[i]) {
        loads.push(
          new Promise((resolve) => {
            loader.load(
              sources[i],
              (tex) => {
                tex.colorSpace = T.SRGBColorSpace;
                const img = tex.image;
                const aspect = img && img.width && img.height ? img.width / img.height : 1.5;
                const ar = Math.min(1.8, Math.max(0.7, aspect));
                card.geometry.dispose();
                card.geometry = new T.PlaneGeometry(1.6 * ar, 1.6);
                uniforms.uAspect.value = ar;
                uniforms.uMap.value = tex;
                uniforms.uHas.value = 1;
                resolve();
              },
              undefined,
              () => resolve(),
            );
          }),
        );
      }
    }
    if (ctx.opts.backdrop === "solid") scene.add(screenQuad(T, BACKDROP_FRAG, ctx.backdropUniforms));
    return {
      scene,
      camera,
      ready: Promise.all(loads),
      update(phase, pointer) {
        // Cards on a gently curved arc, facing the viewer, each floating on its own beat.
        cards.forEach((card, i) => {
          const a = (i - (n - 1) / 2) * 0.4 + Math.sin(phase) * 0.05;
          card.position.set(Math.sin(a) * ARC, Math.sin(phase + i * 1.3) * 0.12, (Math.cos(a) - 1) * ARC);
          card.rotation.y = -a * 0.85;
        });
        group.rotation.y = pointer.x * 0.12;
        group.rotation.x = pointer.y * 0.06;
      },
      resize(w, h) {
        camera.aspect = w / Math.max(1, h);
        // Frame the middle three cards (one on a narrow screen); the rest run off the edges.
        const visible = Math.min(n, camera.aspect < 1 ? 1 : 3);
        const half = Math.sin(((visible - 1) / 2) * 0.4) * ARC + 1.45;
        camera.position.z = Math.max(5.5, half / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect) + 0.6);
        camera.updateProjectionMatrix();
      },
      dispose() {
        cards.forEach((c) => c.material.uniforms.uMap.value?.dispose());
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Mounting.

let threePromise = null;
const loadThree = (url) => (threePromise ??= import(/* @vite-ignore */ url));

function makeStillController(el, reason) {
  el.dataset.farbaekSceneState = "still";
  if (reason) el.dataset.farbaekSceneReason = reason;
  return { state: "still", reason, ready: Promise.resolve(), renderAt() {}, pause() {}, resume() {}, destroy() {} };
}

/**
 * Mounts a scene in `el`. Options override the box's data attributes; the
 * recorder passes { manual: true, force: true, pixelRatio: 1 } and steps
 * frames with renderAt(seconds).
 */
export async function mount(el, overrides = {}) {
  if (!el || el.nodeType !== 1) throw new TypeError("mount needs an element");
  if (el.__farbaekScene) return el.__farbaekScene;
  const opts = { ...readOptions({ ...el.dataset }), ...overrides };
  const env = readEnvironment();
  const pal = readPalette(el, opts);
  paintStill(el, pal);
  const gate = canRun3D(env, !!opts.force);
  if (!gate.ok) return (el.__farbaekScene = makeStillController(el, gate.reason));
  const placeholder = makeStillController(el, null);
  el.__farbaekScene = placeholder;

  let T;
  try {
    T = await loadThree(opts.threeUrl ?? THREE_URL);
  } catch {
    return (el.__farbaekScene = makeStillController(el, "three-unavailable"));
  }
  if (el.__farbaekScene !== placeholder) return el.__farbaekScene;

  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;opacity:0;transition:opacity .9s cubic-bezier(.16,1,.3,1)";
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: !env.coarse, alpha: opts.backdrop !== "solid", powerPreference: "high-performance", preserveDrawingBuffer: !!opts.manual });
  } catch {
    return (el.__farbaekScene = makeStillController(el, "no-webgl"));
  }
  const dpr = opts.pixelRatio ?? pixelRatio(globalThis.devicePixelRatio, env.coarse);
  renderer.setPixelRatio(dpr);
  if (opts.backdrop === "solid") renderer.setClearColor(new T.Color().setRGB(...pal.base, T.SRGBColorSpace), 1);
  else renderer.setClearColor(0x000000, 0);

  const images = opts.images.length ? opts.images : [...el.querySelectorAll("img")].map((i) => i.currentSrc || i.src).filter(safeImageSrc);
  const backdropUniforms = { ...colorUniforms(T, pal), uPhase: { value: 0 }, uAspect: { value: 1 } };
  const ctx = { pal, opts, coarse: env.coarse, dpr, images, backdropUniforms };
  const built = SCENE_BUILDERS[opts.scene](T, ctx, renderer);
  el.appendChild(canvas);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let width = 0;
  let height = 0;
  const size = () => {
    const w = Math.max(1, Math.round(el.clientWidth));
    const h = Math.max(1, Math.round(el.clientHeight));
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    backdropUniforms.uAspect.value = w / h;
    built.resize(w, h);
  };
  size();

  let shown = false;
  const draw = (seconds) => {
    const phase = phaseAt(seconds, opts.period);
    backdropUniforms.uPhase.value = phase;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    built.update(phase, pointer);
    renderer.render(built.scene, built.camera);
    if (!shown) {
      shown = true;
      // Recorded frames show the scene at once; on a page it fades in over the still.
      if (opts.manual) {
        canvas.style.transition = "none";
        canvas.style.opacity = "1";
      } else requestAnimationFrame(() => (canvas.style.opacity = "1"));
    }
  };

  const ready = Promise.resolve(built.ready).then(() => {
    renderer.compile(built.scene, built.camera);
  });

  let raf = 0;
  let running = false;
  let elapsed = 0;
  let last = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    elapsed += dt;
    draw(elapsed);
  };
  const start = () => {
    if (running || opts.manual) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
    el.dataset.farbaekSceneState = "running";
  };
  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    el.dataset.farbaekSceneState = "paused";
  };

  const cleanups = [];
  if (!opts.manual) {
    let visible = false;
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && !document.hidden) start();
      else stop();
    });
    io.observe(el);
    const onVis = () => (document.hidden ? stop() : visible && start());
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(size);
    ro.observe(el);
    cleanups.push(() => io.disconnect(), () => document.removeEventListener("visibilitychange", onVis), () => ro.disconnect());
    if (env.finePointer) {
      const onMove = (e) => {
        const r = el.getBoundingClientRect();
        pointer.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        pointer.ty = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)));
      };
      const onLeave = () => {
        pointer.tx = 0;
        pointer.ty = 0;
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      cleanups.push(() => window.removeEventListener("pointermove", onMove), () => document.documentElement.removeEventListener("pointerleave", onLeave));
    }
  }

  const onLost = (e) => {
    e.preventDefault();
    stop();
    canvas.style.opacity = "0";
    el.dataset.farbaekSceneState = "still";
    el.dataset.farbaekSceneReason = "context-lost";
  };
  canvas.addEventListener("webglcontextlost", onLost);

  const controller = {
    state: "running",
    reason: null,
    ready,
    renderAt(seconds) {
      size();
      pointer.tx = pointer.ty = pointer.x = pointer.y = 0;
      draw(seconds);
    },
    pause: stop,
    resume: start,
    destroy() {
      stop();
      cleanups.forEach((fn) => fn());
      canvas.removeEventListener("webglcontextlost", onLost);
      built.dispose?.();
      built.scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => m.dispose());
      });
      renderer.dispose();
      canvas.remove();
      delete el.__farbaekScene;
      delete el.dataset.farbaekSceneState;
    },
  };
  el.__farbaekScene = controller;
  return controller;
}

/** Mounts every scene box in `root` as it nears the screen. */
export function autoMount(root = document) {
  const boxes = [...root.querySelectorAll("[data-farbaek-scene]")].filter((el) => !el.__farbaekScene && el.dataset.farbaekSceneManual === undefined);
  if (!boxes.length) return;
  if (typeof IntersectionObserver !== "function") {
    boxes.forEach((el) => mount(el).catch(() => makeStillController(el, "error")));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        mount(e.target).catch(() => {
          e.target.__farbaekScene = makeStillController(e.target, "error");
        });
      }
    },
    { rootMargin: "300px 0px" },
  );
  boxes.forEach((el) => io.observe(el));
}

if (typeof window === "object" && typeof document === "object") {
  window.FarbaekScenes = { VERSION, mount, autoMount };
  if (!window.FARBAEK_SCENES_MANUAL) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => autoMount(), { once: true });
    else autoMount();
  }
}
