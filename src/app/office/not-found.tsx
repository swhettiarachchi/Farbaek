import { CompassIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function OfficeNotFound() {
  return (
    <main id="main" className="grid min-h-[70dvh] place-items-center px-4">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
          <CompassIcon size={24} aria-hidden />
        </span>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">There&apos;s nothing at this address</h1>
        <p className="text-[15px] text-ink-2">The page may have moved, or you may not have access to it.</p>
        <Link href="/" className={buttonClasses("secondary", "sm", "mt-2")}>
          Go to the overview
        </Link>
      </div>
    </main>
  );
}
