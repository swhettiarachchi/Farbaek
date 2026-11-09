import { describe, expect, it } from "vitest";
import { inputClasses, textareaClasses } from "./field";

const has = (cls: string, c: string) => cls.split(" ").includes(c);

describe("the shared field style (ADR 0184)", () => {
  it("draws every field with an edge that reaches 3:1, 16px text and a 48px target", () => {
    const cls = inputClasses();
    for (const c of ["border-line-strong", "text-base", "min-h-12", "w-full", "focus-visible:border-accent", "aria-[invalid=true]:border-failed"]) expect(has(cls, c), c).toBe(true);
    expect(has(cls, "border-line")).toBe(false);
  });

  it("lets a caller's width, height, padding, background or size replace the default of the same kind", () => {
    const cls = inputClasses("w-max min-h-11 px-3 bg-surface-raised text-lg font-mono");
    for (const c of ["w-max", "min-h-11", "px-3", "bg-surface-raised", "text-lg", "font-mono"]) expect(has(cls, c), c).toBe(true);
    for (const c of ["w-full", "min-h-12", "px-3.5", "bg-surface", "text-base"]) expect(has(cls, c), c).toBe(false);
    // Colour, focus and the disabled look are never dropped.
    for (const c of ["text-ink", "focus-visible:ring-accent/25", "disabled:bg-surface-raised"]) expect(has(cls, c), c).toBe(true);
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
});
