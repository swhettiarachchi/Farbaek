import type { ReactNode } from "react";
import { LEAD, SECTION_TITLE } from "@/components/ui/titles";

export function SectionHeading({ id, title, children }: { id: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-[44rem]">
      <h2 id={id} className={SECTION_TITLE}>
        {title}
      </h2>
      {children ? <p className={`mt-3 text-ink-2 sm:mt-4 ${LEAD}`}>{children}</p> : null}
    </div>
  );
}
