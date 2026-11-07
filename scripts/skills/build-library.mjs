// Folds the skill library's files (src/content/skills/library/<id>/SKILL.md and LICENSE.txt) into one module the
// app imports, so they ship with every build without reading files at run time (ADR 0179). Run it after changing
// a library skill:
//
//   node scripts/skills/build-library.mjs
//
// src/content/skills/library.test.ts fails while the module is out of date.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = path.join(root, "src", "content", "skills", "library");
const out = path.join(dir, "texts.generated.ts");

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null);

const texts = {};
for (const id of fs.readdirSync(dir).sort()) {
  const folder = path.join(dir, id);
  if (!fs.statSync(folder).isDirectory()) continue;
  const skill = read(path.join(folder, "SKILL.md"));
  if (skill === null) continue;
  texts[id] = { skill, licence: read(path.join(folder, "LICENSE.txt")) };
}

const body = `// Made by scripts/skills/build-library.mjs from the folders beside this file. Don't edit it by hand.
export const LIBRARY_TEXTS: Readonly<Record<string, { skill: string; licence: string | null }>> = ${JSON.stringify(texts, null, 2)};
`;
fs.writeFileSync(out, body);
console.log(`Wrote ${path.relative(root, out)}: ${Object.keys(texts).join(", ")}`);
