import { tsxLanguage } from "@codemirror/lang-javascript";
import { describe, expect, it } from "vitest";
import { classGroup, componentFiles, decodeJsxText, isTailwindProject, scanJsx, setJsxClasses, setJsxText, withClassGroup, type JsxElement } from "./jsx-edit";

const PAGE = `import { Button } from "@/components/button";

export default function Home({ name }: { name: string }) {
  // <h1>not this</h1>
  const note = \`<p>nor this</p>\`;
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-4xl font-bold">Fresh bread, &amp; more</h1>
      <p className={cn("text-lg", name && "mt-2")}>Hello {name}</p>
      <section>
        <img src="/loaf.png" alt="A loaf" />
        <Button>Order now</Button>
      </section>
      <>
        <span>Open daily</span>
      </>
    </main>
  );
}
`;

const scan = (src = PAGE) => {
  const r = scanJsx(src);
  if (!r.ok) throw new Error(r.reason);
  return r.elements;
};
const byTag = (els: JsxElement[], tag: string) => els.find((e) => e.tag === tag)!;
const parsesCleanly = (src: string) => {
  let errors = 0;
  tsxLanguage.parser.parse(src).iterate({ enter: (n) => void (n.type.isError ? errors++ : null) });
  return errors === 0;
};

describe("reading a component", () => {
  it("finds each element in source order, with its words and plain classes, and skips comments and strings", () => {
    const els = scan();
    expect(els.map((e) => [e.tag, e.depth])).toEqual([
      ["main", 0],
      ["h1", 1],
      ["p", 1],
      ["section", 1],
      ["img", 2],
      ["Button", 2],
      ["span", 1],
    ]);
    const h1 = byTag(els, "h1");
    expect(h1).toMatchObject({ builtin: true, line: 8, text: { value: "Fresh bread, & more" }, className: { value: "text-4xl font-bold" } });
    expect(PAGE.slice(h1.className!.from, h1.className!.to)).toBe("text-4xl font-bold");
    expect(PAGE.slice(h1.text!.from, h1.text!.to)).toBe("Fresh bread, &amp; more");
    // Words mixed with {values}, and a className written as code, are left to the code editor.
    expect(byTag(els, "p")).toMatchObject({ text: null, className: null, classNameInCode: true });
    expect(byTag(els, "Button")).toMatchObject({ builtin: false, text: { value: "Order now" } });
    expect(byTag(els, "img").text).toBeNull();
  });

  it("refuses a file that doesn't parse, or has no JSX", () => {
    expect(scanJsx("export const a = <div>")).toMatchObject({ ok: false, reason: expect.stringMatching(/syntax error/) });
    expect(scanJsx("export const a = 1;")).toEqual({ ok: false, reason: "This file has no JSX to edit." });
    expect(scanJsx("x".repeat(400 * 1024))).toMatchObject({ ok: false, reason: expect.stringMatching(/over 300 KB/) });
  });

  it("reads entities in words as people see them", () => {
    expect(decodeJsxText("Fish &amp; chips &#123;ok&#x7D; &nbsp;now")).toBe("Fish & chips {ok}  now");
  });
});

describe("editing words", () => {
  it("replaces only the words, writing JSX's special characters as entities", () => {
    const h1 = byTag(scan(), "h1");
    const r = setJsxText(PAGE, h1, "Bread & {cakes} <today>");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toContain(`<h1 className="text-4xl font-bold">Bread &amp; &#123;cakes&#125; &lt;today&gt;</h1>`);
    expect(r.source.replace("Bread &amp; &#123;cakes&#125; &lt;today&gt;", "Fresh bread, &amp; more")).toBe(PAGE);
    expect(parsesCleanly(r.source)).toBe(true);
    expect(byTag(scan(r.source), "h1").text!.value).toBe("Bread & {cakes} <today>");
  });

  it("refuses line breaks, empty words, and elements whose words mix with code", () => {
    const els = scan();
    expect(setJsxText(PAGE, byTag(els, "h1"), "two\nlines")).toEqual({ ok: false, reason: "Keep the words on one line." });
    expect(setJsxText(PAGE, byTag(els, "h1"), "   ")).toMatchObject({ ok: false });
    expect(setJsxText(PAGE, byTag(els, "p"), "x")).toMatchObject({ ok: false, reason: expect.stringMatching(/mixed with code/) });
  });
});

describe("editing classes", () => {
  it("replaces a className string, or adds one to a built-in element", () => {
    const els = scan();
    const replaced = setJsxClasses(PAGE, byTag(els, "h1"), "text-5xl font-bold tracking-tight");
    expect(replaced.ok && replaced.source).toContain(`<h1 className="text-5xl font-bold tracking-tight">`);
    const added = setJsxClasses(PAGE, byTag(els, "section"), "grid gap-4");
    expect(added.ok && added.source).toContain(`<section className="grid gap-4">`);
    expect(added.ok && parsesCleanly(added.source)).toBe(true);
    const img = setJsxClasses(PAGE, byTag(els, "img"), "rounded-lg");
    expect(img.ok && img.source).toContain(`<img className="rounded-lg" src="/loaf.png" alt="A loaf" />`);
  });

  it("refuses code, components without a className, and anything that isn't a plain class", () => {
    const els = scan();
    expect(setJsxClasses(PAGE, byTag(els, "p"), "mt-4")).toMatchObject({ ok: false, reason: expect.stringMatching(/written as code/) });
    expect(setJsxClasses(PAGE, byTag(els, "Button"), "mt-4")).toMatchObject({ ok: false, reason: expect.stringMatching(/is a component/) });
    for (const bad of [`a" onClick="x`, "a{b}", "a\\b", "x'"]) expect(setJsxClasses(PAGE, byTag(els, "h1"), bad).ok, bad).toBe(false);
    expect(setJsxClasses(PAGE, byTag(els, "h1"), "sm:text-6xl hover:bg-[#fff] w-1/2 !p-2").ok).toBe(true);
  });
});

describe("Tailwind controls", () => {
  it("sets one group's class in place, keeping variants and everything else", () => {
    const classes = ["sm:text-6xl", "text-4xl", "font-bold", "text-center"];
    expect(classGroup(classes, "size")).toBe("text-4xl");
    expect(classGroup(classes, "align")).toBe("text-center");
    expect(withClassGroup(classes, "size", "text-5xl")).toEqual(["sm:text-6xl", "text-5xl", "font-bold", "text-center"]);
    expect(withClassGroup(classes, "weight", null)).toEqual(["sm:text-6xl", "text-4xl", "text-center"]);
    expect(withClassGroup(classes, "padding", "p-4")).toEqual([...classes, "p-4"]);
    expect(withClassGroup(classes, "size", "text-huge")).toEqual(classes);
  });

  it("knows a Tailwind project, and lists its components with pages first", () => {
    expect(isTailwindProject({ "package.json": `{"devDependencies":{"tailwindcss":"4.1.0"}}` })).toBe(true);
    expect(isTailwindProject({ "app/globals.css": `@import "tailwindcss";` })).toBe(true);
    expect(isTailwindProject({ "package.json": "{}", "styles.css": "body{}" })).toBe(false);
    expect(componentFiles(["src/components/b.tsx", "app/page.tsx", "app/about/page.tsx", "lib/x.ts", "app/a.test.tsx", "node_modules/x/y.tsx", "components/a.jsx", "app/layout.tsx"])).toEqual([
      "app/about/page.tsx",
      "app/layout.tsx",
      "app/page.tsx",
      "components/a.jsx",
      "src/components/b.tsx",
    ]);
  });
});
