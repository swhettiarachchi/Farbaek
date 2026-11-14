import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

/**
 * A plan card's one link (ADR 0197). It reads as a pill button, and its hit
 * area stretches over the whole card: the nearest `relative group` ancestor.
 * One link per card, so a keyboard stops once and a screen reader hears one
 * name. The pill answers the card's hover and press, since the stretched area
 * sits over it. Anything else clickable in the card needs `relative z-10`.
 */
export function PlanCardLink({ href, featured, label, planName, size = "sm" }: { href: string; featured: boolean; label: string; planName?: string; size?: "sm" | "md" }) {
  return (
    <Link href={href} className="block rounded-full after:absolute after:inset-0 after:content-['']">
      <span
        className={buttonClasses(
          featured ? "primary" : "secondary",
          size,
          `w-full group-active:scale-[0.98] ${featured ? "group-hover:bg-primary-hover" : "group-hover:border-line-strong"}`,
        )}
      >
        {label}
        {planName ? <span className="sr-only"> to {planName}</span> : null}
      </span>
    </Link>
  );
}
