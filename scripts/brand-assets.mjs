// Generates the brand files from the owner-supplied images without altering their design:
// the artwork is only scaled and padded (never cropped, recoloured or redrawn).
// - public/brand/farbaek-logo.webp, the full knight: the logo on pages (BrandLogo, LOGO).
// - public/brand/farbaek-app-icon.webp, the cat knight: only app icons and the site favicon.
// Run: node scripts/brand-assets.mjs
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
// sharp ships with Next.js; resolve it from there instead of adding a dependency.
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));

const LOGO = "public/brand/farbaek-logo.webp";
const ICON = "public/brand/farbaek-app-icon.webp";
// The icon artwork's own background, so padding around it is seamless.
const iconPaper = { r: 254, g: 254, b: 254, alpha: 1 };

await sharp(LOGO).png().toFile("public/brand/farbaek-logo.png");

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
await icon(32, "public/brand/farbaek-icon-32.png", { compressionLevel: 9 });
await icon(48, "public/brand/farbaek-icon-48.png", { compressionLevel: 9 });
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
