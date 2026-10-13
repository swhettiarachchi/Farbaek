import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-[background-color,border-color,color,transform] duration-[140ms] ease-standard active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary/88",
  secondary: "border border-line-strong text-ink hover:bg-surface-sunken",
  ghost: "text-ink-2 hover:bg-surface-sunken hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[15px]",
  sm: "h-10 px-4 text-sm",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
