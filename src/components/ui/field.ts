/**
 * One look for every text field, select and text area (ADR 0184). The border is `line-strong`, which reaches the 3:1
 * a control's edge needs against the page (WCAG 1.4.11); the quiet `line` the fields used before reached 1.2:1.
 * 16px text, so phones don't zoom; 48px tall, so it's a full touch target; the accent edge and a soft ring on
 * focus; the failed colour when `aria-invalid` is set; and a raised, quieter look when disabled.
 */
const BASE = [
  "w-full",
  "rounded-sm",
  "border",
  "border-line-strong",
  "bg-surface",
  "text-base",
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

/**
 * Plain class strings don't override each other by order in Tailwind, so a caller's width, height, padding,
 * background or text size replaces the default of the same kind here instead of fighting it.
 */
const KINDS: RegExp[] = [/^w-/, /^min-h-/, /^h-/, /^px-/, /^py-/, /^bg-/, /^text-(?:xs|sm|base|lg|xl|2xl|label|body|title-4|\[)/];

function merge(defaults: string[], extra: string): string {
  const mine = extra.split(/\s+/).filter(Boolean);
  // Only unprefixed classes replace a default: "sm:w-52" adds a breakpoint, it doesn't remove the phone width.
  const plain = mine.filter((c) => !c.includes(":"));
  const kept = defaults.filter((d) => d.includes(":") || !KINDS.some((k) => k.test(d) && plain.some((c) => k.test(c))));
  return [...kept, ...mine].join(" ");
}

/** A one-line text field or a select. */
export function inputClasses(extra = ""): string {
  return merge([...BASE, "min-h-12", "px-3.5"], extra);
}

/** A text area: the same edge and focus, with room to write. */
export function textareaClasses(extra = ""): string {
  // A low minimum, so a text area's `rows` decides its height.
  return merge([...BASE, "min-h-20", "px-3.5", "py-3", "leading-relaxed"], extra);
}

/** A field's label, above it. */
export const LABEL_CLASSES = "text-label font-medium text-ink-2";
