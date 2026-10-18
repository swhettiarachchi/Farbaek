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

// iOS renders transparent touch icons on black, so the apple icon sits on the porcelain surface.
await sharp(SRC)
  .resize(148, 148, { fit: "contain", background: transparent })
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: transparent })
  .flatten({ background: porcelain })
  .png()
  .toFile("public/brand/farbaek-apple-icon.png");

console.log("Wrote farbaek-logo.png, farbaek-icon.png and farbaek-apple-icon.png");
