import Link from "next/link";
import type { ComponentProps } from "react";
import { mergeClasses } from "./merge";

type Variant = "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonVariant = Variant;
type Size = "md" | "sm" | "icon";

/**
 * Every button's look (ADR 0008, ADR 0211). `tap` gives it a 48px target on a touch screen (globals.css), so the pill can be the
 * size of what it says: 40px small, 44px medium, a 40px circle for an icon alone. They grow at the largest text sizes.
 */
const base =
  "tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium max-[18em]:whitespace-normal max-[18em]:py-2 max-[18em]:text-center transition-[background-color,border-color,color,transform,box-shadow] duration-[160ms] ease-standard active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-e1 hover:bg-primary-hover",
  accent: "bg-accent text-on-accent shadow-e1 hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink shadow-e1 hover:border-line-strong/50 hover:bg-canvas-2",
  // White with a dark outline: Apple's outlined style for Sign in with Apple, beside a primary button.
  outline: "border border-ink bg-surface text-ink shadow-e1 hover:bg-canvas-2",
  ghost: "text-ink-2 hover:bg-surface-raised hover:text-ink",
  danger: "bg-failed text-on-accent shadow-e1 hover:bg-failed/90",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 px-5 text-body",
  sm: "min-h-10 px-4 text-sm",
  // An icon alone; its name is its aria-label.
  icon: "size-10 shrink-0 px-0 text-sm",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = ""): string {
  return mergeClasses(`${base} ${variants[variant]} ${sizes[size]}`.split(" "), className);
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
