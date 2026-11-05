"use client";

import { useEffect } from "react";

const TEXT_FIELD = 'input:not([type="button"], [type="checkbox"], [type="color"], [type="file"], [type="radio"], [type="range"], [type="reset"], [type="submit"]), textarea, [contenteditable="true"]';

export interface ScreenMemory {
  width: number;
  tallest: number;
}

/**
 * Whether a resize looks like the keyboard opening (ADR 0171): the screen lost at least a fifth of its height at
 * the same width, with a text field in use. Chrome's address bar hiding moves far less, and turning the phone
 * starts again. It only changes on a resize: focus leaves the field on the way to a tap, and if that brought the
 * tab bar back, it would move what's being tapped and the tap would miss.
 */
export function readScreen(memory: ScreenMemory, width: number, height: number, typing: boolean): { memory: ScreenMemory; open: boolean } {
  const tallest = width === memory.width ? Math.max(memory.tallest, height) : height;
  return { memory: { width, tallest }, open: typing && height < tallest * 0.8 };
}

/** In the root layout: marks the page while the keyboard is up, and CSS moves the bars aside (globals.css). */
export function KeyboardMark() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    let memory: ScreenMemory = { width: window.innerWidth, tallest: window.innerHeight };
    const update = () => {
      const seen = readScreen(memory, window.innerWidth, window.innerHeight, document.activeElement?.matches(TEXT_FIELD) ?? false);
      memory = seen.memory;
      document.documentElement.toggleAttribute("data-keyboard", seen.open);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return null;
}
