import { describe, expect, it } from "vitest";
import { injectPicker, PICKER_PATH, signPreviewToken, verifyPreviewToken } from "@/core/sandbox/preview";
import { scanJsx } from "./jsx-edit";
import { matchPicked, readPicked } from "./pick-match";
import { pickerScript } from "./picker-script";

const PAGE = `export default function Page() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-medium">Your cart</h1>
      <p className="text-ink-2">Free delivery over $50.</p>
      <Button className="rounded-full px-4">Check out</Button>
      <p className="text-ink-2">{total}</p>
    </main>
  );
}
`;
const FOOTER = `export function Footer() {
  return <footer className="p-6 text-sm"><p className="text-ink-2">Free delivery over $50.</p></footer>;
}
`;
const files = [
  { path: "app/page.tsx", source: PAGE },
  { path: "components/footer.tsx", source: FOOTER },
].map((f) => {
  const s = scanJsx(f.source);
  if (!s.ok) throw new Error(s.reason);
  return { path: f.path, elements: s.elements };
});

describe("matching a click in the running app (ADR 0149)", () => {
  it("finds an element by its words and classes, best first, and says why", () => {
    const found = matchPicked({ tag: "h1", text: "Your cart", classes: ["font-medium", "text-3xl"] }, files);
    expect(found[0]).toMatchObject({ path: "app/page.tsx", tag: "h1", line: 4, why: "Matched by the same words, the same classes" });
    expect(found).toHaveLength(1);
  });

  it("lists every place that matches, words and classes before classes alone, so the person can choose", () => {
    const found = matchPicked({ tag: "p", text: "Free delivery over $50.", classes: ["text-ink-2"] }, files);
    expect(found.map((c) => `${c.path}:${c.line} ${c.why}`)).toEqual([
      "app/page.tsx:5 Matched by the same words, the same classes",
      "components/footer.tsx:2 Matched by the same words, the same classes",
      "app/page.tsx:7 Matched by the same classes",
    ]);
  });

  it("matches by classes alone, and by classes the app added to (a framework's own)", () => {
    expect(matchPicked({ tag: "main", text: "", classes: ["max-w-3xl", "mx-auto", "p-6"] }, files)[0]).toMatchObject({ tag: "main", why: "Matched by the same classes" });
    expect(matchPicked({ tag: "main", text: "", classes: ["max-w-3xl", "mx-auto", "p-6", "__className_abc"] }, files)[0]).toMatchObject({ tag: "main", why: "Matched by its classes" });
  });

  it("never matches a component's element, or words the app builds as it runs", () => {
    // <Button> renders as a <button> with classes of its own: the outline can't say which.
    expect(matchPicked({ tag: "button", text: "Check out", classes: ["rounded-full", "px-4", "btn"] }, files)).toEqual([]);
    expect(matchPicked({ tag: "p", text: "$84.00", classes: [] }, files)).toEqual([]);
  });

  it("reads only messages in the picker's shape", () => {
    expect(readPicked({ type: "farbaek:picked", tag: "h1", text: "  Your   cart ", classes: ["b", "a", "a"] })).toEqual({ tag: "h1", text: "Your cart", classes: ["a", "b"] });
    for (const bad of [null, "x", { type: "other" }, { type: "farbaek:picked", tag: "H1", text: "", classes: [] }, { type: "farbaek:picked", tag: "h1", text: "x".repeat(501), classes: [] }, { type: "farbaek:picked", tag: "h1", text: "", classes: [1] }]) {
      expect(readPicked(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("the picker in a preview", () => {
  it("is added inside <head>, else before </body>, else first", () => {
    const tag = `<script src="${PICKER_PATH}" defer></script>`;
    expect(injectPicker('<!doctype html><html><head lang="en"><title>x</title></head></html>')).toBe(`<!doctype html><html><head lang="en">${tag}<title>x</title></head></html>`);
    expect(injectPicker("<body><p>x</p></body>")).toBe(`<body><p>x</p>${tag}</body>`);
    expect(injectPicker("<p>x</p>")).toBe(`${tag}<p>x</p>`);
    // <header> isn't <head>.
    expect(injectPicker("<header>x</header>")).toBe(`${tag}<header>x</header>`);
  });

  it("is asked for in the launch token and kept in the access token", async () => {
    const secret = "s".repeat(48);
    const token = await signPreviewToken({ kind: "launch", p: "p1", u: "u1", exp: 2_000, n: "n", pick: true }, secret);
    const check = await verifyPreviewToken(token, secret, { kind: "launch", previewId: "p1", nowSeconds: 1_000 });
    expect(check.ok && check.claims.pick).toBe(true);
  });

  it("answers only Farbaek's own page, and posts only to it", () => {
    const script = pickerScript("https://www.farbaek.com");
    expect(script).toContain('const APP = "https://www.farbaek.com";');
    expect(script).toContain("window.parent.postMessage(describe(e.target), APP)");
    expect(script).not.toMatch(/postMessage\([^)]*["']\*["']/);
    expect(script).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
  });
});
