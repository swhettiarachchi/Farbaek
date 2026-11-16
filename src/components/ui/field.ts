import { mergeClasses } from "./merge";

/**
 * One look for every text field, select and text area (ADR 0184, ADR 0211). The border is `line-strong`, which reaches the 3:1
 * a control's edge needs against the page (WCAG 1.4.11); the quiet `line` the fields used before reached 1.2:1.
 *
 * On a touch screen a field is 44px tall with 16px text, so it's a full target and phones don't zoom in when it's tapped. With a
 * mouse on a large screen it's 40px with 14px text, the size of the rest of a desktop form. The accent edge and a soft ring show
 * focus, the failed colour shows when `aria-invalid` is set, and a disabled field is raised and quieter.
 */
const BASE = [
  "w-full",
  "rounded-sm",
  "border",
  "border-line-strong",
  "bg-surface",
  "text-base",
  "lg:pointer-fine:text-sm",
  "text-ink",
  // A field wrapped in its label would otherwise take the label's medium weight for what's typed.
  "font-normal",
  "placeholder:text-ink-3",
  "transition-[border-color,box-shadow]",
  "duration-150",
  "focus-visible:border-accent",
  // Hidden, not removed: High Contrast mode still paints this outline, where it drops the ring and the border colour.
  "focus-visible:outline-hidden",
  "focus-visible:ring-[3px]",
  "focus-visible:ring-accent/25",
  "aria-[invalid=true]:border-failed",
  "aria-[invalid=true]:ring-failed/15",
  "disabled:cursor-not-allowed",
  "disabled:bg-surface-raised",
  "disabled:text-ink-3",
];

/** A one-line text field or a select. */
export function inputClasses(extra = ""): string {
  return mergeClasses([...BASE, "min-h-11", "lg:pointer-fine:min-h-10", "px-3.5", "lg:pointer-fine:px-3"], extra);
}

/** A text area: the same edge and focus, with room to write. */
export function textareaClasses(extra = ""): string {
  // A low minimum, so a text area's `rows` decides its height.
  return mergeClasses([...BASE, "min-h-20", "px-3.5", "py-3", "lg:pointer-fine:py-2.5", "leading-relaxed"], extra);
}

/** A field's label, above it. */
export const LABEL_CLASSES = "text-label font-medium text-ink-2";
