// Generates every brand file from the one image the owner supplied (ADR 0226): the black cat,
// scripts/brand/farbaek-cat-source.webp, 1254 px square on white. Its design is never altered: the artwork is
// only cut out of its white paper, scaled and padded (never recoloured or redrawn).
// - public/brand/farbaek-logo-v2.webp: the cat with the paper round it made transparent, for pages (BrandLogo, LOGO).
//   The white inside the cat (eyes, ears, whiskers, chest) is part of the drawing and stays white.
//   The name carries the artwork's number: the site's image cache and people's browsers keep a picture for hours
//   under its address, so new artwork gets a new address (and LOGO in brand-logo.tsx, public/sw.js, desktop/build.mjs
//   and scripts/release/store-images.mjs follow it). The PNG copy keeps its address, which other sites may link to.
// - public/brand/farbaek-app-icon.webp: the cat on its own white paper, for app icons and the favicon, which
//   need a solid background (the App Store refuses transparency).
// Run: node scripts/brand-assets.mjs
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
// sharp ships with Next.js; resolve it from there instead of adding a dependency.
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));

const SOURCE = "scripts/brand/farbaek-cat-source.webp";
const LOGO = "public/brand/farbaek-logo-v2.webp";
const ICON = "public/brand/farbaek-app-icon.webp";
// The artwork's own paper, so padding around it is seamless.
const iconPaper = { r: 254, g: 254, b: 254, alpha: 1 };

/**
 * The cat cut out of its paper. Paper is whatever white can be reached from the image's edge, so the white inside
 * the drawing is kept. The soft edge between cat and paper becomes black at part strength, so no white fringe shows
 * on another colour. Returns the artwork trimmed to the cat with a small margin, as RGBA.
 */
async function cutOut(margin = 24) {
  const { data, info } = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const lum = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 3) lum[i] = Math.round((data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000);

  // Paper: flood from every edge pixel over white.
  const PAPER = 232;
  const state = new Uint8Array(W * H); // 0 the drawing, 1 paper, 2 the soft edge beside paper
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  const reach = (i) => {
    if (state[i] === 0 && lum[i] >= PAPER) {
      state[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < W; x++) {
    reach(x);
    reach((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    reach(y * W);
    reach(y * W + W - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    if (x > 0) reach(i - 1);
    if (x < W - 1) reach(i + 1);
    if (i >= W) reach(i - W);
    if (i < W * (H - 1)) reach(i + W);
  }

  // The soft edge: grey pixels touching paper, then grey pixels touching those (the edge is up to two pixels wide).
  const beside = (i, what) => {
    const x = i % W;
    const y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && state[ny * W + nx] === what) return true;
      }
    }
    return false;
  };
  const grey = (i) => state[i] === 0 && lum[i] > 24 && lum[i] < PAPER;
  const first = [];
  for (let i = 0; i < W * H; i++) if (grey(i) && beside(i, 1)) first.push(i);
  for (const i of first) state[i] = 2;
  const second = [];
  for (let i = 0; i < W * H; i++) if (grey(i) && beside(i, 2)) second.push(i);
  for (const i of second) state[i] = 2;

  const out = Buffer.alloc(W * H * 4);
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < W * H; i++) {
    if (state[i] === 1) continue;
    const o = i * 4;
    if (state[i] === 2) {
      // Black at the strength the drawing covered this pixel.
      out[o + 3] = Math.max(0, Math.min(255, Math.round(255 * (1 - lum[i] / iconPaper.r))));
    } else {
      out[o] = data[i * 3];
      out[o + 1] = data[i * 3 + 1];
      out[o + 2] = data[i * 3 + 2];
      out[o + 3] = 255;
    }
    const x = i % W;
    const y = (i / W) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const left = Math.max(0, x0 - margin);
  const top = Math.max(0, y0 - margin);
  const width = Math.min(W, x1 + margin + 1) - left;
  const height = Math.min(H, y1 + margin + 1) - top;
  const art = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).extract({ left, top, width, height }).png().toBuffer();
  return { art, width, height };
}

const cat = await cutOut();
await sharp(cat.art).webp({ quality: 92, alphaQuality: 100 }).toFile(LOGO);
await sharp(cat.art).png({ compressionLevel: 9 }).toFile("public/brand/farbaek-logo.png");

// The app icon: the cat on its own paper, three quarters of a square's height, so platforms that crop keep all of it.
const ICON_SIZE = 1024;
const catOnIcon = await sharp(cat.art).resize({ height: Math.round(ICON_SIZE * 0.74) }).png().toBuffer();
await sharp({ create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: iconPaper } })
  .composite([{ input: catOnIcon, gravity: "centre" }])
  .flatten({ background: iconPaper })
  .webp({ quality: 92 })
  .toFile(ICON);
