import { describe, expect, it } from "vitest";
import { inputClasses, textareaClasses } from "./field";
import { mergeClasses } from "./merge";

const has = (cls: string, c: string) => cls.split(" ").includes(c);

describe("the shared field style (ADR 0184, ADR 0211)", () => {
  it("draws every field with an edge that reaches 3:1, 16px text and a 44px target on touch", () => {
    const cls = inputClasses();
    for (const c of ["border-line-strong", "text-base", "min-h-11", "w-full", "focus-visible:border-accent", "aria-[invalid=true]:border-failed"]) expect(has(cls, c), c).toBe(true);
    expect(has(cls, "border-line")).toBe(false);
  });

  it("is 40px with 14px text with a mouse on a large screen, as the rest of a desktop form", () => {
    const cls = inputClasses();
    for (const c of ["lg:pointer-fine:min-h-10", "lg:pointer-fine:text-sm"]) expect(has(cls, c), c).toBe(true);
  });

  it("lets a caller's width, height, padding, background or size replace the default of the same kind", () => {
    const cls = inputClasses("w-max min-h-11 px-3 bg-surface-raised text-lg font-mono");
    for (const c of ["w-max", "min-h-11", "px-3", "bg-surface-raised", "text-lg", "font-mono"]) expect(has(cls, c), c).toBe(true);
    for (const c of ["w-full", "px-3.5", "bg-surface", "text-base"]) expect(has(cls, c), c).toBe(false);
    // Colour, focus and the disabled look are never dropped.
    for (const c of ["text-ink", "focus-visible:ring-accent/25", "disabled:bg-surface-raised"]) expect(has(cls, c), c).toBe(true);
  });

  it("drops the desktop default of the same kind too, so a caller's size holds on every screen", () => {
    // The office's one-time code fields stay large, and a tall text area stays tall, with a mouse as well.
    const code = inputClasses("text-lg");
    expect(has(code, "text-lg")).toBe(true);
    expect(has(code, "lg:pointer-fine:text-sm")).toBe(false);
    const tall = textareaClasses("min-h-[50dvh]");
    expect(has(tall, "min-h-[50dvh]")).toBe(true);
    expect(has(tall, "min-h-20")).toBe(false);
    const roomy = inputClasses("min-h-[50dvh]");
    expect(has(roomy, "lg:pointer-fine:min-h-10")).toBe(false);
  });

  it("keeps the phone default when a caller only adds a breakpoint", () => {
    const cls = inputClasses("sm:w-52");
    expect(has(cls, "w-full")).toBe(true);
    expect(has(cls, "sm:w-52")).toBe(true);
  });

  it("gives text areas room to write", () => {
    const cls = textareaClasses();
    expect(has(cls, "min-h-20")).toBe(true);
    expect(has(cls, "leading-relaxed")).toBe(true);
  });

  it("treats an important mark as the plain class it is", () => {
    expect(mergeClasses(["px-4", "min-h-10"], "!px-0").split(" ")).toEqual(["min-h-10", "!px-0"]);
  });
});
