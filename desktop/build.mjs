// Builds Farbaek Agent into desktop/app: the main process, the preload bridge
// and the window, each bundled with esbuild, plus the page, the logo and the
// fonts. `--production` minifies and drops source maps.
//
// Geist and Geist Mono (SIL Open Font License 1.1) are downloaded once from
// Google Fonts with their licence from the Geist repository, and cached in
// desktop/.cache. If either download fails, the app uses system fonts.
import { build } from "esbuild";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "desktop", "src");
const out = path.join(root, "desktop", "app");
const cache = path.join(root, "desktop", ".cache", "fonts");
const production = process.argv.includes("--production");

await fs.rm(path.join(out, "renderer"), { recursive: true, force: true });
await fs.rm(path.join(out, "main.js"), { force: true });
await fs.rm(path.join(out, "preload.js"), { force: true });
await fs.mkdir(path.join(out, "renderer"), { recursive: true });

const common = {
  bundle: true,
  tsconfig: path.join(root, "tsconfig.json"),
  logLevel: "warning",
  sourcemap: production ? false : "inline",
  minify: production,
  legalComments: "none",
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
};

await build({ ...common, entryPoints: [path.join(src, "main", "main.ts")], outfile: path.join(out, "main.js"), platform: "node", target: "node22", format: "cjs", external: ["electron"] });
await build({ ...common, entryPoints: [path.join(src, "preload", "preload.ts")], outfile: path.join(out, "preload.js"), platform: "node", target: "node22", format: "cjs", external: ["electron"] });
await build({ ...common, entryPoints: [path.join(src, "renderer", "main.tsx")], outfile: path.join(out, "renderer", "renderer.js"), platform: "browser", target: "chrome140", format: "iife", jsx: "automatic" });

await fs.copyFile(path.join(src, "renderer", "index.html"), path.join(out, "renderer", "index.html"));
await fs.copyFile(path.join(root, "public", "brand", "farbaek-logo.webp"), path.join(out, "renderer", "logo.webp"));
await fs.copyFile(path.join(root, "public", "brand", "farbaek-icon.png"), path.join(out, "renderer", "icon.png"));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const FONTS = [
  { family: "Geist", file: "geist.woff2" },
  { family: "Geist Mono", file: "geist-mono.woff2" },
];

async function download(url, file) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
}

async function fonts() {
  const target = path.join(out, "renderer", "fonts");
  try {
    const licence = path.join(cache, "OFL.txt");
    if (!existsSync(licence)) await download("https://raw.githubusercontent.com/vercel/geist-font/main/OFL.txt", licence);
    let css = "";
    for (const { family, file } of FONTS) {
      const cached = path.join(cache, file);
      if (!existsSync(cached)) {
        const sheet = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@100..900&display=swap`, { headers: { "user-agent": UA } })).text();
        const latin = sheet.split("/* ").find((block) => block.startsWith("latin */"));
        const url = latin?.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)?.[1];
        if (!url) throw new Error(`no Latin file for ${family}`);
        await download(url, cached);
      }
      await fs.mkdir(target, { recursive: true });
      await fs.copyFile(cached, path.join(target, file));
      css += `@font-face{font-family:"${family}";src:url("./fonts/${file}") format("woff2");font-weight:100 900;font-style:normal;font-display:swap}\n`;
    }
    await fs.copyFile(licence, path.join(target, "OFL.txt"));
    await fs.writeFile(path.join(out, "renderer", "fonts.css"), css);
  } catch (error) {
    console.warn(`Couldn't get the Geist fonts (${error.message}). The app will use system fonts.`);
    await fs.rm(target, { recursive: true, force: true });
    await fs.writeFile(path.join(out, "renderer", "fonts.css"), "");
  }
}

await fonts();
console.log(`Built Farbaek Agent into ${path.relative(root, out)}${production ? " (production)" : ""}.`);
