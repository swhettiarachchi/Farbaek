// Generates icon sizes from the owner-supplied logo without altering its design:
// the artwork is only scaled and padded (never cropped, recoloured or redrawn).
// Run: node scripts/brand-assets.mjs
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
// sharp ships with Next.js; resolve it from there instead of adding a dependency.
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));

const SRC = "public/brand/farbaek-logo.webp";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const porcelain = { r: 0xf6, g: 0xf6, b: 0xf3, alpha: 1 };

await sharp(SRC).png().toFile("public/brand/farbaek-logo.png");

await sharp(SRC)
  .resize(512, 512, { fit: "contain", background: transparent })
  .png()
  .toFile("public/brand/farbaek-icon.png");

// Browser tabs need 16 to 48 pixels; a 32px file keeps every page from fetching the 512px one (ADR 0052).
for (const size of [32, 48]) {
  await sharp(SRC)
    .resize(size, size, { fit: "contain", background: transparent })
    .png({ compressionLevel: 9 })
    .toFile(`public/brand/farbaek-icon-${size}.png`);
}

// Icons on the porcelain surface. Sharp runs its steps in its own order, not call order, so the logo is
// placed first and the background flattened in a second pass; in one pass, the padding stayed transparent.
async function appIcon(size, inner, file) {
  const pad = (size - inner) / 2;
  const placed = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: transparent })
    .extend({ top: Math.floor(pad), bottom: Math.ceil(pad), left: Math.floor(pad), right: Math.ceil(pad), background: transparent })
    .png()
    .toBuffer();
  await sharp(placed).flatten({ background: porcelain }).png().toFile(file);
}
// iOS renders transparent touch icons on black, so the apple icon sits on the porcelain surface.
await appIcon(180, 148, "public/brand/farbaek-apple-icon.png");
// The installed app's icons (src/app/manifest.ts).
await appIcon(192, 154, "public/brand/farbaek-app-192.png");
await appIcon(512, 410, "public/brand/farbaek-app-512.png");
// Maskable: Android crops to a shape inside the central circle (80% across), so the logo stays well within it.
await appIcon(512, 320, "public/brand/farbaek-app-maskable.png");

console.log("Wrote farbaek-logo.png, farbaek-icon.png, farbaek-icon-32.png, farbaek-icon-48.png, farbaek-apple-icon.png and the app icons");
