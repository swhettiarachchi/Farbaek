import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "accent" | "secondary" | "ghost";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-[160ms] ease-standard active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-e1 hover:bg-primary/85",
  accent: "bg-accent text-on-accent shadow-e1 hover:brightness-110",
  secondary: "border border-line bg-surface text-ink shadow-e1 hover:border-line-strong/50 hover:bg-canvas-2",
  ghost: "text-ink-2 hover:bg-surface-raised hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "h-12 px-6 text-[15px]",
  sm: "h-10 px-4 text-sm",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
