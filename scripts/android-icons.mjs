// Farbaek for Android's Nearby icons (ADR 0183): the same Phosphor set the website and the desktop app use,
// turned into Android vector drawables from the installed @phosphor-icons/react package (MIT licence).
// Outlined (regular) icons name a thing, bold ones sit in buttons, filled ones report a state.
// Run: node scripts/android-icons.mjs
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const defs = join(dirname(require.resolve("@phosphor-icons/react")), "defs");
const out = join(root, "android", "app", "src", "main", "res", "drawable");

const ICONS = {
  regular: ["ArrowLeft", "ArrowsDownUp", "CaretDown", "Desktop", "DeviceMobile", "LinkSimple", "TrayArrowDown", "WifiHigh"],
  bold: ["ArrowCounterClockwise", "Check", "CircleNotch", "LinkSimple", "PaperPlaneTilt", "ShareNetwork", "Trash", "X"],
  fill: ["CheckCircle", "Clock", "ClockUser", "Info", "MinusCircle", "WarningCircle", "XCircle"],
};

const snake = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();

/** The path data of one weight, from the package's defs file: every `d` in that weight's entry, in order. */
function paths(name, weight) {
  const source = readFileSync(join(defs, `${name}.es.js`), "utf8");
  const start = source.indexOf(`"${weight}",`);
  if (start < 0) throw new Error(`${name} has no ${weight} weight`);
  const end = source.indexOf("\n  ]", start);
  const entry = source.slice(start, end);
  if (/opacity:/.test(entry)) throw new Error(`${name} ${weight} has a translucent layer`);
  const found = [...entry.matchAll(/d: "([^"]+)"/g)].map((m) => m[1]);
  if (found.length === 0) throw new Error(`${name} ${weight} has no path`);
  return found;
}

for (const file of readdirSync(out)) if (file.startsWith("ph_")) unlinkSync(join(out, file));
let written = 0;
for (const [weight, names] of Object.entries(ICONS)) {
  for (const name of names) {
    const body = paths(name, weight)
      .map((d) => `    <path\n        android:fillColor="#FF000000"\n        android:pathData="${d}" />`)
      .join("\n");
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Phosphor's ${name} (${weight}), made by scripts/android-icons.mjs. Tinted where it's used. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="256"
    android:viewportHeight="256">
${body}
</vector>
`;
    writeFileSync(join(out, `ph_${snake(name)}_${weight}.xml`), xml);
    written += 1;
  }
}
console.log(`${written} icons written to ${out}`);