console.log(`The logo is ${cat.width} by ${cat.height} pixels: keep LOGO in src/components/brand/brand-logo.tsx the same.`);

// The whole icon, scaled to a square size.
async function icon(size, file, png = {}) {
  await sharp(ICON).resize(size, size).png(png).toFile(file);
}

// The icon inside a larger canvas of its own background: for shapes a platform crops, and wide tiles.
async function paddedIcon(width, height, inner, file) {
  const art = await sharp(ICON).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: iconPaper } })
    .composite([{ input: art, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(file);
}

// Browser tabs (16 to 48 pixels; a 32px file keeps every page from fetching the 512px one, ADR 0052),
// and the 512px icon the desktop app and its installers use.
// A browser never crops a tab icon, so at these sizes the cat fills the square: nine tenths of its height.
// The paper stays: a transparent tab icon would lose a black cat on a dark tab strip.
async function tabIcon(size, file) {
  const art = await sharp(cat.art).resize({ height: Math.round(size * 0.92), kernel: "lanczos3" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: iconPaper } })
    .composite([{ input: art, gravity: "centre" }])
    .flatten({ background: iconPaper })
    .png({ compressionLevel: 9 })
    .toFile(file);
}
await tabIcon(32, "public/brand/farbaek-icon-32.png");
await tabIcon(48, "public/brand/farbaek-icon-48.png");
await icon(512, "public/brand/farbaek-icon.png");
// iOS rounds the corners itself; the artwork already has a margin.
await icon(180, "public/brand/farbaek-apple-icon.png");
// The installed web app's icons (src/app/manifest.ts).
await icon(192, "public/brand/farbaek-app-192.png");
await icon(512, "public/brand/farbaek-app-512.png");
// Maskable: Android crops to a shape inside the central circle (80% across), so the artwork sits at 75%.
await paddedIcon(512, 512, 384, "public/brand/farbaek-app-maskable.png");

// Microsoft Store tiles for Farbaek Agent's package (ADR 0098); electron-builder reads them from
// desktop/build/appx. Without them it would ship its own placeholder logos.
await mkdir("desktop/build/appx", { recursive: true });
await icon(50, "desktop/build/appx/StoreLogo.png", { compressionLevel: 9 });
await icon(44, "desktop/build/appx/Square44x44Logo.png", { compressionLevel: 9 });
await icon(71, "desktop/build/appx/SmallTile.png", { compressionLevel: 9 });
await icon(150, "desktop/build/appx/Square150x150Logo.png", { compressionLevel: 9 });
await icon(310, "desktop/build/appx/LargeTile.png", { compressionLevel: 9 });
await paddedIcon(310, 150, 150, "desktop/build/appx/Wide310x150Logo.png");

// Farbaek for Android (ADR 0099): the legacy launcher icon (48dp), and the adaptive icon's foreground
// (108dp, the artwork inside the 66dp every launcher shape keeps; its background is the art's own white).
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(densities)) {
  const dir = `android/app/src/main/res/mipmap-${name}`;
  await mkdir(dir, { recursive: true });
  await icon(Math.round(48 * scale), `${dir}/ic_launcher.png`, { compressionLevel: 9 });
  // The app's own launch (ADR 0171): the icon, 160dp, shown until Chrome paints.
  await mkdir(`android/app/src/main/res/drawable-${name}`, { recursive: true });
  await icon(Math.round(160 * scale), `android/app/src/main/res/drawable-${name}/splash.png`, { compressionLevel: 9 });
  const canvas = Math.round(108 * scale);
  const art = await sharp(ICON).resize(Math.round(66 * scale), Math.round(66 * scale)).png().toBuffer();
  await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(`${dir}/ic_launcher_foreground.png`);
}

// Farbaek for iPhone (ADR 0110): one 1024px icon, which Xcode scales for every size. The App Store refuses
// transparency, so it sits on the artwork's own white. The welcome screen shows the logo, as pages do.
const xcassets = "ios/Farbaek/Resources/Assets.xcassets";
await mkdir(`${xcassets}/AppIcon.appiconset`, { recursive: true });
await sharp(ICON).resize(1024, 1024).flatten({ background: iconPaper }).png({ compressionLevel: 9 }).toFile(`${xcassets}/AppIcon.appiconset/AppIcon-1024.png`);
await mkdir(`${xcassets}/Logo.imageset`, { recursive: true });
await sharp(LOGO).resize({ height: 240 }).png({ compressionLevel: 9 }).toFile(`${xcassets}/Logo.imageset/farbaek-logo.png`);

console.log("Wrote farbaek-logo.png from the logo, and the favicons, app icons, Store tiles, Android and iPhone icons from the app icon");
