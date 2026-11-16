// Contact sheets (stage 196): lays the responsive audit's screenshots out on sheets, one screen size at a time, so every route
// can be looked at side by side. Take viewport screenshots first, then make the sheets:
//
//   pnpm qa:responsive --widths=390,768 --shots=<folder> --shot=viewport
//   node scripts/qa/contact-sheet.mjs --shots=<folder> [--per-sheet=12] [--columns=4] [--width=220]
//
// It writes <folder>/sheets/<screen>-<n>.png, each with the route under its picture.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const SHOTS = flag("shots");
if (!SHOTS) throw new Error("Say where the screenshots are: --shots=<folder>");
const PER_SHEET = Number(flag("per-sheet") ?? 12);
const COLUMNS = Number(flag("columns") ?? 4);
const TILE = Number(flag("width") ?? 220);

const exe = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome"].find((p) => p && existsSync(p));
const folder = resolve(SHOTS);
const sheets = join(folder, "sheets");
mkdirSync(sheets, { recursive: true });

const byScreen = new Map();
for (const f of readdirSync(folder).filter((n) => n.endsWith(".png")).sort()) {
  const screen = f.slice(0, f.indexOf("-"));
  byScreen.set(screen, [...(byScreen.get(screen) ?? []), f]);
}

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: COLUMNS * (TILE + 16) + 16, height: 600 }, deviceScaleFactor: 1 });
let made = 0;
for (const [screen, files] of byScreen) {
  for (let i = 0; i < files.length; i += PER_SHEET) {
    const part = files.slice(i, i + PER_SHEET);
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:8px;font:12px/1.3 system-ui,sans-serif;background:#eef0f3;color:#111}
      .g{display:grid;grid-template-columns:repeat(${COLUMNS},${TILE}px);gap:16px 16px;padding:8px}
      figure{margin:0}img{width:${TILE}px;display:block;border:1px solid #c9ced6;background:#fff}
      figcaption{margin-top:4px;word-break:break-all}</style>
      <div class="g">${part
        .map((f) => `<figure><img src="${pathToFileURL(join(folder, f)).href}"><figcaption>${f.slice(screen.length + 1, -4).replace(/_/g, "/")}</figcaption></figure>`)
        .join("")}</div>`;
    const file = join(sheets, `_sheet.html`);
    writeFileSync(file, html);
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    const out = join(sheets, `${screen}-${String(i / PER_SHEET + 1).padStart(2, "0")}.png`);
    await page.screenshot({ path: out, fullPage: true });
    made++;
  }
}
await browser.close();
console.log(`${made} sheets in ${sheets}`);
