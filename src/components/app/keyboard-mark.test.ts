import { describe, expect, it } from "vitest";
import { readScreen } from "./keyboard-mark";

const phone = { width: 412, tallest: 915 };

describe("telling the keyboard from the screen's height (ADR 0171)", () => {
  it("sees it open with a text field in use, and close again", () => {
    const up = readScreen(phone, 412, 500, true);
    expect(up.open).toBe(true);
    expect(readScreen(up.memory, 412, 915, true).open).toBe(false);
  });

  it("isn't fooled by the address bar, which moves far less", () => {
    expect(readScreen(phone, 412, 859, true).open).toBe(false);
  });

  it("needs a text field, so a smaller window isn't a keyboard", () => {
    expect(readScreen(phone, 412, 500, false).open).toBe(false);
  });

  it("starts again when the phone turns", () => {
    const turned = readScreen(phone, 915, 412, true);
    expect(turned.open).toBe(false);
    expect(turned.memory).toEqual({ width: 915, tallest: 412 });
    expect(readScreen(turned.memory, 915, 200, true).open).toBe(true);
  });

  it("remembers the tallest height it has seen", () => {
    const shorter = readScreen({ width: 412, tallest: 859 }, 412, 915, false);
    expect(shorter.memory.tallest).toBe(915);
  });
});
