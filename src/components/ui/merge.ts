/**
 * Merging a component's default classes with a caller's (ADR 0184, ADR 0211). Plain class strings don't override each other by
 * order in Tailwind, so a caller's width, height, padding, background or text size replaces the default of the same kind instead
 * of fighting it.
 *
 * Only a caller's plain class replaces anything ("sm:w-52" adds a breakpoint, it doesn't remove the phone width). It replaces the
 * plain default of its kind, and that kind's defaults for other screens too: a caller's `text-lg` removes `text-base` and
 * `lg:pointer-fine:text-sm`, so a default for one kind of screen never beats what the caller asked for. Defaults for a state
 * (hover, focus, disabled) stay: they're how the control behaves, not its size.
 */
const KINDS: RegExp[] = [/^w-/, /^min-h-/, /^h-/, /^size-/, /^px-/, /^py-/, /^bg-/, /^text-(?:xs|sm|base|lg|xl|[2-9]xl|label|body|title-4|\[)/];

/** Variants that choose a screen, not a state. */
const SCREEN = /^(?:sm|md|lg|xl|2xl|max-[^:]+|min-[^:]+|pointer-(?:fine|coarse|none)|any-pointer-[a-z]+|portrait|landscape|print)$/;

/** A class without its variants and important mark ("lg:pointer-fine:!text-sm" is "text-sm"), and whether its variants are all screens. */
function parts(c: string): { bare: string; screenOnly: boolean } {
  const segs = c.split(":");
  const bare = segs.pop()!.replace(/^!/, "");
  return { bare, screenOnly: segs.every((v) => SCREEN.test(v)) };
}

export function mergeClasses(defaults: readonly string[], extra: string): string {
  const mine = extra.split(/\s+/).filter(Boolean);
  const plain = mine.filter((c) => !c.includes(":")).map((c) => c.replace(/^!/, ""));
  const kept = defaults.filter((d) => {
    const { bare, screenOnly } = parts(d);
    return !(screenOnly && KINDS.some((k) => k.test(bare) && plain.some((c) => k.test(c))));
  });
  return [...kept, ...mine].join(" ");
}
