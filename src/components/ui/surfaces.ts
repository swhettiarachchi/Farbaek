/**
 * Surfaces and rhythm (ADR 0211): phone sizes first, stepping up, as class strings the way `titles.ts` and `field.ts` are.
 * `tests/design/system.test.ts` keeps the hand-written copies these replaced from coming back.
 */

/** A page's sections: 24px apart on a phone or tablet, 32px on a large screen. */
export const PAGE_STACK = "grid gap-6 lg:gap-8";

/**
 * The double bezel (ADR 0008): a raised shell around an inner card. The shell's radius less its padding is the inner card's 20px
 * (26 less 6 on a phone, 28 less 8 from `sm`), so the curves stay concentric while a phone keeps 4px more on each side.
 */
export const BEZEL = "rounded-[1.625rem] bg-surface-raised/60 p-1.5 ring-1 ring-line sm:rounded-lg sm:p-2";
