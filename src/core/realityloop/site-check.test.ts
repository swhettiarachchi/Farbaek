import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkSite, isStaticSite, SITE_CHECK_PATH } from "./site-check";
import { SITE_CHECK_SCRIPT } from "./site-check-script";

const page = (body: string, head = '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Bakery</title>') =>
  `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

const GOOD: Record<string, string> = {
  "index.html": page(
    `<a href="/about">About</a> <a href="menu.html#today">Menu</a> <a href="#top">Top</a> <a href="mailto:hi@example.com">Mail</a> <a href="https://example.com">Out</a>
     <link rel="stylesheet" href="styles.css"><script src="./app.js"></script><script>const s = "<img src=nope.png>";</script>
     <img src="img/logo.png" alt="Sunrise Bakery"><img src="data:image/png;base64,AA" alt="">
     <!-- <a href="missing.html">old</a> -->`,
  ),
  "about/index.html": page(`<a href="../">Home</a> <a href="/">Home</a><img src="../img/logo.png" alt="">`),
  "menu.html": page(`<a href="./">Home</a>`),
  "styles.css": `body { background: url("img/bg.png"); } /* url(missing.png) */ .x { background: url(data:image/png;base64,AA) }`,
  "app.js": "console.log(1)",
  "img/logo.png": "",
  "img/bg.png": "",
  ".farbaek/skills/house-style/SKILL.md": "not a page",
  "node_modules/x/broken.html": "<a href='nowhere'>",
};
const read = (files: Record<string, string>) => (p: string) => files[p] ?? null;

describe("checkSite", () => {
  it("passes a sound site, resolving links the way Farbaek Sites serves them", () => {
    const r = checkSite(Object.keys(GOOD), read(GOOD));
    expect(r.problems).toEqual([]);
    expect(r.pages).toBe(3);
  });

  it("names each problem a visitor would hit", () => {
    const files: Record<string, string> = {
      "index.html": `<html><head></head><body><a href="contact">Contact</a><link rel="stylesheet" href="main.css"><script src="http://cdn.example.com/x.js"></script><img src="hero.png"></body></html>`,
      "styles.css": `.a { background: url('gone.png') }`,
    };
    const r = checkSite(Object.keys(files), read(files));
    expect(r.problems).toEqual([
      "index.html: it doesn't start with <!doctype html>.",
      "index.html: <html> has no lang, so screen readers can't tell the language.",
      "index.html: it has no title.",
      "index.html: it has no viewport tag, so phones show it zoomed out.",
      'index.html: the link to "contact" isn\'t in the project.',
      'index.html: the stylesheet "main.css" isn\'t in the project.',
      'index.html: "http://cdn.example.com/x.js" loads over insecure http.',
      'index.html: an image ("hero.png") has no alt text.',
      'index.html: the file "hero.png" isn\'t in the project.',
      'styles.css: the file "gone.png" isn\'t in the project.',
    ]);
  });

  it("needs an index.html, and doesn't let a link climb out of the site", () => {
    const files = { "about.html": page(`<a href="../../etc/passwd">x</a>`) };
    const r = checkSite(Object.keys(files), read(files));
    expect(r.problems).toEqual(["There's no index.html, the page people see first.", 'about.html: the link to "../../etc/passwd" isn\'t in the project.']);
  });
});

describe("isStaticSite", () => {
  it("is a site with an index.html and nothing to install", () => {
    expect(isStaticSite(["index.html", "styles.css"])).toBe(true);
    expect(isStaticSite(["index.html", "package.json"])).toBe(false);
    expect(isStaticSite(["main.py", "requirements.txt"])).toBe(false);
    expect(isStaticSite(["about.html"])).toBe(false);
  });
});

describe("the site check script", () => {
  it("is generated from checkSite's current source (node scripts/site-check-script.mjs)", () => {
    const r = spawnSync(process.execPath, ["scripts/site-check-script.mjs", "--check"], { cwd: process.cwd(), encoding: "utf8" });
    expect(r.stderr.split("\n").filter((l) => /out of date/.test(l))).toEqual([]);
    expect(r.status).toBe(0);
  });

  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  const run = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "farbaek-site-check-"));
    dirs.push(dir);
    for (const [path, content] of Object.entries({ ...files, [SITE_CHECK_PATH]: SITE_CHECK_SCRIPT })) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    return spawnSync(process.execPath, [SITE_CHECK_PATH], { cwd: dir, encoding: "utf8" });
  };

  it("runs on its own in Node, from the project folder, and exits 0 for a sound site", () => {
    const r = run(GOOD);
    expect(r.stdout.trim()).toBe("Checked 3 pages: nothing wrong.");
    expect(r.status).toBe(0);
  });

  it("lists the problems and exits 1, ignoring its own folder", () => {
    const r = run({ "index.html": page(`<a href="gone.html">x</a>`) });
    expect(r.stdout).toContain('- index.html: the link to "gone.html" isn\'t in the project.');
    expect(r.stdout).toContain("Checked 1 pages: 1 to fix.");
    expect(r.status).toBe(1);
  });
});
