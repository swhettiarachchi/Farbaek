import { CompassIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { FOCUSED_TITLE } from "@/components/ui/titles";

export default function OfficeNotFound() {
  return (
    <main id="main" className="grid min-h-[70dvh] place-items-center px-4">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface text-ink-2 shadow-e1 ring-1 ring-line">
          <CompassIcon size={24} aria-hidden />
        </span>
        <h1 className={FOCUSED_TITLE}>There&apos;s nothing at this address</h1>
        <p className="text-body text-ink-2">The page may have moved, or you may not have access to it.</p>
        <Link href="/" className={buttonClasses("secondary", "sm", "mt-2")}>
          Go to the overview
        </Link>
      </div>
    </main>
  );
}
