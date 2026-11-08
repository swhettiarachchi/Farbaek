import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonVariant = Variant;
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium max-[18em]:whitespace-normal max-[18em]:py-2 max-[18em]:text-center transition-[background-color,border-color,color,transform,box-shadow] duration-[160ms] ease-standard active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

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
  md: "min-h-12 px-6 text-[0.9375rem]",
  // 44px with a mouse, and 48px on touch, Google's size for primary controls (ADR 0171).
  sm: "min-h-11 px-4 text-sm pointer-coarse:min-h-12",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
